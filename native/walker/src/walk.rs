use std::collections::HashSet;
use std::ffi::{CString, OsStr};
use std::fs;
use std::os::unix::ffi::OsStrExt;
use std::os::unix::fs::MetadataExt;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use rayon::prelude::*;

const ATTR_BIT_MAP_COUNT: u16 = 5;
const ATTR_CMN_NAME: u32 = 0x0000_0001;
const ATTR_CMN_OBJTYPE: u32 = 0x0000_0008;
const ATTR_CMN_MODTIME: u32 = 0x0000_0400;
const ATTR_CMN_RETURNED_ATTRS: u32 = 0x8000_0000;
const ATTR_FILE_DATALENGTH: u32 = 0x0000_0200;
const FSOPT_PACK_INVAL_ATTRS: u64 = 0x0000_0008;

const VDIR: u32 = 2;
const VLNK: u32 = 5;

const DIR_SIZE_SKIP: &[&str] = &[".git", "File Provider Storage"];

const NODE_MODULES_SKIP: &[&str] = &[
    ".Trash",
    ".git",
    "Library",
    ".npm",
    ".cache",
    ".local",
    "Pictures",
    "Movies",
    "Music",
    "Applications",
    "System",
];

/// Directory "packages" (macOS bundles / libraries). Removing one inner file
/// corrupts the whole package, so the largest-files scan never descends into them.
const PACKAGE_EXTENSIONS: &[&str] = &[
    "app", "photoslibrary", "sparsebundle", "utm", "fcpbundle", "logicx", "tvlibrary",
    "imovielibrary", "musiclibrary", "band", "framework", "bundle", "vmwarevm", "pvm",
    "vbox", "xcodeproj", "xcworkspace", "playground", "rtfd", "pages", "numbers", "key",
    "scriv", "lrdata", "cocatalog", "sketchlibrary", "photolibrary", "aplibrary", "theater",
    "plugin", "kext", "xcarchive", "xcassets",
];

fn is_package_name(name: &str) -> bool {
    match name.rsplit_once('.') {
        Some((stem, ext)) if !stem.is_empty() => {
            let ext = ext.to_ascii_lowercase();
            PACKAGE_EXTENSIONS.contains(&ext.as_str())
        }
        _ => false,
    }
}

const LARGEST_FILES_SKIP: &[&str] = &[
    ".Trash",
    ".git",
    "node_modules",
    "Library",
    ".ssh",
    ".gnupg",
    ".aws",
    ".kube",
    "Applications",
    "System",
];

#[derive(Clone)]
struct Listed {
    name: String,
    path: PathBuf,
    is_dir: bool,
    is_symlink: bool,
    size: u64,
    mtime_ms: i64,
}

#[repr(C)]
struct AttrList {
    bitmapcount: u16,
    reserved: u16,
    commonattr: u32,
    volattr: u32,
    dirattr: u32,
    fileattr: u32,
    forkattr: u32,
}

fn skip_set(names: &[&str]) -> HashSet<String> {
    names.iter().map(|s| (*s).to_string()).collect()
}

fn aborted(flag: &AtomicBool) -> bool {
    flag.load(Ordering::Relaxed)
}

/// One `getattrlistbulk` pass. Logical sizes match `lstat` `st_size` for files.
fn list_dir(dir: &Path) -> std::io::Result<Vec<Listed>> {
    let c_path = CString::new(dir.as_os_str().as_bytes())
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::InvalidInput, "path contains NUL"))?;
    let fd = unsafe {
        libc::open(
            c_path.as_ptr(),
            libc::O_RDONLY | libc::O_DIRECTORY | libc::O_CLOEXEC,
        )
    };
    if fd < 0 {
        return Err(std::io::Error::last_os_error());
    }

    let mut attr_list = AttrList {
        bitmapcount: ATTR_BIT_MAP_COUNT,
        reserved: 0,
        commonattr: ATTR_CMN_RETURNED_ATTRS | ATTR_CMN_NAME | ATTR_CMN_OBJTYPE | ATTR_CMN_MODTIME,
        volattr: 0,
        dirattr: 0,
        fileattr: ATTR_FILE_DATALENGTH,
        forkattr: 0,
    };

    let mut buf = vec![0u8; 64 * 1024];
    let mut out = Vec::new();
    let result = (|| {
        loop {
            let count = unsafe {
                libc::getattrlistbulk(
                    fd,
                    &mut attr_list as *mut AttrList as *mut libc::c_void,
                    buf.as_mut_ptr() as *mut libc::c_void,
                    buf.len(),
                    FSOPT_PACK_INVAL_ATTRS,
                )
            };
            if count < 0 {
                return Err(std::io::Error::last_os_error());
            }
            if count == 0 {
                return Ok(());
            }
            let mut offset = 0usize;
            for _ in 0..count {
                if offset + 4 > buf.len() {
                    return Err(std::io::Error::other("short getattrlistbulk record"));
                }
                let length = u32::from_ne_bytes(buf[offset..offset + 4].try_into().unwrap()) as usize;
                if length < 4 || offset + length > buf.len() {
                    return Err(std::io::Error::other("invalid getattrlistbulk record length"));
                }
                let record = &buf[offset..offset + length];
                if let Some(entry) = parse_record(dir, record)? {
                    out.push(entry);
                }
                offset += length;
            }
        }
    })();
    unsafe { libc::close(fd) };
    result.map(|_| out)
}

