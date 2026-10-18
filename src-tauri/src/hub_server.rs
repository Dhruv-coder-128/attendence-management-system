use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream, UdpSocket};
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HubServerInfo {
    pub ok: bool,
    pub running: bool,
    pub local_ip: String,
    pub port: u16,
    pub url: String,
    pub token: String,
    pub pairing_otp: String,
    pub registered_devices_count: usize,
    pub batches_count: usize,
    pub students_count: usize,
    pub attendance_count: usize,
}

pub struct HubState {
    pub app_data_dir: PathBuf,
    pub local_ip: String,
    pub port: u16,
    pub token: String,
    pub pairing_otp: String,
    pub registered_devices: HashSet<String>,
    pub batches: Vec<Value>,
    pub students: Vec<Value>,
    pub attendance: HashMap<String, Value>,
}

pub type SharedHubState = Arc<RwLock<HubState>>;

fn generate_simple_token() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(123456789);
    format!("sms-{:x}", now % 0xffffffffffff)
}

fn generate_pairing_otp() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(482910);
    let code = 100000 + (now % 900000);
    format!("{:06}", code)
}

static LAST_DETECTED_IP: RwLock<Option<(String, u64)>> = RwLock::new(None);

/// Detects the local IPv4 address of the primary active network interface.
/// Prioritizes active Wi-Fi / Wireless adapters and ignores virtual adapters (vgate, vethernet, vmware).
/// Guaranteed ZERO console window flashing and cached for 15s to eliminate UI lag.
pub fn detect_local_ip() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    // 0. Cache check: if detected within last 15s, return immediately
    if let Ok(guard) = LAST_DETECTED_IP.read() {
        if let Some((ref cached_ip, last_time)) = *guard {
            if now.saturating_sub(last_time) < 15 && cached_ip != "127.0.0.1" && !cached_ip.is_empty() {
                return cached_ip.clone();
            }
        }
    }

    // 1. Instant zero-process kernel UDP route check (0.001 ms, 0 processes, 0 CMD windows)
    let probe_targets = [
        "8.8.8.8:80",
        "1.1.1.1:80",
        "192.168.1.1:80",
        "192.168.0.1:80",
        "192.168.31.1:80",
        "192.168.29.1:80",
        "10.0.0.1:80",
    ];

    for target in probe_targets {
        if let Ok(socket) = UdpSocket::bind("0.0.0.0:0") {
            if socket.connect(target).is_ok() {
                if let Ok(local_addr) = socket.local_addr() {
                    let ip = local_addr.ip().to_string();
                    if ip != "0.0.0.0" && ip != "127.0.0.1" && !ip.starts_with("169.254.") && !ip.starts_with("172.30.") {
                        if let Ok(mut guard) = LAST_DETECTED_IP.write() {
                            *guard = Some((ip.clone(), now));
                        }
                        return ip;
                    }
                }
            }
        }
    }

    // 2. Secondary fallback: Windows ipconfig parser with CREATE_NO_WINDOW (guaranteed NO window)
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let mut cmd = std::process::Command::new("ipconfig");
        cmd.creation_flags(CREATE_NO_WINDOW);

        if let Ok(output) = cmd.output() {
            let text = String::from_utf8_lossy(&output.stdout);
            let mut adapters: Vec<(String, String, bool)> = Vec::new();
            let mut current_name = String::new();
            let mut current_ip = String::new();
            let mut has_gateway = false;

            for line in text.lines() {
                let trimmed = line.trim();
                if line.starts_with("Wireless LAN adapter ") || line.starts_with("Ethernet adapter ") || (line.ends_with(':') && !line.starts_with(' ')) {
                    if !current_name.is_empty() && !current_ip.is_empty() {
                        adapters.push((current_name.clone(), current_ip.clone(), has_gateway));
                    }
                    current_name = line.trim_end_matches(':').to_string();
                    current_ip.clear();
                    has_gateway = false;
                } else if trimmed.contains("IPv4 Address") || trimmed.contains("IP Address") {
                    if let Some((_, ip_part)) = trimmed.split_once(':') {
                        let candidate = ip_part.trim().trim_matches('(').trim_matches(')').trim();
                        if !candidate.is_empty()
                            && candidate != "127.0.0.1"
                            && !candidate.starts_with("169.254.")
                            && candidate.split('.').count() == 4
                        {
                            current_ip = candidate.to_string();
                        }
                    }
                } else if trimmed.starts_with("Default Gateway") {
                    if let Some((_, gw_part)) = trimmed.split_once(':') {
                        let gw = gw_part.trim();
                        if !gw.is_empty() && gw != "0.0.0.0" {
                            has_gateway = true;
                        }
                    }
                }
            }
            if !current_name.is_empty() && !current_ip.is_empty() {
                adapters.push((current_name, current_ip, has_gateway));
            }

            let is_virtual = |name: &str| -> bool {
                let lower = name.to_lowercase();
                lower.contains("vgate")
                    || lower.contains("vethernet")
                    || lower.contains("vmware")
                    || lower.contains("virtualbox")
                    || lower.contains("virtual")
                    || lower.contains("hyper-v")
                    || lower.contains("tailscale")
                    || lower.contains("zerotier")
                    || lower.contains("loopback")
                    || lower.contains("bluetooth")
            };

            // Priority 1: Wi-Fi / Wireless adapter with an IP
            for (name, ip, _) in &adapters {
                let lower = name.to_lowercase();
                if (lower.contains("wi-fi") || lower.contains("wireless") || lower.contains("wlan")) && !is_virtual(name) {
                    if let Ok(mut guard) = LAST_DETECTED_IP.write() {
                        *guard = Some((ip.clone(), now));
                    }
                    return ip.clone();
                }
            }

            // Priority 2: Non-virtual adapter with active default gateway
            for (name, ip, has_gw) in &adapters {
                if *has_gw && !is_virtual(name) {
                    if let Ok(mut guard) = LAST_DETECTED_IP.write() {
                        *guard = Some((ip.clone(), now));
                    }
                    return ip.clone();
                }
            }

            // Priority 3: Any non-virtual adapter with IPv4
            for (name, ip, _) in &adapters {
                if !is_virtual(name) {
                    if let Ok(mut guard) = LAST_DETECTED_IP.write() {
                        *guard = Some((ip.clone(), now));
                    }
                    return ip.clone();
                }
            }
        }
    }

    "127.0.0.1".to_string()
}

