// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

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

  app_lib::run();
}

