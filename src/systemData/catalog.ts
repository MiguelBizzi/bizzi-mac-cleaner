import { excludedBy, matchPattern } from "./match.js";
import type { SystemDataTarget } from "./types.js";

/**
 * The System Data taxonomy: every location we know about, with its safety level.
 * Patterns decide what may ever be deleted, so keep them conservative. The text shown to
 * the user lives in the locale files under sd.<id>.{label,why,regen,impact}.
 * Evidence for each row is in docs/system-data/README.md.
 */

const A = "https://support.apple.com/en-us/";
const SRC = {
  freeSpace: `${A}102624`,
  snapshots: `${A}102154`,
  iosBackups: `${A}108809`,
  appleIntelligence: `${A}121115`,
  containers: "https://developer.apple.com/videos/play/wwdc2023/10053/",
  groupContainers: "https://developer.apple.com/videos/play/wwdc2024/10123/",
  huggingface: "https://huggingface.co/docs/huggingface_hub/main/en/guides/manage-cache",
  ollama: "https://docs.ollama.com/faq",
  docker: "https://docs.docker.com/desktop/troubleshoot-and-support/faqs/macfaqs/",
  avd: "https://developer.android.com/studio/run/managing-avds",
  avdManager: "https://developer.android.com/tools/avdmanager",
  lmstudio: "https://lmstudio.ai/docs/app/advanced/import-model",
  verification: "https://github.com/MiguelBizzi/bizzi-mac-cleaner/blob/main/docs/system-data/README.md#verification-log",
} as const;

const XC = "Library/Developer/Xcode";
const AS = "Library/Application Support";
const CHROMIUM_CACHE_DIRS = [
  "Cache",
  "Code Cache",
  "GPUCache",
  "DawnCache",
  "DawnGraphiteCache",
  "DawnWebGPUCache",
  "Service Worker/CacheStorage",
  "CachedData",
  "CachedExtensionVSIXs",
];

