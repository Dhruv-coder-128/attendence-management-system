// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  std::panic::set_hook(Box::new(|info| {
    if let Ok(dir) = std::env::var("TEMP") {
      let path = format!("{}\\sms_app_panic.log", dir);
      let _ = std::fs::write(path, format!("SMS App Panic: {:?}", info));
    }
  }));

  app_lib::run();
}