fn parse_record(dir: &Path, record: &[u8]) -> std::io::Result<Option<Listed>> {
    // length + attribute_set (5 × u32) + name attrreference.
    if record.len() < 4 + 20 + 8 {
        return Err(std::io::Error::other("record too small"));
    }
    let name_ref_at = 4 + 20;
    let name_delta = i32::from_ne_bytes(record[name_ref_at..name_ref_at + 4].try_into().unwrap());
    let name_len = u32::from_ne_bytes(record[name_ref_at + 4..name_ref_at + 8].try_into().unwrap()) as usize;
    if name_delta < 0 || name_len == 0 {
        return Ok(None);
    }
    let name_at = name_ref_at + name_delta as usize;
    if name_at + name_len > record.len() {
        return Err(std::io::Error::other("name outside record"));
    }
    let name_bytes = &record[name_at..name_at + name_len];
    let name_bytes = name_bytes.strip_suffix(&[0]).unwrap_or(name_bytes);
    let name = String::from_utf8_lossy(name_bytes).into_owned();
    if name.is_empty() || name == "." || name == ".." {
        return Ok(None);
    }

    // getattrlist packs each attribute on a 4-byte boundary, including timespec.
    let mut cursor = (name_ref_at + 8 + 3) & !3;
    if cursor + 4 > record.len() {
        return Err(std::io::Error::other("missing object type"));
    }
    let objtype = u32::from_ne_bytes(record[cursor..cursor + 4].try_into().unwrap());
    cursor = (cursor + 4 + 3) & !3;
    if cursor + 16 > record.len() {
        return Err(std::io::Error::other("missing mtime"));
    }
    let sec = i64::from_ne_bytes(record[cursor..cursor + 8].try_into().unwrap());
    let nsec = i64::from_ne_bytes(record[cursor + 8..cursor + 16].try_into().unwrap());
    cursor = (cursor + 16 + 3) & !3;
    let mut size = 0u64;
    if cursor + 8 <= record.len() {
        let len = i64::from_ne_bytes(record[cursor..cursor + 8].try_into().unwrap());
        if len > 0 {
            size = len as u64;
        }
    }

    let is_symlink = objtype == VLNK;
    let is_dir = objtype == VDIR && !is_symlink;
    let path = dir.join(OsStr::from_bytes(name_bytes));
    if is_symlink {
        if let Ok(meta) = fs::symlink_metadata(&path) {
            size = meta.size();
        }
    }

    Ok(Some(Listed {
        name,
        path,
        is_dir,
        is_symlink,
        size,
        mtime_ms: sec.saturating_mul(1000).saturating_add(nsec / 1_000_000),
    }))
}

fn is_denied(err: &std::io::Error) -> bool {
    matches!(
        err.kind(),
        std::io::ErrorKind::PermissionDenied | std::io::ErrorKind::NotFound
    ) || err.raw_os_error() == Some(libc::EACCES)
        || err.raw_os_error() == Some(libc::EPERM)
        || err.raw_os_error() == Some(libc::ENOENT)
}

/// Logical byte size. Skips `.git` and `File Provider Storage` (fileproviderd
/// mounts that time out under CoreSimulator). Does not follow symlinks.
/// Missing or unreadable paths contribute 0.
pub fn directory_size(path: &Path, abort: &AtomicBool) -> u64 {
    if aborted(abort) {
        return 0;
    }
    let meta = match fs::symlink_metadata(path) {
        Ok(meta) => meta,
        Err(_) => return 0,
    };
    if !meta.is_dir() {
        return meta.size();
    }
    size_tree(path, abort)
}

