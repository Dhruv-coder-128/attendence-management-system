// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(target_os = "windows")]
fn cleanup_zombie_webview_processes() {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let _ = std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-WindowStyle",
            "Hidden",
            "-Command",
            "Get-CimInstance Win32_Process -Filter \"Name = 'msedgewebview2.exe'\" | Where-Object { $_.CommandLine -like '*com.sms.studentmanagementsystem*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .status();
}

#[cfg(target_os = "windows")]
fn cleanup_stale_webview_locks() {
    if let Ok(local_appdata) = std::env::var("LOCALAPPDATA") {
        let eb_dir = std::path::PathBuf::from(local_appdata)
            .join("com.sms.studentmanagementsystem")
            .join("EBWebView");
        if eb_dir.exists() {
            let primary_lock = eb_dir.join("Default").join("LOCK");
            if primary_lock.exists() {
                // If the lock cannot be deleted, an orphaned msedgewebview2 zombie is holding it.
                if std::fs::remove_file(&primary_lock).is_err() {
                    cleanup_zombie_webview_processes();
                    let _ = std::fs::remove_file(&primary_lock);
                }
            }

            let lock_candidates = [
                eb_dir.join("Default").join("Local Storage").join("leveldb").join("LOCK"),
                eb_dir.join("Default").join("Session Storage").join("LOCK"),
            ];
            for lock in &lock_candidates {
                if lock.exists() {
                    let _ = std::fs::remove_file(lock);
                }
            }
        }
    }
}

#[cfg(target_os = "windows")]
fn ensure_single_instance() -> bool {
    use windows_sys::Win32::Foundation::{CloseHandle, GetLastError, ERROR_ALREADY_EXISTS};
    use windows_sys::Win32::System::Threading::CreateMutexW;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        FindWindowW, SetForegroundWindow, ShowWindow, SW_RESTORE,
    };

    let mutex_name: Vec<u16> = "Global\\com_sms_studentmanagementsystem_singleinstance\0"
        .encode_utf16()
        .collect();

    unsafe {
        let handle = CreateMutexW(std::ptr::null(), 1, mutex_name.as_ptr());
        if handle.is_null() {
            return true;
        }

        if GetLastError() == ERROR_ALREADY_EXISTS {
            CloseHandle(handle);

            // An instance is already running! Bring existing window to front.
            let title: Vec<u16> = "SMS - Student Management System\0"
                .encode_utf16()
                .collect();
            let hwnd = FindWindowW(std::ptr::null(), title.as_ptr());
            if !hwnd.is_null() {
                ShowWindow(hwnd, SW_RESTORE);
                SetForegroundWindow(hwnd);
            }

            // Exit cleanly with code 0 without initializing WebView2 or panicking
            return false;
        }
    }

    true
}

fn main() {
  #[cfg(target_os = "windows")]
  if !ensure_single_instance() {
      return;
  }

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

