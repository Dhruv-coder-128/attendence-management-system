// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(target_os = "windows")]
fn cleanup_stale_webview_locks() {
    if let Ok(local_appdata) = std::env::var("LOCALAPPDATA") {
        let eb_dir = std::path::PathBuf::from(local_appdata)
            .join("com.sms.studentmanagementsystem")
            .join("EBWebView");
        if eb_dir.exists() {
            // Delete root Chromium lockfile and leveldb locks if not actively held
            let _ = std::fs::remove_file(eb_dir.join("lockfile"));
            let _ = std::fs::remove_file(eb_dir.join("Default").join("LOCK"));
            let _ = std::fs::remove_file(eb_dir.join("Default").join("Local Storage").join("leveldb").join("LOCK"));
            let _ = std::fs::remove_file(eb_dir.join("Default").join("Session Storage").join("LOCK"));
            let _ = std::fs::remove_file(eb_dir.join("Default").join("IndexedDB").join("http_tauri.localhost_0.indexeddb.leveldb").join("LOCK"));
        }
    }
}

fn main() {
    std::panic::set_hook(Box::new(|info| {
        if let Ok(dir) = std::env::var("TEMP") {
            let path = format!("{}\\sms_app_panic.log", dir);
            let payload = if let Some(s) = info.payload().downcast_ref::<&str>() {
                s.to_string()
            } else if let Some(s) = info.payload().downcast_ref::<String>() {
                s.clone()
            } else {
                format!("{:?}", info)
            };
            let loc = info.location().map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column())).unwrap_or_default();
            let _ = std::fs::write(path, format!("SMS App Panic: {} at {}", payload, loc));
        }
    }));

    #[cfg(target_os = "windows")]
    cleanup_stale_webview_locks();

    app_lib::run();
}