fn atomic_write_json(file_path: &Path, data: &Value) -> Result<(), String> {
    if let Some(parent) = file_path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let tmp_path = file_path.with_extension("tmp");
    let json_str = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;

    let mut file = File::create(&tmp_path).map_err(|e| e.to_string())?;
    file.write_all(json_str.as_bytes()).map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())?;

    fs::rename(&tmp_path, file_path).map_err(|e| e.to_string())?;
    Ok(())
}

fn load_json_file(file_path: &Path) -> Option<Value> {
    if !file_path.exists() {
        return None;
    }
    let file = File::open(file_path).ok()?;
    let reader = BufReader::new(file);
    serde_json::from_reader(reader).ok()
}

pub fn start_hub_server(app_data_dir: PathBuf, preferred_port: u16) -> (SharedHubState, HubServerInfo) {
    let _ = fs::create_dir_all(&app_data_dir);

    let local_ip = detect_local_ip();
    let token = generate_simple_token();

    // Load existing database from app_data_dir if present
    let db_path = app_data_dir.join("school_database.json");
    let att_path = app_data_dir.join("attendance_sync.json");

    let mut initial_batches = Vec::new();
    let mut initial_students = Vec::new();
    let mut initial_attendance = HashMap::new();

    if let Some(db_json) = load_json_file(&db_path) {
        if let Some(b_arr) = db_json.get("batches").and_then(|v| v.as_array()) {
            initial_batches = b_arr.clone();
        }
        if let Some(s_arr) = db_json.get("students").and_then(|v| v.as_array()) {
            initial_students = s_arr.clone();
        }
    }

    if let Some(att_json) = load_json_file(&att_path) {
        if let Some(records) = att_json.get("records").and_then(|v| v.as_array()) {
            for rec in records {
                let batch = rec.get("batch_id").and_then(|v| v.as_str()).unwrap_or("");
                let date = rec.get("date").and_then(|v| v.as_str()).unwrap_or("");
                let adm = rec
                    .get("admission_no")
                    .or_else(|| rec.get("student_id"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                if !batch.is_empty() && !date.is_empty() && !adm.is_empty() {
                    let key = format!("{}::{}::{}", batch, date, adm);
                    initial_attendance.insert(key, rec.clone());
                }
            }
        }
    }

    // Try binding preferred port, then fallback ports
    let ports_to_try = [preferred_port, 5174, 5175, 8765, 8766, 0];
    let mut listener_opt: Option<(TcpListener, u16)> = None;

    for &port in &ports_to_try {
        let addr = format!("0.0.0.0:{}", port);
        if let Ok(listener) = TcpListener::bind(&addr) {
            let actual_port = listener.local_addr().map(|a| a.port()).unwrap_or(port);
            listener_opt = Some((listener, actual_port));
            break;
        }
    }

    let (listener, active_port) = match listener_opt {
        Some(pair) => pair,
        None => {
            eprintln!("[SMS Hub Server] Warning: Could not bind TCP listener on any candidate port");
            let state = Arc::new(RwLock::new(HubState {
                app_data_dir: app_data_dir.clone(),
                local_ip: local_ip.clone(),
                port: 0,
                token: token.clone(),
                pairing_otp: generate_pairing_otp(),
                registered_devices: HashSet::new(),
                batches: initial_batches,
                students: initial_students,
                attendance: initial_attendance,
            }));
            let info = HubServerInfo {
                ok: false,
                running: false,
                local_ip,
                port: 0,
                url: String::new(),
                token,
                pairing_otp: String::new(),
                registered_devices_count: 0,
                batches_count: 0,
                students_count: 0,
                attendance_count: 0,
            };
            return (state, info);
        }
    };

    let devices_path = app_data_dir.join("registered_devices.json");
    let mut initial_devices: HashSet<String> = HashSet::new();
    if let Some(dev_json) = load_json_file(&devices_path) {
        if let Some(arr) = dev_json.as_array() {
            for v in arr {
                if let Some(s) = v.as_str() {
                    initial_devices.insert(s.to_string());
                }
            }
        }
    }
    let pairing_otp = generate_pairing_otp();

    let server_url = format!("http://{}:{}", local_ip, active_port);

    let state = Arc::new(RwLock::new(HubState {
        app_data_dir: app_data_dir.clone(),
        local_ip: local_ip.clone(),
        port: active_port,
        token: token.clone(),
        pairing_otp: pairing_otp.clone(),
        registered_devices: initial_devices.clone(),
        batches: initial_batches.clone(),
        students: initial_students.clone(),
        attendance: initial_attendance.clone(),
    }));

    let info = HubServerInfo {
        ok: true,
        running: true,
        local_ip: local_ip.clone(),
        port: active_port,
        url: server_url.clone(),
        token: token.clone(),
        pairing_otp,
        registered_devices_count: initial_devices.len(),
        batches_count: initial_batches.len(),
        students_count: initial_students.len(),
        attendance_count: initial_attendance.len(),
    };

    // Spawn server background listener thread
    let server_state = Arc::clone(&state);
    thread::spawn(move || {
        println!("[SMS Hub Server] Native LAN Hub listening on 0.0.0.0:{} (URL: {})", active_port, server_url);
        for stream_res in listener.incoming() {
            match stream_res {
                Ok(stream) => {
                    let st = Arc::clone(&server_state);
                    thread::spawn(move || {
                        handle_connection(stream, st);
                    });
                }
                Err(err) => {
                    eprintln!("[SMS Hub Server] Incoming connection error: {}", err);
                }
            }
        }
    });

    (state, info)
}

fn handle_connection(mut stream: TcpStream, state: SharedHubState) {
    let is_loopback = stream.peer_addr().map(|a| a.ip().is_loopback()).unwrap_or(false);

    let mut reader = BufReader::new(&stream);
    let mut request_line = String::new();
    if reader.read_line(&mut request_line).is_err() || request_line.trim().is_empty() {
        return;
    }

    let parts: Vec<&str> = request_line.trim().split_whitespace().collect();
    if parts.len() < 2 {
        return;
    }
    let method = parts[0].to_uppercase();
    let full_path = parts[1];

    let mut headers: HashMap<String, String> = HashMap::new();
    let mut line = String::new();
    loop {
        line.clear();
        if reader.read_line(&mut line).is_err() || line.trim().is_empty() {
            break;
        }
        if let Some((k, v)) = line.split_once(':') {
            headers.insert(k.trim().to_lowercase(), v.trim().to_string());
        }
    }

    // CORS preflight
    if method == "OPTIONS" {
        let response = "HTTP/1.1 204 No Content\r\n\
Access-Control-Allow-Origin: *\r\n\
Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n\
Access-Control-Allow-Headers: Content-Type, Accept, Authorization, X-Hub-Token, X-School-Token\r\n\
Access-Control-Max-Age: 86400\r\n\
Connection: close\r\n\r\n";
        let _ = stream.write_all(response.as_bytes());
        return;
    }

    // Read body if Content-Length specified
    let mut body_bytes = Vec::new();
    if let Some(len_str) = headers.get("content-length") {
        if let Ok(content_len) = len_str.parse::<usize>() {
            body_bytes.resize(content_len, 0);
            let _ = reader.read_exact(&mut body_bytes);
        }
    }

    let (path, query_str) = match full_path.split_once('?') {
        Some((p, q)) => (p, q),
        None => (full_path, ""),
    };

    let mut query_params: HashMap<String, String> = HashMap::new();
    for pair in query_str.split('&') {
        if let Some((k, v)) = pair.split_once('=') {
            let decoded_k = percent_decode(k);
            let decoded_v = percent_decode(v);
            query_params.insert(decoded_k, decoded_v);
        }
    }

    let action = query_params
        .get("action")
        .cloned()
        .unwrap_or_else(|| "".to_string());

    // Routing
    let (status_code, response_json) = if path.starts_with("/api/local-hub") {
        match method.as_str() {
            "OPTIONS" => (200, json!({ "ok": true, "status": "preflight_ok" })),
            "GET" => handle_get_action(&action, &query_params, &headers, &state),
            "POST" => handle_post_action(&action, &body_bytes, &headers, is_loopback, &state),
            _ => (405, json!({ "ok": false, "error": "Method Not Allowed" })),
        }
    } else if path == "/" || path == "/status" || path == "/health" || path.is_empty() {
        if method == "OPTIONS" {
            (200, json!({ "ok": true, "status": "preflight_ok" }))
        } else {
            handle_get_action("status", &query_params, &headers, &state)
        }
    } else {
        (404, json!({ "ok": false, "error": "Endpoint not found" }))
    };

    let body_str = serde_json::to_string(&response_json).unwrap_or_else(|_| "{}".to_string());
    let response = format!(
        "HTTP/1.1 {} OK\r\n\
Content-Type: application/json; charset=utf-8\r\n\
Content-Length: {}\r\n\
Access-Control-Allow-Origin: *\r\n\
Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n\
Access-Control-Allow-Headers: Content-Type, Accept, Authorization, X-Hub-Token, X-School-Token, X-Device-Id, *\r\n\
Access-Control-Max-Age: 86400\r\n\
Connection: close\r\n\r\n{}",
        status_code,
        body_str.len(),
        body_str
    );

    let _ = stream.write_all(response.as_bytes());
}

fn percent_decode(input: &str) -> String {
    let mut result = Vec::new();
    let bytes = input.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(val) = u8::from_str_radix(&input[i + 1..i + 3], 16) {
                result.push(val);
                i += 3;
                continue;
            }
        } else if bytes[i] == b'+' {
            result.push(b' ');
            i += 1;
            continue;
        }
        result.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&result).to_string()
}