export const TARGETS: readonly SystemDataTarget[] = [
  // ── user_caches ──────────────────────────────────────────────────────────
  {
    id: "caches.app",
    group: "user_caches",
    safety: "safe",
    patterns: ["Library/Caches/*"],
    exclude: ["com.apple.*", "Homebrew", "CocoaPods", "pip", "Yarn", "com.docker.docker", "Docker Desktop"],
    runningCheck: "bundleIdFolder",
    sources: [SRC.freeSpace],
  },
  {
    id: "caches.apple",
    group: "user_caches",
    safety: "review",
    patterns: ["Library/Caches/com.apple.*"],
    runningCheck: "bundleIdFolder",
    sources: [SRC.freeSpace],
  },
  {
    id: "caches.container",
    group: "user_caches",
    safety: "review",
    patterns: ["Library/Containers/*/Data/Library/Caches"],
    fda: { fromMacOS: "14" },
    runningCheck: "bundleIdFolder",
    sources: [SRC.containers],
  },
  {
    id: "caches.chromium_apps",
    group: "user_caches",
    safety: "safe",
    patterns: CHROMIUM_CACHE_DIRS.map((d) => `${AS}/*/${d}`),
    markerAnyOf: ["Local State", "Preferences"],
    runningCheck: "folderName",
    sources: [SRC.verification],
  },

  // ── logs ─────────────────────────────────────────────────────────────────
  {
    id: "logs.user",
    group: "logs",
    safety: "safe",
    patterns: ["Library/Logs/*"],
    sources: [SRC.freeSpace],
  },

  // ── web_data ─────────────────────────────────────────────────────────────
  { id: "web.http_storages", group: "web_data", safety: "review", patterns: ["Library/HTTPStorages"], sources: [SRC.verification] },
  { id: "web.webkit", group: "web_data", safety: "review", patterns: ["Library/WebKit"], sources: [SRC.verification] },
  {
    id: "web.safari_favicons",
    group: "web_data",
    safety: "safe",
    patterns: ["Library/Safari/Favicon Cache"],
    fda: "required",
    sources: [SRC.verification],
  },

  // ── developer ────────────────────────────────────────────────────────────
  { id: "dev.xcode_derived_data", group: "developer", safety: "safe", patterns: [`${XC}/DerivedData`], ownedBy: "xcode_derived_data", sources: [SRC.freeSpace] },
  { id: "dev.xcode_archives", group: "developer", safety: "review", patterns: [`${XC}/Archives`], ownedBy: "xcode_archives", sources: [SRC.verification] },
  { id: "dev.simulator_caches", group: "developer", safety: "safe", patterns: ["Library/Developer/CoreSimulator/Caches"], ownedBy: "simulator_caches", sources: [SRC.verification] },
  { id: "dev.simulator_devices", group: "developer", safety: "review", patterns: ["Library/Developer/CoreSimulator/Devices/<uuid>"], ownedBy: "simulator_caches", sources: [SRC.verification] },
  { id: "dev.npm", group: "developer", safety: "safe", patterns: [".npm/_cacache"], ownedBy: "npm_cache", sources: [SRC.verification] },
  { id: "dev.yarn", group: "developer", safety: "safe", patterns: ["Library/Caches/Yarn"], ownedBy: "yarn_cache", sources: [SRC.verification] },
  { id: "dev.pnpm", group: "developer", safety: "safe", patterns: ["Library/pnpm/store"], ownedBy: "pnpm_cache", sources: [SRC.verification] },
  { id: "dev.brew", group: "developer", safety: "safe", patterns: ["Library/Caches/Homebrew"], ownedBy: "brew_cache", sources: [SRC.verification] },
  { id: "dev.cocoapods", group: "developer", safety: "safe", patterns: ["Library/Caches/CocoaPods"], ownedBy: "cocoapods_cache", sources: [SRC.verification] },
  { id: "dev.gradle", group: "developer", safety: "safe", patterns: [".gradle/caches"], ownedBy: "gradle_cache", sources: [SRC.verification] },
  { id: "dev.pip", group: "developer", safety: "safe", patterns: ["Library/Caches/pip"], ownedBy: "pip_cache", sources: [SRC.verification] },
  { id: "dev.cargo", group: "developer", safety: "safe", patterns: [".cargo/registry/cache", ".cargo/registry/src"], ownedBy: "cargo_cache", sources: [SRC.verification] },
  {
    id: "dev.docker_caches",
    group: "developer",
    safety: "safe",
    patterns: [
      "Library/Caches/com.docker.docker",
      "Library/Caches/Docker Desktop",
      // Mirrors the docker_unused rule in core/deletePolicy.ts.
      "Library/Containers/com.docker.docker/Data/log",
    ],
    ownedBy: "docker_unused",
    sources: [SRC.docker],
  },
  {
    id: "dev.device_support",
    group: "developer",
    safety: "review",
    patterns: ["iOS", "watchOS", "tvOS", "visionOS"].map((os) => `${XC}/${os} DeviceSupport/*`),
    sources: [SRC.verification],
  },
  { id: "dev.xcode_previews", group: "developer", safety: "review", patterns: [`${XC}/UserData/Previews`], sources: [SRC.verification] },
  { id: "dev.xcode_products", group: "developer", safety: "safe", patterns: [`${XC}/Products`], sources: [SRC.verification] },
  { id: "dev.xcode_doc_cache", group: "developer", safety: "safe", patterns: [`${XC}/DocumentationCache`], sources: [SRC.verification] },
  { id: "dev.playground_devices", group: "developer", safety: "safe", patterns: ["Library/Developer/XCPGDevices"], sources: [SRC.verification] },
  {
    id: "dev.simulator_runtimes",
    group: "developer",
    safety: "advisory",
    patterns: [],
    commands: ["xcrun simctl runtime list", "xcrun simctl runtime delete <identifier>", "xcrun simctl delete unavailable"],
    sources: [SRC.verification],
  },
  { id: "dev.android_system_images", group: "developer", safety: "review", patterns: ["Library/Android/sdk/system-images/*/*/*"], sources: [SRC.avd] },
  {
    id: "dev.android_avd",
    group: "developer",
    safety: "review",
    patterns: [".android/avd/*.avd"],
    runningCheck: { names: ["qemu-system-aarch64", "qemu-system-x86_64"] },
    sources: [SRC.avd, SRC.avdManager],
  },
  { id: "dev.go_modcache", group: "developer", safety: "advisory", patterns: ["go/pkg/mod"], commands: ["go clean -modcache"], sources: [SRC.verification] },
  { id: "dev.uv_cache", group: "developer", safety: "safe", patterns: [".cache/uv"], sources: [SRC.verification] },
  { id: "dev.precommit_cache", group: "developer", safety: "safe", patterns: [".cache/pre-commit"], sources: [SRC.verification] },

  // ── ai_models ────────────────────────────────────────────────────────────
  {
    id: "ai.huggingface",
    group: "ai_models",
    safety: "review",
    patterns: [".cache/huggingface/hub/models--*", ".cache/huggingface/hub/datasets--*"],
    sources: [SRC.huggingface],
  },
  {
    id: "ai.lmstudio",
    group: "ai_models",
    safety: "review",
    patterns: [".lmstudio/models/*/*", ".cache/lm-studio/models/*/*"],
    runningCheck: { names: ["LM Studio"] },
    sources: [SRC.lmstudio],
  },
  { id: "ai.torch_hub", group: "ai_models", safety: "review", patterns: [".cache/torch/hub"], sources: [SRC.verification] },
  { id: "ai.whisper", group: "ai_models", safety: "review", patterns: [".cache/whisper"], sources: [SRC.verification] },
  {
    id: "ai.ollama",
    group: "ai_models",
    safety: "advisory",
    patterns: [".ollama/models"],
    commands: ["ollama list", "ollama rm <model>"],
    sources: [SRC.ollama],
  },
  {
    // The 15.1 start version is unverified (see the expert guide); the copy hedges accordingly.
    id: "ai.apple_intelligence",
    group: "ai_models",
    safety: "advisory",
    patterns: [],
    macos: { min: "15.1" },
    sources: [SRC.appleIntelligence],
  },

  // ── device_backups ───────────────────────────────────────────────────────
  {
    id: "backups.ios",
    group: "device_backups",
    safety: "review",
    patterns: [`${AS}/MobileSync/Backup/*`],
    fda: "required",
    sources: [SRC.iosBackups],
  },
  {
    id: "backups.ipsw",
    group: "device_backups",
    safety: "safe",
    patterns: ["Library/iTunes/iPhone Software Updates/*.ipsw", "Library/iTunes/iPad Software Updates/*.ipsw"],
    sources: [SRC.freeSpace],
  },

  // ── snapshots ────────────────────────────────────────────────────────────
  {
    id: "snapshots.tm_local",
    group: "snapshots",
    safety: "advisory",
    patterns: [],
    // Displayed verbatim only, never executed.
    commands: ["tmutil listlocalsnapshots /", "sudo tmutil deletelocalsnapshots <date>"],
    sources: [SRC.snapshots, SRC.verification],
  },

  // ── virtualization ───────────────────────────────────────────────────────
  {
    id: "vm.docker_raw",
    group: "virtualization",
    safety: "advisory",
    patterns: ["Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw"],
    commands: ["docker system df", "docker system prune"],
    sources: [SRC.docker],
  },
  { id: "vm.colima", group: "virtualization", safety: "advisory", patterns: [".colima"], commands: ["colima list", "colima delete <profile>"], sources: [SRC.verification] },

  // ── mail_messages ────────────────────────────────────────────────────────
  {
    id: "mail.downloads",
    group: "mail_messages",
    safety: "safe",
    patterns: ["Library/Containers/com.apple.mail/Data/Library/Mail Downloads"],
    fda: "required",
    runningCheck: { names: ["Mail"] },
    sources: [SRC.verification],
  },
  // Sits inside never.personal_data on purpose: advisories are measured, never deleted.
  { id: "messages.attachments", group: "mail_messages", safety: "advisory", patterns: ["Library/Messages/Attachments"], fda: "required", sources: [SRC.freeSpace] },

  // ── system_managed ───────────────────────────────────────────────────────
  // Measured from `getconf DARWIN_USER_CACHE_DIR` / `DARWIN_USER_TEMP_DIR`, so no pattern.
  { id: "sys.var_folders", group: "system_managed", safety: "advisory", patterns: [], sources: [SRC.verification] },

  // ── never ────────────────────────────────────────────────────────────────
  {
    id: "never.cloud_files",
    group: "user_caches",
    safety: "never",
    patterns: ["Library/Mobile Documents/**", "Library/CloudStorage/**"],
    sources: [SRC.verification],
  },
  {
    id: "never.identity_sync",
    group: "user_caches",
    safety: "never",
    patterns: [
      "Library/Caches/com.apple.bird/**",
      "Library/Caches/CloudKit/**",
      "Library/Caches/com.apple.akd/**",
      "Library/Caches/com.apple.amsaccountsd/**",
      "Library/Caches/com.apple.AuthenticationServices*/**",
      "Library/Caches/FamilyCircle/**",
      "Library/Caches/com.apple.HomeKit/**",
      "Library/Caches/PassKit/**",
      "Library/Caches/com.apple.passd/**",
      "Library/Caches/com.apple.iCloudHelper/**",
    ],
    sources: [SRC.verification],
  },
  {
    id: "never.in_flight",
    group: "user_caches",
    safety: "never",
    patterns: ["Library/Caches/com.apple.nsurlsessiond/**", "Library/Caches/TemporaryItems/**"],
    sources: [SRC.verification],
  },
  {
    id: "never.personal_data",
    group: "mail_messages",
    safety: "never",
    patterns: [
      "Library/Messages/**",
      "Library/Mail/**",
      "Library/Photos/**",
      "Library/Calendars/**",
      `${AS}/AddressBook/**`,
      "Library/Keychains/**",
      "Library/Cookies/**",
      "Library/Accounts/**",
      "Library/Preferences/**",
    ],
    sources: [SRC.verification],
  },
  { id: "never.group_containers", group: "user_caches", safety: "never", patterns: ["Library/Group Containers/**"], sources: [SRC.groupContainers] },
  {
    id: "never.vm_internals",
    group: "virtualization",
    safety: "never",
    patterns: [
      "Library/Containers/com.docker.docker/Data/vms/**",
      ".ollama/models/blobs/**",
      ".ollama/models/manifests/**",
      ".colima/**",
    ],
    sources: [SRC.docker, SRC.ollama],
  },
  {
    id: "never.roots",
    group: "system_managed",
    safety: "never",
    // Exact (no "**"): parents of cleanable items are never items themselves.
    patterns: [
      "Library",
      "Library/Caches",
      AS,
      "Library/Containers",
      `${AS}/MobileSync`,
      `${AS}/MobileSync/Backup`,
      "Library/Developer/CoreSimulator/Devices",
    ],
    sources: [SRC.verification],
  },
  {
    id: "never.os",
    group: "system_managed",
    safety: "never",
    patterns: [
      "/System/**",
      "/usr/lib/**",
      "/Library/Extensions/**",
      "/Library/Apple/**",
      "/private/var/vm/**",
      "/private/var/folders/**",
      "/.Spotlight-V100/**",
      "/private/var/MobileAsset/**",
      "/Library/Updates/**",
      "/Library/Developer/CoreSimulator/Volumes/**",
      "/Library/Developer/CoreSimulator/Images/**",
    ],
    sources: [SRC.freeSpace],
  },
];

export function targetById(id: string): SystemDataTarget | undefined {
  return TARGETS.find((t) => t.id === id);
}

/** First safe/review target (not owned by another scanner) whose relative pattern matches `rel`. */
export function findDeletableTarget(rel: string[]): SystemDataTarget | undefined {
  return TARGETS.find(
    (t) =>
      (t.safety === "safe" || t.safety === "review") &&
      !t.ownedBy &&
      t.patterns.some((p) => !p.startsWith("/") && matchPattern(p, rel) && !excludedBy(p, rel, t.exclude)),
  );
}

/** First never target matching: relative patterns against `rel`, absolute ones against `absolute`. */
export function findNeverTarget(rel: string[], absolute: string): SystemDataTarget | undefined {
  const absSegs = absolute.split("/").filter((s) => s !== "");
  return TARGETS.find(
    (t) =>
      t.safety === "never" &&
      t.patterns.some((p) => matchPattern(p, p.startsWith("/") ? absSegs : rel)),
  );
}
