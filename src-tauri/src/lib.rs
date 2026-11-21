pub mod hub_server;

use hub_server::{HubServerInfo, SharedHubState};
use serde_json::{json, Value};
use tauri::{Manager, State};

#[tauri::command]
fn get_hub_server_info(state: State<'_, SharedHubState>) -> Result<HubServerInfo, String> {
    let mut guard = state.write().map_err(|e| e.to_string())?;
    if guard.local_ip.is_empty() || guard.local_ip == "127.0.0.1" || guard.local_ip == "0.0.0.0" {
        let fresh_ip = hub_server::detect_local_ip();
        if fresh_ip != "127.0.0.1" && fresh_ip != "0.0.0.0" {
            guard.local_ip = fresh_ip;
        }
    }
    Ok(HubServerInfo {
        ok: guard.port > 0,
        running: guard.port > 0,
        local_ip: guard.local_ip.clone(),
        port: guard.port,
        url: format!("http://{}:{}", guard.local_ip, guard.port),
        token: guard.token.clone(),
        pairing_otp: guard.pairing_otp.clone(),
        registered_devices_count: guard.registered_devices.len(),
        batches_count: guard.batches.len(),
        students_count: guard.students.len(),
        attendance_count: guard.attendance.len(),
    })
}

#[tauri::command]
fn sync_school_data_to_hub(
    batches: Vec<Value>,
    students: Vec<Value>,
    state: State<'_, SharedHubState>,
) -> Result<Value, String> {
    let mut guard = state.write().map_err(|e| e.to_string())?;
    guard.batches = batches;
    guard.students = students;

    let db_file = guard.app_data_dir.join("school_database.json");
    let payload = json!({
        "batches": guard.batches,
        "students": guard.students
    });

    hub_server::atomic_write_json(&db_file, &payload)?;

    Ok(json!({
        "ok": true,
        "batchesCount": guard.batches.len(),
        "studentsCount": guard.students.len()
    }))
}

#[tauri::command]
fn get_hub_attendance(
    batch_id: Option<String>,
    date: Option<String>,
    state: State<'_, SharedHubState>,
) -> Result<Value, String> {
    let guard = state.read().map_err(|e| e.to_string())?;
    let b_filter = batch_id.unwrap_or_default();
    let d_filter = date.unwrap_or_default();

    let records: Vec<Value> = guard
        .attendance
        .values()
        .filter(|r| {
            let r_b = r.get("batch_id").and_then(|v| v.as_str()).unwrap_or("");
            let r_d = r.get("date").and_then(|v| v.as_str()).unwrap_or("");
            (b_filter.is_empty() || r_b == b_filter) && (d_filter.is_empty() || r_d == d_filter)
        })
        .cloned()
        .collect();

    Ok(json!({
        "ok": true,
        "total": records.len(),
        "records": records
    }))
}

// ---------- Automatic backups ----------
// The web layer builds the backup text; these commands only write/list/read files in folders the school chose.
const BACKUP_PREFIX: &str = "SMS-backup-";
const BACKUP_EXT: &str = ".smsdb";

fn valid_backup_name(name: &str) -> bool {
    name.starts_with(BACKUP_PREFIX)
        && name.ends_with(BACKUP_EXT)
        && !name.contains(['/', '\\', ':'])
        && !name.contains("..")
}

fn backup_names(dir: &std::path::Path) -> Vec<String> {
    let mut names: Vec<String> = std::fs::read_dir(dir)
        .map(|rd| {
            rd.filter_map(|e| e.ok())
                .filter_map(|e| e.file_name().into_string().ok())
                .filter(|n| valid_backup_name(n))
                .collect()
        })
        .unwrap_or_default();
    names.sort_by(|a, b| b.cmp(a)); // names carry the date, so this is newest first
    names
}

#[tauri::command]
fn backup_default_dir() -> String {
    let base = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| std::env::temp_dir());
    base.join("Documents").join("SMS Backups").to_string_lossy().to_string()
}