fn handle_get_action(
    action: &str,
    params: &HashMap<String, String>,
    _headers: &HashMap<String, String>,
    state: &SharedHubState,
) -> (u16, Value) {
    let guard = match state.read() {
        Ok(g) => g,
        Err(_) => return (500, json!({ "ok": false, "error": "Lock error" })),
    };

    match action {
        "status" => {
            let fresh_ip = detect_local_ip();
            drop(guard);
            if let Ok(mut write_guard) = state.write() {
                if fresh_ip != "127.0.0.1" && fresh_ip != "0.0.0.0" {
                    write_guard.local_ip = fresh_ip;
                }
                (
                    200,
                    json!({
                        "ok": true,
                        "service": "SMS Local Wi-Fi Attendance Hub",
                        "version": "2.1.0",
                        "localIp": write_guard.local_ip,
                        "port": write_guard.port,
                        "connectUrl": format!("http://{}:{}", write_guard.local_ip, write_guard.port),
                        "token": write_guard.token,
                        "otp": write_guard.pairing_otp,
                        "registeredDevicesCount": write_guard.registered_devices.len(),
                        "batchesCount": write_guard.batches.len(),
                        "studentsCount": write_guard.students.len(),
                        "attendanceCount": write_guard.attendance.len(),
                        "status": "active",
                        "timestamp": chrono_now_iso(),
                    }),
                )
            } else {
                (500, json!({ "ok": false, "error": "Lock error" }))
            }
        }
        "check_device" => {
            let device_id = params.get("device_id").map(|s| s.trim()).unwrap_or("");
            let is_reg = !device_id.is_empty() && guard.registered_devices.contains(device_id);
            (200, json!({ "ok": true, "registered": is_reg, "device_id": device_id }))
        }
        "regenerate_otp" => {
            drop(guard);
            if let Ok(mut write_guard) = state.write() {
                write_guard.pairing_otp = generate_pairing_otp();
                (200, json!({ "ok": true, "otp": write_guard.pairing_otp }))
            } else {
                (500, json!({ "ok": false, "error": "Lock error" }))
            }
        }
        "batches" => {
            let batches_with_counts: Vec<Value> = guard
                .batches
                .iter()
                .map(|b| {
                    let mut b_obj = b.clone();
                    let b_id = b.get("id").and_then(|v| v.as_str()).unwrap_or("").to_uppercase();
                    let b_code = b.get("code").and_then(|v| v.as_str()).unwrap_or("").to_uppercase();
                    let count = guard.students.iter().filter(|s| {
                        let s_b_id = s.get("batch_id").and_then(|v| v.as_str()).unwrap_or("").to_uppercase();
                        (!b_id.is_empty() && s_b_id == b_id) || (!b_code.is_empty() && s_b_id == b_code)
                    }).count();
                    if let Some(map) = b_obj.as_object_mut() {
                        map.insert("student_count".to_string(), json!(count));
                    }
                    b_obj
                })
                .collect();

            (
                200,
                json!({
                    "ok": true,
                    "batches": batches_with_counts,
                    "count": batches_with_counts.len()
                }),
            )
        }
        "students" => {
            let batch_id = params.get("batch_id").map(|s| s.trim()).unwrap_or("");
            let clean_b = batch_id.to_uppercase();

            let filtered: Vec<Value> = if clean_b.is_empty() {
                guard.students.clone()
            } else {
                let matched_batch = guard.batches.iter().find(|b| {
                    let b_id = b.get("id").and_then(|v| v.as_str()).unwrap_or("").to_uppercase();
                    let b_code = b.get("code").and_then(|v| v.as_str()).unwrap_or("").to_uppercase();
                    let b_name = b.get("name").and_then(|v| v.as_str()).unwrap_or("").to_uppercase();
                    (!b_id.is_empty() && b_id == clean_b)
                        || (!b_code.is_empty() && b_code == clean_b)
                        || (!b_name.is_empty() && b_name == clean_b)
                });

                let target_id = matched_batch
                    .and_then(|b| b.get("id"))
                    .and_then(|v| v.as_str())
                    .unwrap_or(&clean_b)
                    .to_uppercase();
                let target_code = matched_batch
                    .and_then(|b| b.get("code"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_uppercase();
                let target_name = matched_batch
                    .and_then(|b| b.get("name"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_uppercase();

                guard
                    .students
                    .iter()
                    .filter(|s| {
                        let s_id = s.get("batch_id").and_then(|v| v.as_str()).unwrap_or("").to_uppercase();
                        let s_code = s.get("batch_code").or_else(|| s.get("code")).and_then(|v| v.as_str()).unwrap_or("").to_uppercase();
                        let s_name = s.get("batch_name").or_else(|| s.get("name")).and_then(|v| v.as_str()).unwrap_or("").to_uppercase();

                        if !s_id.is_empty() && (s_id == target_id || s_id == clean_b) {
                            return true;
                        }
                        if !target_code.is_empty() && (s_id == target_code || s_code == target_code) {
                            return true;
                        }
                        if !s_code.is_empty() && (s_code == target_id || s_code == clean_b) {
                            return true;
                        }
                        if !s_name.is_empty() && !target_name.is_empty() && (s_name == target_name || s_name.contains(&target_name) || target_name.contains(&s_name)) {
                            return true;
                        }
                        false
                    })
                    .cloned()
                    .collect()
            };

            (
                200,
                json!({
                    "ok": true,
                    "batch_id": batch_id,
                    "count": filtered.len(),
                    "students": filtered
                }),
            )
        }
        "attendance" => {
            let batch_id = params.get("batch_id").map(|s| s.trim()).unwrap_or("");
            let batch_code = params.get("batch_code").map(|s| s.trim()).unwrap_or("");
            let batch_name = params.get("batch_name").map(|s| s.trim()).unwrap_or("");
            let date = params.get("date").map(|s| s.trim()).unwrap_or("");

            let canonical_batch_id = guard
                .batches
                .iter()
                .find(|b| {
                    let b_id = b.get("id").and_then(|v| v.as_str()).unwrap_or("");
                    let b_code = b.get("code").and_then(|v| v.as_str()).unwrap_or("");
                    let b_name = b.get("name").and_then(|v| v.as_str()).unwrap_or("");
                    b_id.eq_ignore_ascii_case(batch_id)
                        || b_code.eq_ignore_ascii_case(batch_id)
                        || b_name.replace(' ', "").eq_ignore_ascii_case(&batch_id.replace(' ', ""))
                        || (!batch_code.is_empty() && (b_id.eq_ignore_ascii_case(batch_code) || b_code.eq_ignore_ascii_case(batch_code)))
                        || (!batch_name.is_empty() && b_name.replace(' ', "").eq_ignore_ascii_case(&batch_name.replace(' ', "")))
                })
                .and_then(|b| b.get("id").and_then(|v| v.as_str()))
                .unwrap_or(batch_id);

            let records: Vec<Value> = guard
                .attendance
                .values()
                .filter(|r| {
                    let r_batch = r.get("batch_id").and_then(|v| v.as_str()).unwrap_or("");
                    let r_date = r.get("date").and_then(|v| v.as_str()).unwrap_or("");
                    let matches_batch = batch_id.is_empty()
                        || r_batch.eq_ignore_ascii_case(batch_id)
                        || r_batch.eq_ignore_ascii_case(canonical_batch_id)
                        || (!batch_code.is_empty() && r_batch.eq_ignore_ascii_case(batch_code));
                    let matches_date = date.is_empty() || r_date == date;
                    matches_batch && matches_date
                })
                .cloned()
                .collect();

            let present_count = records
                .iter()
                .filter(|r| r.get("status").and_then(|v| v.as_str()) == Some("Present"))
                .count();
            let absent_count = records
                .iter()
                .filter(|r| r.get("status").and_then(|v| v.as_str()) == Some("Absent"))
                .count();
            let late_count = records
                .iter()
                .filter(|r| r.get("status").and_then(|v| v.as_str()) == Some("Late"))
                .count();

            (
                200,
                json!({
                    "ok": true,
                    "batch_id": batch_id,
                    "canonical_batch_id": canonical_batch_id,
                    "date": date,
                    "total": records.len(),
                    "presentCount": present_count,
                    "absentCount": absent_count,
                    "lateCount": late_count,
                    "records": records,
                    "timestamp": chrono_now_iso(),
                }),
            )
        }
        "updates" => {
            let target_date = params.get("date").map(|s| s.trim()).unwrap_or("");
            let batch_id = params.get("batch_id").map(|s| s.trim()).unwrap_or("");
            let since = params.get("since").cloned().unwrap_or_default();

            let canonical_batch_id = if !batch_id.is_empty() {
                guard
                    .batches
                    .iter()
                    .find(|b| {
                        let b_id = b.get("id").and_then(|v| v.as_str()).unwrap_or("");
                        let b_code = b.get("code").and_then(|v| v.as_str()).unwrap_or("");
                        let b_name = b.get("name").and_then(|v| v.as_str()).unwrap_or("");
                        b_id.eq_ignore_ascii_case(batch_id)
                            || b_code.eq_ignore_ascii_case(batch_id)
                            || b_name.replace(' ', "").eq_ignore_ascii_case(&batch_id.replace(' ', ""))
                    })
                    .and_then(|b| b.get("id").and_then(|v| v.as_str()))
                    .unwrap_or(batch_id)
            } else {
                ""
            };

            // Filter records matching batch and date
            let records: Vec<Value> = guard
                .attendance
                .values()
                .filter(|r| {
                    let r_batch = r.get("batch_id").and_then(|v| v.as_str()).unwrap_or("");
                    let r_date = r.get("date").and_then(|v| v.as_str()).unwrap_or("");
                    let date_match = target_date.is_empty() || r_date == target_date;
                    let batch_match = batch_id.is_empty()
                        || r_batch.eq_ignore_ascii_case(batch_id)
                        || r_batch.eq_ignore_ascii_case(canonical_batch_id);

                    if !date_match || !batch_match {
                        return false;
                    }
                    if !since.is_empty() {
                        let updated_at = r.get("updated_at").and_then(|v| v.as_str()).unwrap_or("");
                        updated_at > since.as_str()
                    } else {
                        true
                    }
                })
                .cloned()
                .collect();

            // All records for the date across any batch
            let all_records: Vec<Value> = guard
                .attendance
                .values()
                .filter(|r| {
                    let r_date = r.get("date").and_then(|v| v.as_str()).unwrap_or("");
                    target_date.is_empty() || r_date == target_date
                })
                .cloned()
                .collect();

            (
                200,
                json!({
                    "ok": true,
                    "hasData": !records.is_empty() || !all_records.is_empty(),
                    "records": records,
                    "allRecords": all_records,
                    "updates": records,
                    "date": target_date,
                    "timestamp": chrono_now_iso()
                }),
            )
        }
        "export_school_data" => (
            200,
            json!({
                "ok": true,
                "batches": guard.batches,
                "students": guard.students,
                "lastModified": chrono_now_iso()
            }),
        ),
        _ => (400, json!({ "ok": false, "error": format!("Unknown action: {}", action) })),
    }
}

fn handle_post_action(
    action: &str,
    body_bytes: &[u8],
    headers: &HashMap<String, String>,
    _is_loopback: bool,
    state: &SharedHubState,
) -> (u16, Value) {
    let payload: Value = match serde_json::from_slice(body_bytes) {
        Ok(v) => v,
        Err(_) => return (400, json!({ "ok": false, "error": "Invalid JSON body" })),
    };

    let effective_action = if !action.is_empty() {
        action
    } else {
        payload.get("action").and_then(|v| v.as_str()).unwrap_or("")
    };

    let mut guard = match state.write() {
        Ok(g) => g,
        Err(_) => return (500, json!({ "ok": false, "error": "Lock error" })),
    };

    if effective_action == "pair_device" {
        let otp = payload.get("otp").and_then(|v| v.as_str()).unwrap_or("").trim();
        let device_id = payload.get("device_id").and_then(|v| v.as_str()).unwrap_or("").trim();
        if device_id.is_empty() {
            return (400, json!({ "ok": false, "error": "Missing device_id" }));
        }
        if otp.is_empty() || otp != guard.pairing_otp {
            return (
                400,
                json!({
                    "ok": false,
                    "error": "Invalid 6-digit OTP pairing code. Please enter the code shown on the School PC screen."
                }),
            );
        }
        guard.registered_devices.insert(device_id.to_string());
        let devices_path = guard.app_data_dir.join("registered_devices.json");
        let dev_arr: Vec<String> = guard.registered_devices.iter().cloned().collect();
        let _ = atomic_write_json(&devices_path, &json!(dev_arr));

        return (
            200,
            json!({
                "ok": true,
                "registered": true,
                "device_id": device_id,
                "token": guard.token,
                "message": "Device paired and registered successfully"
            }),
        );
    }

    // Auto-register device on LAN so teachers on the same Wi-Fi can save roll call with zero friction
    if let Some(dev_id) = headers
        .get("x-device-id")
        .cloned()
        .or_else(|| payload.get("device_id").and_then(|v| v.as_str()).map(|s| s.to_string()))
    {
        if !dev_id.is_empty() {
            guard.registered_devices.insert(dev_id);
        }
    }

    match effective_action {
        "attendance" => {
            let batch_id = payload
                .get("batch_id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            let date = payload
                .get("date")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string();

            if batch_id.is_empty() || date.is_empty() {
                return (
                    400,
                    json!({ "ok": false, "error": "Missing required fields: batch_id and date" }),
                );
            }

            let canonical_batch_id = guard
                .batches
                .iter()
                .find(|b| {
                    let b_id = b.get("id").and_then(|v| v.as_str()).unwrap_or("");
                    let b_code = b.get("code").and_then(|v| v.as_str()).unwrap_or("");
                    let b_name = b.get("name").and_then(|v| v.as_str()).unwrap_or("");
                    b_id.eq_ignore_ascii_case(&batch_id)
                        || b_code.eq_ignore_ascii_case(&batch_id)
                        || b_name.replace(' ', "").eq_ignore_ascii_case(&batch_id.replace(' ', ""))
                })
                .and_then(|b| b.get("id").and_then(|v| v.as_str()))
                .unwrap_or(&batch_id)
                .to_string();

            let records_val = match payload.get("records").and_then(|v| v.as_array()) {
                Some(arr) if !arr.is_empty() => arr,
                _ => return (400, json!({ "ok": false, "error": "No attendance records provided" })),
            };

            let now_iso = chrono_now_iso();
            let mut saved_count = 0;
            let mut present = 0;
            let mut absent = 0;
            let mut late = 0;

            for item in records_val {
                let adm = item
                    .get("admission_no")
                    .or_else(|| item.get("student_id"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .trim();
                let status_raw = item
                    .get("status")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Absent")
                    .trim();

                // Validate status strictly (Req 6)
                let status = match status_raw {
                    "Present" => {
                        present += 1;
                        "Present"
                    }
                    "Late" => {
                        late += 1;
                        "Late"
                    }
                    _ => {
                        absent += 1;
                        "Absent"
                    }
                };

                if adm.is_empty() {
                    continue;
                }

                // Match with student from live database for full details
                let matched_student = guard.students.iter().find(|s| {
                    let s_adm = s.get("admission_no").and_then(|v| v.as_str()).unwrap_or("");
                    let s_id = s.get("id").and_then(|v| v.as_str()).unwrap_or("");
                    s_adm.eq_ignore_ascii_case(adm) || s_id.eq_ignore_ascii_case(adm)
                });

                let s_id = item
                    .get("student_id")
                    .and_then(|v| v.as_str())
                    .unwrap_or_else(|| {
                        matched_student
                            .and_then(|s| s.get("id"))
                            .and_then(|v| v.as_str())
                            .unwrap_or(adm)
                    });

                let full_name = item
                    .get("full_name")
                    .and_then(|v| v.as_str())
                    .unwrap_or_else(|| {
                        matched_student
                            .and_then(|s| s.get("full_name"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                    });

                let roll_no = item
                    .get("roll_no")
                    .cloned()
                    .or_else(|| matched_student.and_then(|s| s.get("roll_no")).cloned())
                    .unwrap_or(Value::Null);

                let key = format!("{}::{}::{}", canonical_batch_id, date, adm);
                let record = json!({
                    "student_id": s_id,
                    "admission_no": adm,
                    "roll_no": roll_no,
                    "full_name": full_name,
                    "batch_id": canonical_batch_id,
                    "date": date,
                    "session_name": "Regular",
                    "status": status,
                    "remarks": item.get("remarks").and_then(|v| v.as_str()).unwrap_or(""),
                    "time_in": item.get("time_in").and_then(|v| v.as_str()).unwrap_or("09:00"),
                    "updated_at": now_iso
                });

                guard.attendance.insert(key, record);
                saved_count += 1;
            }

            // Persist to disk atomically (Req 3, Req 7)
            let att_file = guard.app_data_dir.join("attendance_sync.json");
            let all_records: Vec<&Value> = guard.attendance.values().collect();
            let save_payload = json!({
                "last_synced": now_iso,
                "count": all_records.len(),
                "records": all_records
            });
            let _ = atomic_write_json(&att_file, &save_payload);

            (
                200,
                json!({
                    "ok": true,
                    "saved": saved_count,
                    "totalStudents": saved_count,
                    "presentCount": present,
                    "absentCount": absent,
                    "lateCount": late,
                    "timestamp": now_iso,
                    "message": format!("Successfully saved {} records to School PC ({} Present, {} Late, {} Absent)", saved_count, present, late, absent)
                }),
            )
        }
        "sync_school_data" => {
            let mut updated = false;
            let now_iso = chrono_now_iso();

            if let Some(b_arr) = payload.get("batches").and_then(|v| v.as_array()) {
                guard.batches = b_arr.clone();
                updated = true;
            }
            if let Some(s_arr) = payload.get("students").and_then(|v| v.as_array()) {
                guard.students = s_arr.clone();
                updated = true;
            }

            if updated {
                let db_file = guard.app_data_dir.join("school_database.json");
                let db_payload = json!({
                    "last_synced": now_iso,
                    "batches": guard.batches,
                    "students": guard.students
                });
                let _ = atomic_write_json(&db_file, &db_payload);
            }

            (
                200,
                json!({
                    "ok": true,
                    "batchesCount": guard.batches.len(),
                    "studentsCount": guard.students.len(),
                    "timestamp": now_iso
                }),
            )
        }
        _ => (400, json!({ "ok": false, "error": format!("Unknown action: {}", effective_action) })),
    }
}

fn chrono_now_iso() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let total_secs = now.as_secs();
    let millis = now.subsec_millis();

    let sec = total_secs % 60;
    let min = (total_secs / 60) % 60;
    let hour = (total_secs / 3600) % 24;
    let days = total_secs / 86400;

    let (year, month, day) = days_to_ymd(days);
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        year, month, day, hour, min, sec, millis
    )
}

fn days_to_ymd(days: u64) -> (u64, u64, u64) {
    let d = days + 719468;
    let era = d / 146097;
    let doe = d - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if month <= 2 { y + 1 } else { y };
    (year, month, day)
}
