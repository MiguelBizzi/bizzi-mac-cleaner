use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use napi::bindgen_prelude::*;
use napi::threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode};
use napi::{Env, JsUndefined, Task};
use napi_derive::napi;

mod walk;

use walk::{directory_size as size_of, scan_largest_files as scan_files, scan_node_modules as scan_modules};

#[napi]
pub struct AbortFlag {
    inner: Arc<AtomicBool>,
}

#[napi]
impl AbortFlag {
    #[napi(factory)]
    pub fn create() -> Self {
        Self {
            inner: Arc::new(AtomicBool::new(false)),
        }
    }

    #[napi]
    pub fn abort(&self) {
        self.inner.store(true, Ordering::Relaxed);
    }
}

fn flag_from(abort: Option<&AbortFlag>) -> Arc<AtomicBool> {
    abort
        .map(|flag| flag.inner.clone())
        .unwrap_or_else(|| Arc::new(AtomicBool::new(false)))
}

pub struct DirSizeTask {
    path: String,
    abort: Arc<AtomicBool>,
}

impl Task for DirSizeTask {
    type Output = f64;
    type JsValue = f64;

    fn compute(&mut self) -> Result<Self::Output> {
        Ok(size_of(Path::new(&self.path), &self.abort) as f64)
    }

    fn resolve(&mut self, _env: Env, output: f64) -> Result<Self::JsValue> {
        Ok(output)
    }
}

#[napi(js_name = "directorySize")]
pub fn directory_size(path: String, abort: Option<&AbortFlag>) -> AsyncTask<DirSizeTask> {
    AsyncTask::new(DirSizeTask {
        path,
        abort: flag_from(abort),
    })
}

#[napi(object)]
pub struct NodeModuleHit {
    pub path: String,
    #[napi(js_name = "sizeBytes")]
    pub size_bytes: f64,
    #[napi(js_name = "mtimeMs")]
    pub mtime_ms: f64,
    pub stale: bool,
}

#[napi(object)]
pub struct LargeFileHit {
    pub path: String,
    #[napi(js_name = "sizeBytes")]
    pub size_bytes: f64,
    #[napi(js_name = "mtimeMs")]
    pub mtime_ms: f64,
}

pub struct ScanNodeModulesTask {
    root: String,
    stale_days: u32,
    abort: Arc<AtomicBool>,
    callback: ThreadsafeFunction<NodeModuleHit>,
}

impl Task for ScanNodeModulesTask {
    type Output = ();
    type JsValue = JsUndefined;

    fn compute(&mut self) -> Result<Self::Output> {
        let callback = self.callback.clone();
        scan_modules(Path::new(&self.root), self.stale_days, &self.abort, &|hit| {
            callback.call(
                Ok(NodeModuleHit {
                    path: hit.path.to_string_lossy().into_owned(),
                    size_bytes: hit.size as f64,
                    mtime_ms: hit.mtime_ms as f64,
                    stale: hit.stale,
                }),
                ThreadsafeFunctionCallMode::Blocking,
            );
        });
        Ok(())
    }

    fn resolve(&mut self, env: Env, _output: ()) -> Result<Self::JsValue> {
        env.get_undefined()
    }
}

#[napi(js_name = "scanNodeModules")]
pub fn scan_node_modules(
    root: String,
    stale_days: u32,
    callback: ThreadsafeFunction<NodeModuleHit>,
    abort: Option<&AbortFlag>,
) -> AsyncTask<ScanNodeModulesTask> {
    AsyncTask::new(ScanNodeModulesTask {
        root,
        stale_days,
        abort: flag_from(abort),
        callback,
    })
}

pub struct ScanLargestFilesTask {
    root: String,
    limit: u32,
    abort: Arc<AtomicBool>,
    callback: ThreadsafeFunction<LargeFileHit>,
}

impl Task for ScanLargestFilesTask {
    type Output = ();
    type JsValue = JsUndefined;

    fn compute(&mut self) -> Result<Self::Output> {
        let callback = self.callback.clone();
        scan_files(Path::new(&self.root), self.limit as usize, &self.abort, &|hit| {
            callback.call(
                Ok(LargeFileHit {
                    path: hit.path.to_string_lossy().into_owned(),
                    size_bytes: hit.size as f64,
                    mtime_ms: hit.mtime_ms as f64,
                }),
                ThreadsafeFunctionCallMode::Blocking,
            );
        });
        Ok(())
    }

    fn resolve(&mut self, env: Env, _output: ()) -> Result<Self::JsValue> {
        env.get_undefined()
    }
}

#[napi(js_name = "scanLargestFiles")]
pub fn scan_largest_files(
    root: String,
    limit: u32,
    callback: ThreadsafeFunction<LargeFileHit>,
    abort: Option<&AbortFlag>,
) -> AsyncTask<ScanLargestFilesTask> {
    AsyncTask::new(ScanLargestFilesTask {
        root,
        limit,
        abort: flag_from(abort),
        callback,
    })
}