#[tauri::command]
fn write_backup(dirs: Vec<String>, filename: String, content: String, keep: usize) -> Result<Value, String> {
    if !valid_backup_name(&filename) {
        return Err("Invalid backup file name".to_string());
    }
    let keep = keep.clamp(3, 365);
    let mut results = Vec::new();
    for d in dirs.iter().map(|d| d.trim()).filter(|d| !d.is_empty()) {
        let dir = std::path::PathBuf::from(d);
        let tmp = dir.join(format!("{}.tmp", filename));
        let outcome = (|| -> Result<(), String> {
            std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
            std::fs::write(&tmp, content.as_bytes()).map_err(|e| e.to_string())?;
            std::fs::rename(&tmp, dir.join(&filename)).map_err(|e| e.to_string())?;
            for old in backup_names(&dir).into_iter().skip(keep) {
                let _ = std::fs::remove_file(dir.join(old));
            }
            Ok(())
        })();
        if outcome.is_err() {
            let _ = std::fs::remove_file(&tmp);
        }
        let ok = outcome.is_ok();
        results.push(json!({ "dir": d, "ok": ok, "error": outcome.err() }));
    }
    Ok(json!({ "results": results }))
}

#[tauri::command]
fn list_backups(dir: String) -> Vec<Value> {
    let dir = std::path::PathBuf::from(dir.trim());
    backup_names(&dir)
        .into_iter()
        .map(|n| {
            let size = std::fs::metadata(dir.join(&n)).map(|m| m.len()).unwrap_or(0);
            json!({ "name": n, "size": size })
        })
        .collect()
}

#[tauri::command]
fn read_backup(dir: String, name: String) -> Result<String, String> {
    if !valid_backup_name(&name) {
        return Err("Invalid backup file name".to_string());
    }
    std::fs::read_to_string(std::path::PathBuf::from(dir.trim()).join(name)).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_hardware_device_id() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        use std::process::Command;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let output = Command::new("reg")
            .args(["query", "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();

        if let Ok(out) = output {
            let text = String::from_utf8_lossy(&out.stdout);
            for line in text.lines() {
                if line.contains("MachineGuid") {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if let Some(guid) = parts.last() {
                        if guid.len() >= 16 {
                            return Ok(format!("HW-WIN-{}", guid.trim().to_uppercase()));
                        }
                    }
                }
            }
        }
    }

    // Persistent hardware token in APPDATA
    let app_data_dir = std::env::var("APPDATA")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| std::env::temp_dir())
        .join("com.sms.studentmanagementsystem");
    let _ = std::fs::create_dir_all(&app_data_dir);
    let hwid_file = app_data_dir.join(".hardware_id");

    if let Ok(existing) = std::fs::read_to_string(&hwid_file) {
        let trimmed = existing.trim().to_string();
        if !trimmed.is_empty() {
            return Ok(trimmed);
        }
    }

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(123456789);
    let new_token = format!("HW-TOKEN-{:016X}", timestamp);
    let _ = std::fs::write(&hwid_file, &new_token);
    Ok(new_token)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        //     if let Some(w) = app.get_webview_window("main") {
        //         let _ = w.unminimize();
        //         let _ = w.show();
        //         let _ = w.set_focus();
        //     }
        // }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // Determine app data directory for persistent school data
            let app_data_dir = std::env::var("APPDATA")
                .map(std::path::PathBuf::from)
                .unwrap_or_else(|_| std::env::temp_dir())
                .join("com.sms.studentmanagementsystem");
            let _ = std::fs::create_dir_all(&app_data_dir);

            // Start native LAN HTTP server
            let (shared_state, info) = hub_server::start_hub_server(app_data_dir, 5173);
            println!(
                "[SMS Desktop] Native Wi-Fi Attendance Hub started: {} (Port: {})",
                info.url, info.port
            );

            app.manage(shared_state);

            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.unminimize();
                let _ = w.set_focus();
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_hub_server_info,
            sync_school_data_to_hub,
            get_hub_attendance,
            get_hardware_device_id,
            backup_default_dir,
            write_backup,
            list_backups,
            read_backup
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