fn size_tree(dir: &Path, abort: &AtomicBool) -> u64 {
    if aborted(abort) {
        return 0;
    }
    let entries = match list_dir(dir) {
        Ok(entries) => entries,
        Err(err) if is_denied(&err) => return 0,
        Err(_) => return 0,
    };
    let mut files = 0u64;
    let mut subdirs = Vec::new();
    for entry in entries {
        if DIR_SIZE_SKIP.contains(&entry.name.as_str()) {
            continue;
        }
        if entry.is_dir && !entry.is_symlink {
            subdirs.push(entry.path);
        } else if !entry.is_dir {
            files += entry.size;
        }
    }
    let nested: u64 = subdirs.par_iter().map(|path| size_tree(path, abort)).sum();
    files + nested
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NodeModuleHit {
    pub path: PathBuf,
    pub size: u64,
    pub mtime_ms: i64,
    pub stale: bool,
}

fn activity_mtime_ms(project_root: &Path) -> i64 {
    let mut latest = 0i64;
    for candidate in [
        project_root.join("package.json"),
        project_root.join(".git").join("HEAD"),
        project_root.to_path_buf(),
    ] {
        if let Ok(meta) = fs::symlink_metadata(&candidate) {
            if let Ok(modified) = meta.modified() {
                latest = latest.max(mtime_ms(modified));
            }
        }
    }
    latest
}

fn mtime_ms(time: SystemTime) -> i64 {
    time.duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn is_stale(mtime_ms: i64, stale_days: u32) -> bool {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    let days = (now - mtime_ms).div_euclid(86_400_000);
    days >= i64::from(stale_days)
}

pub fn scan_node_modules(
    root: &Path,
    stale_days: u32,
    abort: &AtomicBool,
    on_item: &(dyn Fn(NodeModuleHit) + Sync),
) {
    if aborted(abort) {
        return;
    }
    let skip = skip_set(NODE_MODULES_SKIP);
    walk_node_modules(root, stale_days, &skip, abort, on_item);
}

fn walk_node_modules(
    dir: &Path,
    stale_days: u32,
    skip: &HashSet<String>,
    abort: &AtomicBool,
    on_item: &(dyn Fn(NodeModuleHit) + Sync),
) {
    if aborted(abort) {
        return;
    }
    let entries = match list_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return,
    };
    let mut subdirs = Vec::new();
    for entry in entries {
        if skip.contains(&entry.name) || entry.is_symlink {
            continue;
        }
        if entry.name == "node_modules" && entry.is_dir {
            let size = directory_size(&entry.path, abort);
            if size == 0 || aborted(abort) {
                continue;
            }
            let mtime_ms = activity_mtime_ms(dir);
            on_item(NodeModuleHit {
                path: entry.path,
                size,
                mtime_ms,
                stale: is_stale(mtime_ms, stale_days),
            });
            continue;
        }
        if entry.is_dir {
            subdirs.push(entry.path);
        }
    }
    subdirs.par_iter().for_each(|path| {
        walk_node_modules(path, stale_days, skip, abort, on_item);
    });
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LargeFileHit {
    pub path: PathBuf,
    pub size: u64,
    pub mtime_ms: i64,
}

pub fn scan_largest_files(
    root: &Path,
    limit: usize,
    abort: &AtomicBool,
    on_item: &(dyn Fn(LargeFileHit) + Sync),
) {
    if limit == 0 || aborted(abort) {
        return;
    }
    let heap = Mutex::new(MinHeap::new(limit));
    let skip = skip_set(LARGEST_FILES_SKIP);
    walk_largest(root, &skip, abort, &heap, on_item);
}

struct MinHeap {
    limit: usize,
    items: Vec<LargeFileHit>,
}

impl MinHeap {
    fn new(limit: usize) -> Self {
        Self {
            limit,
            items: Vec::with_capacity(limit),
        }
    }

    fn min_size(&self) -> u64 {
        self.items.first().map(|item| item.size).unwrap_or(0)
    }

    /// True when `file` enters the heap. Files at or below the current minimum
    /// are ignored once the heap is full, matching the JavaScript scanner.
    fn push(&mut self, file: LargeFileHit) -> bool {
        if self.items.len() >= self.limit && file.size <= self.min_size() {
            return false;
        }
        self.items.push(file);
        self.items.sort_by_key(|item| item.size);
        if self.items.len() > self.limit {
            self.items.remove(0);
        }
        true
    }
}

fn walk_largest(
    dir: &Path,
    skip: &HashSet<String>,
    abort: &AtomicBool,
    heap: &Mutex<MinHeap>,
    on_item: &(dyn Fn(LargeFileHit) + Sync),
) {
    if aborted(abort) {
        return;
    }
    let entries = match list_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return,
    };
    let mut subdirs = Vec::new();
    for entry in entries {
        if skip.contains(&entry.name) || entry.is_symlink {
            continue;
        }
        if entry.is_dir {
            if is_package_name(&entry.name) {
                continue;
            }
            subdirs.push(entry.path);
            continue;
        }
        let hit = LargeFileHit {
            path: entry.path,
            size: entry.size,
            mtime_ms: entry.mtime_ms,
        };
        let entered = heap.lock().expect("largest-file heap").push(hit.clone());
        if entered {
            on_item(hit);
        }
    }
    subdirs.par_iter().for_each(|path| {
        walk_largest(path, skip, abort, heap, on_item);
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::{symlink, PermissionsExt};
    use std::sync::Mutex;
    use std::time::{Duration, SystemTime};

    fn temp_dir() -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "bizzi-walker-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }

    struct Temp(PathBuf);
    impl Drop for Temp {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn directory_size_sums_logical_bytes_and_skips_git() {
        let tmp = Temp(temp_dir());
        fs::create_dir_all(tmp.0.join("nested")).unwrap();
        fs::write(tmp.0.join("a.txt"), "aaaa").unwrap();
        fs::write(tmp.0.join("nested").join("b.txt"), "bbbbbb").unwrap();
        fs::create_dir_all(tmp.0.join(".git")).unwrap();
        fs::write(tmp.0.join(".git").join("HEAD"), "x".repeat(100)).unwrap();
        let abort = AtomicBool::new(false);
        assert_eq!(directory_size(&tmp.0, &abort), 10);
    }

    #[test]
    fn directory_size_does_not_follow_symlinks() {
        let tmp = Temp(temp_dir());
        fs::write(tmp.0.join("real.txt"), "x".repeat(50)).unwrap();
        symlink("real.txt", tmp.0.join("link.txt")).unwrap();
        let abort = AtomicBool::new(false);
        let size = directory_size(&tmp.0, &abort);
        let link_len = fs::symlink_metadata(tmp.0.join("link.txt")).unwrap().size();
        assert_eq!(size, 50 + link_len);
        assert!(link_len < 50);
    }

    #[test]
    fn directory_size_skips_unreadable_directories() {
        let tmp = Temp(temp_dir());
        fs::write(tmp.0.join("ok.txt"), "ok").unwrap();
        let secret = tmp.0.join("secret");
        fs::create_dir(&secret).unwrap();
        fs::write(secret.join("hidden.txt"), "nope").unwrap();
        let mut perms = fs::metadata(&secret).unwrap().permissions();
        perms.set_mode(0);
        fs::set_permissions(&secret, perms).unwrap();
        let abort = AtomicBool::new(false);
        let size = directory_size(&tmp.0, &abort);
        let mut restore = fs::metadata(&secret).unwrap().permissions();
        restore.set_mode(0o755);
        fs::set_permissions(&secret, restore).unwrap();
        assert_eq!(size, 2);
    }

    #[test]
    fn directory_size_skips_file_provider_storage() {
        let tmp = Temp(temp_dir());
        fs::write(tmp.0.join("local.txt"), "abcd").unwrap();
        let provider = tmp.0.join("File Provider Storage");
        fs::create_dir(&provider).unwrap();
        fs::write(provider.join("cloud.bin"), "x".repeat(100)).unwrap();
        let abort = AtomicBool::new(false);
        assert_eq!(directory_size(&tmp.0, &abort), 4);
    }

    #[test]
    fn node_modules_are_not_descended_and_excluded_names_are_skipped() {
        let tmp = Temp(temp_dir());
        let project = tmp.0.join("app");
        fs::create_dir_all(project.join("node_modules").join("pkg")).unwrap();
        fs::write(project.join("package.json"), "{}").unwrap();
        fs::write(project.join("node_modules").join("pkg").join("index.js"), "xyz").unwrap();
        fs::create_dir_all(project.join("node_modules").join("pkg").join("node_modules")).unwrap();
        fs::write(
            project.join("node_modules").join("pkg").join("node_modules").join("inner.js"),
            "inner",
        )
        .unwrap();
        let library = tmp.0.join("Library").join("app").join("node_modules");
        fs::create_dir_all(&library).unwrap();
        fs::write(library.join("skip.js"), "no").unwrap();

        let hits = Mutex::new(Vec::new());
        let abort = AtomicBool::new(false);
        scan_node_modules(&tmp.0, 30, &abort, &|hit| {
            hits.lock().unwrap().push(hit);
        });
        let hits = hits.lock().unwrap();
        assert_eq!(hits.len(), 1);
        assert!(hits[0].path.ends_with("app/node_modules"));
        assert_eq!(hits[0].size, 3 + 5);
    }

    #[test]
    fn largest_files_reports_only_heap_entries_outside_excluded_dirs() {
        let tmp = Temp(temp_dir());
        fs::write(tmp.0.join("small.txt"), "s".repeat(10)).unwrap();
        fs::create_dir_all(tmp.0.join("Documents")).unwrap();
        fs::write(tmp.0.join("Documents").join("dump.bin"), "d".repeat(80)).unwrap();
        fs::write(tmp.0.join("mid.bin"), "m".repeat(50)).unwrap();
        fs::create_dir_all(tmp.0.join(".ssh")).unwrap();
        fs::write(tmp.0.join(".ssh").join("id_rsa"), "k".repeat(200)).unwrap();
        fs::create_dir_all(tmp.0.join("node_modules")).unwrap();
        fs::write(tmp.0.join("node_modules").join("pkg.js"), "n".repeat(200)).unwrap();

        let hits = Mutex::new(Vec::new());
        let abort = AtomicBool::new(false);
        scan_largest_files(&tmp.0, 2, &abort, &|hit| {
            hits.lock().unwrap().push(hit);
        });
        let hits = hits.lock().unwrap();
        assert!(hits.iter().all(|hit| !hit.path.components().any(|c| {
            c.as_os_str() == ".ssh" || c.as_os_str() == "node_modules"
        })));
        assert!(hits.iter().any(|hit| hit.path.ends_with("dump.bin")));
        assert!(hits.len() >= 2);
        assert!(hits.len() <= 3);
        assert!(hits.iter().all(|hit| hit.size >= 10));
    }

    #[test]
    fn abort_stops_the_walk() {
        let tmp = Temp(temp_dir());
        fs::create_dir_all(tmp.0.join("a").join("b")).unwrap();
        fs::write(tmp.0.join("a").join("b").join("c.txt"), "hello").unwrap();
        let abort = AtomicBool::new(true);
        assert_eq!(directory_size(&tmp.0, &abort), 0);
        let hits = Mutex::new(Vec::new());
        scan_node_modules(&tmp.0, 30, &abort, &|hit| {
            hits.lock().unwrap().push(hit);
        });
        scan_largest_files(&tmp.0, 10, &abort, &|hit| {
            hits.lock().unwrap().push(NodeModuleHit {
                path: hit.path,
                size: hit.size,
                mtime_ms: hit.mtime_ms,
                stale: false,
            });
        });
        assert!(hits.lock().unwrap().is_empty());
    }

    #[test]
    fn stale_flag_follows_project_activity() {
        let tmp = Temp(temp_dir());
        let project = tmp.0.join("old");
        fs::create_dir_all(project.join("node_modules")).unwrap();
        fs::write(project.join("package.json"), "{}").unwrap();
        fs::write(project.join("node_modules").join("a.js"), "abcd").unwrap();
        let old = SystemTime::now() - Duration::from_secs(60 * 24 * 60 * 60);
        let file = project.join("package.json");
        fs::File::options()
            .write(true)
            .open(&file)
            .unwrap()
            .set_modified(old)
            .unwrap();
        fs::File::options()
            .read(true)
            .open(&project)
            .unwrap()
            .set_modified(old)
            .unwrap();

        let hits = Mutex::new(Vec::new());
        let abort = AtomicBool::new(false);
        scan_node_modules(&tmp.0, 30, &abort, &|hit| {
            hits.lock().unwrap().push(hit);
        });
        let hits = hits.lock().unwrap();
        assert_eq!(hits.len(), 1);
        assert!(hits[0].stale);
        assert_eq!(hits[0].size, 4);
    }
}

#[cfg(test)]
mod package_tests {
    use super::is_package_name;

    #[test]
    fn detects_packages() {
        assert!(is_package_name("Photos Library.photoslibrary"));
        assert!(is_package_name("Foo.APP"));
        assert!(!is_package_name("movie.mov"));
        assert!(!is_package_name(".app"));
    }
}
