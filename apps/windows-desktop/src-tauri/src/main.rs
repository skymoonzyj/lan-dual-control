#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashMap,
    env, fs,
    io::{BufRead, BufReader, Read, Write},
    net::{SocketAddr, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{Manager, WindowEvent};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

const MAX_HOST_LOG_LINES: usize = 240;

#[derive(Default)]
struct WindowsHostProcessState {
    child: Mutex<Option<Child>>,
    logs: Arc<Mutex<Vec<String>>>,
}

#[derive(Default)]
struct ClipboardFileTransferState {
    transfers: Mutex<HashMap<String, NativeClipboardTransfer>>,
}

#[derive(Debug)]
struct NativeClipboardTransfer {
    root_dir: PathBuf,
    files: Vec<NativeClipboardFileEntry>,
}

#[derive(Debug)]
struct NativeClipboardFileEntry {
    name: String,
    path: PathBuf,
    expected_bytes: u64,
    written_bytes: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClipboardFilePayload {
    name: String,
    data_base64: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ClipboardFileWriteResult {
    save_mode: String,
    clipboard_written: bool,
    file_count: usize,
    total_bytes: u64,
    root_dir: String,
    paths: Vec<String>,
    reason: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClipboardFileMetaPayload {
    name: String,
    size: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BeginClipboardFileWritePayload {
    files: Vec<ClipboardFileMetaPayload>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BeginClipboardFileWriteResult {
    transfer_id: String,
    root_dir: String,
    file_count: usize,
    total_bytes: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppendClipboardFileChunkPayload {
    transfer_id: String,
    file_index: usize,
    offset: u64,
    data_base64: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppendClipboardFileChunkResult {
    transfer_id: String,
    file_index: usize,
    written_bytes: u64,
    total_written_bytes: u64,
    total_bytes: u64,
    complete: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FinishClipboardFileWritePayload {
    transfer_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CancelClipboardFileWritePayload {
    transfer_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WindowsHostReadinessRequest {
    host: Option<String>,
    port: Option<u16>,
    probe_video: Option<bool>,
    probe_audio: Option<bool>,
    require_open: Option<bool>,
    strict: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WindowsHostLaunchRequest {
    host: Option<String>,
    port: Option<u16>,
    password: String,
    screen_mode: Option<String>,
    audio_mode: Option<String>,
    input_mode: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopCommandResult {
    ok: bool,
    exit_code: Option<i32>,
    stdout: String,
    stderr: String,
    json: Option<Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WindowsHostProcessSnapshot {
    running: bool,
    pid: Option<u32>,
    discovery: Option<Value>,
    logs: Vec<String>,
    message: String,
}

fn safe_file_name(name: &str, index: usize) -> String {
    let fallback = format!("clipboard-{}", index + 1);
    let base_name = Path::new(name)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or(&fallback);
    let cleaned = base_name
        .chars()
        .map(|ch| match ch {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            ch if ch.is_control() => '_',
            ch => ch,
        })
        .collect::<String>()
        .trim()
        .trim_matches('.')
        .to_string();

    if cleaned.is_empty() {
        fallback
    } else {
        cleaned
    }
}

fn decode_base64_payload(data_base64: &str) -> Result<Vec<u8>, String> {
    let payload = data_base64
        .split_once(',')
        .map(|(_, payload)| payload)
        .unwrap_or(data_base64)
        .trim();
    general_purpose::STANDARD
        .decode(payload.as_bytes())
        .map_err(|error| format!("文件内容 base64 解码失败：{error}"))
}

fn make_clipboard_root_dir(transfer_id: &str) -> PathBuf {
    std::env::temp_dir()
        .join("lan-dual-control-windows-client-clipboard")
        .join(transfer_id)
}

fn make_clipboard_transfer_id() -> Result<String, String> {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_millis();
    Ok(format!("clip-{stamp}"))
}

fn clipboard_transfer_totals(transfer: &NativeClipboardTransfer) -> (u64, u64) {
    let total_bytes = transfer.files.iter().map(|file| file.expected_bytes).sum();
    let total_written_bytes = transfer.files.iter().map(|file| file.written_bytes).sum();
    (total_bytes, total_written_bytes)
}

fn clipboard_transfer_paths(transfer: &NativeClipboardTransfer) -> Vec<PathBuf> {
    transfer
        .files
        .iter()
        .map(|file| file.path.clone())
        .collect()
}

fn file_entry_result_paths(paths: &[PathBuf]) -> Vec<String> {
    paths
        .iter()
        .map(|path| path.to_string_lossy().to_string())
        .collect::<Vec<_>>()
}

#[cfg(windows)]
fn write_paths_to_clipboard(paths: &[PathBuf]) -> Result<(), String> {
    let path_strings = paths
        .iter()
        .map(|path| path.to_string_lossy().to_string())
        .collect::<Vec<_>>();
    let input = serde_json::to_string(&path_strings).map_err(|error| error.to_string())?;
    let script = [
        "$ErrorActionPreference = 'Stop'",
        "[Console]::InputEncoding = [System.Text.Encoding]::UTF8",
        "$paths = [Console]::In.ReadToEnd() | ConvertFrom-Json",
        "Set-Clipboard -Path $paths",
    ]
    .join("; ");

    let mut command = Command::new("powershell.exe");
    command
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &script,
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .creation_flags(CREATE_NO_WINDOW);

    let mut child = command
        .spawn()
        .map_err(|error| format!("启动 PowerShell 写入文件剪贴板失败：{error}"))?;
    if let Some(stdin) = child.stdin.as_mut() {
        stdin
            .write_all(input.as_bytes())
            .map_err(|error| format!("发送文件路径到 PowerShell 失败：{error}"))?;
    }
    let output = child
        .wait_with_output()
        .map_err(|error| format!("等待 PowerShell 写入文件剪贴板失败：{error}"))?;

    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Err(if stderr.is_empty() { stdout } else { stderr })
}

#[cfg(not(windows))]
fn write_paths_to_clipboard(_paths: &[PathBuf]) -> Result<(), String> {
    Err("当前不是 Windows 环境，不能写入系统文件剪贴板。".to_string())
}

fn repo_root() -> Result<PathBuf, String> {
    let mut candidates = Vec::new();
    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("..")
            .join(".."),
    );

    if let Ok(current_dir) = env::current_dir() {
        candidates.push(current_dir.clone());
        candidates.extend(current_dir.ancestors().map(Path::to_path_buf));
    }

    if let Ok(current_exe) = env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            candidates.push(exe_dir.to_path_buf());
            candidates.extend(exe_dir.ancestors().map(Path::to_path_buf));
        }
    }

    for candidate in candidates {
        let marker = candidate
            .join("apps")
            .join("windows-host")
            .join("server.mjs");
        if marker.exists() {
            return candidate
                .canonicalize()
                .map_err(|error| format!("解析项目目录失败：{error}"));
        }
    }

    Err("找不到项目目录，无法启动 Windows 被控端。".to_string())
}

fn normalize_host(value: Option<&String>) -> String {
    let host = value.map(|text| text.trim()).unwrap_or("");
    if host.is_empty() {
        "0.0.0.0".to_string()
    } else {
        host.to_string()
    }
}

fn normalize_port(value: Option<u16>) -> u16 {
    value.filter(|port| *port > 0).unwrap_or(43770)
}

fn normalize_mode(value: Option<&String>, allowed: &[&str], fallback: &str) -> String {
    let mode = value
        .map(|text| text.trim().to_ascii_lowercase())
        .unwrap_or_default();
    if allowed.iter().any(|item| *item == mode) {
        mode
    } else {
        fallback.to_string()
    }
}

fn add_hidden_flag(command: &mut Command) {
    #[cfg(windows)]
    {
        command.creation_flags(CREATE_NO_WINDOW);
    }
}

fn run_node_script(
    repo_root: &Path,
    script_path: &Path,
    args: &[String],
    envs: &[(String, String)],
) -> Result<DesktopCommandResult, String> {
    let mut command = Command::new("node");
    command
        .arg(script_path)
        .args(args)
        .current_dir(repo_root)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    for (key, value) in envs {
        command.env(key, value);
    }
    add_hidden_flag(&mut command);

    let output = command
        .output()
        .map_err(|error| format!("运行 Node 脚本失败：{error}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let json = serde_json::from_str::<Value>(stdout.trim()).ok();

    Ok(DesktopCommandResult {
        ok: output.status.success(),
        exit_code: output.status.code(),
        stdout,
        stderr,
        json,
    })
}

fn split_output_lines(text: &str) -> impl Iterator<Item = String> + '_ {
    text.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
}

fn push_host_log(logs: &Arc<Mutex<Vec<String>>>, line: impl Into<String>) {
    let line = line.into();
    if line.trim().is_empty() {
        return;
    }
    if let Ok(mut guard) = logs.lock() {
        guard.push(line);
        if guard.len() > MAX_HOST_LOG_LINES {
            let overflow = guard.len() - MAX_HOST_LOG_LINES;
            guard.drain(0..overflow);
        }
    }
}

fn clear_host_logs(state: &WindowsHostProcessState) -> Result<(), String> {
    let mut guard = state
        .logs
        .lock()
        .map_err(|_| "本机被控日志状态不可用。".to_string())?;
    guard.clear();
    Ok(())
}

fn host_logs(state: &WindowsHostProcessState) -> Vec<String> {
    state
        .logs
        .lock()
        .map(|guard| guard.clone())
        .unwrap_or_default()
}

fn append_command_result(
    logs: &Arc<Mutex<Vec<String>>>,
    title: &str,
    result: &DesktopCommandResult,
) {
    push_host_log(logs, format!("[INFO] {title}"));
    for line in split_output_lines(&result.stdout) {
        push_host_log(logs, line);
    }
    for line in split_output_lines(&result.stderr) {
        push_host_log(logs, format!("[ERR] {line}"));
    }
}

fn spawn_log_reader<R>(reader: R, label: &'static str, logs: Arc<Mutex<Vec<String>>>)
where
    R: Read + Send + 'static,
{
    thread::spawn(move || {
        let mut reader = BufReader::new(reader);
        let mut line = String::new();
        loop {
            line.clear();
            match reader.read_line(&mut line) {
                Ok(0) => break,
                Ok(_) => {
                    let text = line.trim_end_matches(['\r', '\n']).trim();
                    if !text.is_empty() {
                        push_host_log(&logs, format!("[{label}] {text}"));
                    }
                }
                Err(error) => {
                    push_host_log(&logs, format!("[{label}] 读取日志失败：{error}"));
                    break;
                }
            }
        }
    });
}

fn prune_stopped_host(state: &WindowsHostProcessState) -> Result<Option<u32>, String> {
    let mut guard = state
        .child
        .lock()
        .map_err(|_| "本机被控进程状态不可用。".to_string())?;
    if let Some(child) = guard.as_mut() {
        match child.try_wait() {
            Ok(Some(status)) => {
                push_host_log(&state.logs, format!("[INFO] Windows host 已退出：{status}"));
                *guard = None;
                Ok(None)
            }
            Ok(None) => Ok(Some(child.id())),
            Err(error) => Err(format!("读取 Windows host 状态失败：{error}")),
        }
    } else {
        Ok(None)
    }
}

fn stop_managed_host(state: &WindowsHostProcessState) -> Result<bool, String> {
    let mut guard = state
        .child
        .lock()
        .map_err(|_| "本机被控进程状态不可用。".to_string())?;
    let Some(mut child) = guard.take() else {
        return Ok(false);
    };

    let pid = child.id();
    push_host_log(
        &state.logs,
        format!("[INFO] 正在停止 Windows host PID {pid}"),
    );

    #[cfg(windows)]
    {
        let mut command = Command::new("taskkill.exe");
        command
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        add_hidden_flag(&mut command);
        match command.output() {
            Ok(output) if output.status.success() => {
                for line in split_output_lines(&String::from_utf8_lossy(&output.stdout)) {
                    push_host_log(&state.logs, format!("[INFO] {line}"));
                }
            }
            Ok(output) => {
                let stderr = String::from_utf8_lossy(&output.stderr);
                push_host_log(
                    &state.logs,
                    format!("[WARN] taskkill 未能完整停止进程：{}", stderr.trim()),
                );
                let _ = child.kill();
            }
            Err(error) => {
                push_host_log(&state.logs, format!("[WARN] taskkill 启动失败：{error}"));
                let _ = child.kill();
            }
        }
    }

    #[cfg(not(windows))]
    {
        let _ = child.kill();
    }

    let _ = child.wait();
    push_host_log(&state.logs, "[OK] Windows host 已停止");
    Ok(true)
}

fn get_process_snapshot(
    state: &WindowsHostProcessState,
    discovery: Option<Value>,
    message: impl Into<String>,
) -> Result<WindowsHostProcessSnapshot, String> {
    let pid = prune_stopped_host(state)?;
    Ok(WindowsHostProcessSnapshot {
        running: pid.is_some(),
        pid,
        discovery,
        logs: host_logs(state),
        message: message.into(),
    })
}

fn request_discovery(port: u16) -> Result<Value, String> {
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    let mut stream = TcpStream::connect_timeout(&address, Duration::from_millis(700))
        .map_err(|error| error.to_string())?;
    stream
        .set_read_timeout(Some(Duration::from_millis(900)))
        .map_err(|error| error.to_string())?;
    stream
        .set_write_timeout(Some(Duration::from_millis(900)))
        .map_err(|error| error.to_string())?;
    stream
        .write_all(b"GET /discovery HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
        .map_err(|error| error.to_string())?;

    let mut response = String::new();
    stream
        .read_to_string(&mut response)
        .map_err(|error| error.to_string())?;
    if !(response.starts_with("HTTP/1.1 200") || response.starts_with("HTTP/1.0 200")) {
        let first_line = response.lines().next().unwrap_or("empty response");
        return Err(format!("discovery HTTP 异常：{first_line}"));
    }
    let (headers, body) = response
        .split_once("\r\n\r\n")
        .ok_or_else(|| "discovery HTTP 响应缺少正文。".to_string())?;
    let body = if headers
        .to_ascii_lowercase()
        .contains("transfer-encoding: chunked")
    {
        decode_chunked_body(body)?
    } else {
        body.to_string()
    };
    serde_json::from_str::<Value>(body.trim())
        .map_err(|error| format!("discovery JSON 解析失败：{error}"))
}

fn decode_chunked_body(body: &str) -> Result<String, String> {
    let bytes = body.as_bytes();
    let mut index = 0_usize;
    let mut decoded = Vec::new();

    loop {
        let line_end = find_crlf(bytes, index)
            .ok_or_else(|| "chunked discovery 响应缺少 chunk 长度。".to_string())?;
        let size_text = std::str::from_utf8(&bytes[index..line_end])
            .map_err(|error| format!("chunk 长度不是 UTF-8：{error}"))?
            .split(';')
            .next()
            .unwrap_or("")
            .trim();
        let size = usize::from_str_radix(size_text, 16)
            .map_err(|error| format!("chunk 长度解析失败：{error}"))?;
        index = line_end + 2;
        if size == 0 {
            break;
        }
        if index + size > bytes.len() {
            return Err("chunked discovery 响应长度不足。".to_string());
        }
        decoded.extend_from_slice(&bytes[index..index + size]);
        index += size;
        if bytes.get(index..index + 2) != Some(b"\r\n") {
            return Err("chunked discovery 响应缺少 chunk 结束符。".to_string());
        }
        index += 2;
    }

    String::from_utf8(decoded).map_err(|error| format!("chunked discovery 正文不是 UTF-8：{error}"))
}

fn find_crlf(bytes: &[u8], start: usize) -> Option<usize> {
    bytes
        .get(start..)?
        .windows(2)
        .position(|item| item == b"\r\n")
        .map(|offset| start + offset)
}

fn wait_for_discovery(port: u16, timeout: Duration) -> Result<Value, String> {
    let deadline = Instant::now() + timeout;
    let mut last_error = String::new();
    while Instant::now() < deadline {
        match request_discovery(port) {
            Ok(discovery) => return Ok(discovery),
            Err(error) => {
                last_error = error;
                thread::sleep(Duration::from_millis(250));
            }
        }
    }
    Err(if last_error.is_empty() {
        "Windows host 没有及时响应 /discovery。".to_string()
    } else {
        format!("Windows host 没有及时响应 /discovery：{last_error}")
    })
}

fn launch_env(
    host: &str,
    port: u16,
    password: &str,
    screen_mode: &str,
    audio_mode: &str,
    input_mode: &str,
) -> Vec<(String, String)> {
    let mut envs = vec![
        ("LAN_DUAL_HOST".to_string(), host.to_string()),
        ("LAN_DUAL_PORT".to_string(), port.to_string()),
        ("LAN_DUAL_PASSWORD".to_string(), password.to_string()),
        (
            "LAN_DUAL_WINDOWS_SCREEN_MODE".to_string(),
            screen_mode.to_string(),
        ),
        (
            "LAN_DUAL_WINDOWS_AUDIO_MODE".to_string(),
            audio_mode.to_string(),
        ),
        (
            "LAN_DUAL_WINDOWS_INPUT_MODE".to_string(),
            input_mode.to_string(),
        ),
    ];

    let default_ffmpeg = Path::new("C:\\DevTools\\ffmpeg\\bin\\ffmpeg.exe");
    if default_ffmpeg.exists() {
        envs.push((
            "LAN_DUAL_FFMPEG".to_string(),
            default_ffmpeg.to_string_lossy().to_string(),
        ));
    }
    envs
}

fn mode_args(
    host: &str,
    port: u16,
    screen_mode: &str,
    audio_mode: &str,
    input_mode: &str,
) -> Vec<String> {
    vec![
        "--host".to_string(),
        host.to_string(),
        "--port".to_string(),
        port.to_string(),
        "--screenMode".to_string(),
        screen_mode.to_string(),
        "--audioMode".to_string(),
        audio_mode.to_string(),
        "--inputMode".to_string(),
        input_mode.to_string(),
    ]
}

#[tauri::command]
fn write_files_to_clipboard(
    files: Vec<ClipboardFilePayload>,
) -> Result<ClipboardFileWriteResult, String> {
    if files.is_empty() {
        return Err("没有可写入系统文件剪贴板的远端文件。".to_string());
    }

    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_millis();
    let root_dir = std::env::temp_dir()
        .join("lan-dual-control-windows-client-clipboard")
        .join(format!("clip-{stamp}"));
    fs::create_dir_all(&root_dir).map_err(|error| format!("创建临时目录失败：{error}"))?;

    let mut paths = Vec::with_capacity(files.len());
    let mut total_bytes = 0_u64;

    for (index, file) in files.iter().enumerate() {
        let bytes = decode_base64_payload(&file.data_base64)?;
        let name = safe_file_name(&file.name, index);
        let path = root_dir.join(format!("{:03}-{}", index + 1, name));
        fs::write(&path, &bytes).map_err(|error| format!("写入临时文件失败：{error}"))?;
        total_bytes += bytes.len() as u64;
        paths.push(path);
    }

    let path_strings = paths
        .iter()
        .map(|path| path.to_string_lossy().to_string())
        .collect::<Vec<_>>();

    match write_paths_to_clipboard(&paths) {
        Ok(()) => Ok(ClipboardFileWriteResult {
            save_mode: "clipboard".to_string(),
            clipboard_written: true,
            file_count: paths.len(),
            total_bytes,
            root_dir: root_dir.to_string_lossy().to_string(),
            paths: path_strings,
            reason: "Windows 系统文件剪贴板已写入。".to_string(),
        }),
        Err(reason) => Ok(ClipboardFileWriteResult {
            save_mode: "temp".to_string(),
            clipboard_written: false,
            file_count: paths.len(),
            total_bytes,
            root_dir: root_dir.to_string_lossy().to_string(),
            paths: path_strings,
            reason: format!("文件已保存到临时目录，但系统文件剪贴板写入失败：{reason}"),
        }),
    }
}

#[tauri::command]
fn begin_clipboard_file_write(
    payload: BeginClipboardFileWritePayload,
    state: tauri::State<'_, ClipboardFileTransferState>,
) -> Result<BeginClipboardFileWriteResult, String> {
    if payload.files.is_empty() {
        return Err("没有可写入系统文件剪贴板的远端文件。".to_string());
    }

    let mut transfers = state
        .transfers
        .lock()
        .map_err(|_| "文件剪贴板传输状态不可用。".to_string())?;
    let base_id = make_clipboard_transfer_id()?;
    let mut transfer_id = base_id.clone();
    let mut suffix = 1_u32;
    while transfers.contains_key(&transfer_id) {
        suffix += 1;
        transfer_id = format!("{base_id}-{suffix}");
    }

    let root_dir = make_clipboard_root_dir(&transfer_id);
    fs::create_dir_all(&root_dir).map_err(|error| format!("创建临时目录失败：{error}"))?;

    let mut entries = Vec::with_capacity(payload.files.len());
    let mut total_bytes = 0_u64;
    for (index, file) in payload.files.iter().enumerate() {
        let name = safe_file_name(&file.name, index);
        let path = root_dir.join(format!("{:03}-{}", index + 1, name));
        fs::File::create(&path).map_err(|error| format!("创建临时文件失败：{error}"))?;
        total_bytes = total_bytes.saturating_add(file.size);
        entries.push(NativeClipboardFileEntry {
            name,
            path,
            expected_bytes: file.size,
            written_bytes: 0,
        });
    }

    transfers.insert(
        transfer_id.clone(),
        NativeClipboardTransfer {
            root_dir: root_dir.clone(),
            files: entries,
        },
    );

    Ok(BeginClipboardFileWriteResult {
        transfer_id,
        root_dir: root_dir.to_string_lossy().to_string(),
        file_count: payload.files.len(),
        total_bytes,
    })
}

#[tauri::command]
fn append_clipboard_file_chunk(
    payload: AppendClipboardFileChunkPayload,
    state: tauri::State<'_, ClipboardFileTransferState>,
) -> Result<AppendClipboardFileChunkResult, String> {
    let bytes = decode_base64_payload(&payload.data_base64)?;
    let mut transfers = state
        .transfers
        .lock()
        .map_err(|_| "文件剪贴板传输状态不可用。".to_string())?;
    let transfer = transfers
        .get_mut(&payload.transfer_id)
        .ok_or_else(|| "文件剪贴板传输不存在或已结束。".to_string())?;
    let file = transfer
        .files
        .get_mut(payload.file_index)
        .ok_or_else(|| "文件索引无效。".to_string())?;

    if payload.offset != file.written_bytes {
        return Err(format!(
            "文件 {} 分块偏移不连续：收到 {}，预期 {}。",
            file.name, payload.offset, file.written_bytes
        ));
    }

    let next_written = file
        .written_bytes
        .checked_add(bytes.len() as u64)
        .ok_or_else(|| "文件大小超出可处理范围。".to_string())?;
    if next_written > file.expected_bytes {
        return Err(format!(
            "文件 {} 写入超出预期大小：{} > {}。",
            file.name, next_written, file.expected_bytes
        ));
    }

    let mut handle = fs::OpenOptions::new()
        .append(true)
        .open(&file.path)
        .map_err(|error| format!("打开临时文件失败：{error}"))?;
    handle
        .write_all(&bytes)
        .map_err(|error| format!("写入临时文件失败：{error}"))?;
    file.written_bytes = next_written;
    let written_bytes = file.written_bytes;

    let (total_bytes, total_written_bytes) = clipboard_transfer_totals(transfer);
    Ok(AppendClipboardFileChunkResult {
        transfer_id: payload.transfer_id,
        file_index: payload.file_index,
        written_bytes,
        total_written_bytes,
        total_bytes,
        complete: total_written_bytes == total_bytes,
    })
}

#[tauri::command]
fn finish_clipboard_file_write(
    payload: FinishClipboardFileWritePayload,
    state: tauri::State<'_, ClipboardFileTransferState>,
) -> Result<ClipboardFileWriteResult, String> {
    let (paths, total_bytes, root_dir) = {
        let transfers = state
            .transfers
            .lock()
            .map_err(|_| "文件剪贴板传输状态不可用。".to_string())?;
        let transfer = transfers
            .get(&payload.transfer_id)
            .ok_or_else(|| "文件剪贴板传输不存在或已结束。".to_string())?;
        for file in &transfer.files {
            if file.written_bytes != file.expected_bytes {
                return Err(format!(
                    "文件 {} 尚未写完：{} / {}。",
                    file.name, file.written_bytes, file.expected_bytes
                ));
            }
        }
        let (total_bytes, _) = clipboard_transfer_totals(transfer);
        (
            clipboard_transfer_paths(transfer),
            total_bytes,
            transfer.root_dir.clone(),
        )
    };

    {
        let mut transfers = state
            .transfers
            .lock()
            .map_err(|_| "文件剪贴板传输状态不可用。".to_string())?;
        transfers.remove(&payload.transfer_id);
    }

    let path_strings = file_entry_result_paths(&paths);
    match write_paths_to_clipboard(&paths) {
        Ok(()) => Ok(ClipboardFileWriteResult {
            save_mode: "clipboard".to_string(),
            clipboard_written: true,
            file_count: paths.len(),
            total_bytes,
            root_dir: root_dir.to_string_lossy().to_string(),
            paths: path_strings,
            reason: "Windows 系统文件剪贴板已写入。".to_string(),
        }),
        Err(reason) => Ok(ClipboardFileWriteResult {
            save_mode: "temp".to_string(),
            clipboard_written: false,
            file_count: paths.len(),
            total_bytes,
            root_dir: root_dir.to_string_lossy().to_string(),
            paths: path_strings,
            reason: format!("文件已保存到临时目录，但系统文件剪贴板写入失败：{reason}"),
        }),
    }
}

#[tauri::command]
fn cancel_clipboard_file_write(
    payload: CancelClipboardFileWritePayload,
    state: tauri::State<'_, ClipboardFileTransferState>,
) -> Result<bool, String> {
    let transfer = {
        let mut transfers = state
            .transfers
            .lock()
            .map_err(|_| "文件剪贴板传输状态不可用。".to_string())?;
        transfers.remove(&payload.transfer_id)
    };

    if let Some(transfer) = transfer {
        let _ = fs::remove_dir_all(&transfer.root_dir);
        Ok(true)
    } else {
        Ok(false)
    }
}

#[tauri::command]
fn run_windows_host_readiness(
    request: WindowsHostReadinessRequest,
) -> Result<DesktopCommandResult, String> {
    let repo = repo_root()?;
    let script = repo
        .join("scripts")
        .join("windows")
        .join("check-windows-host-readiness.mjs");
    let host = normalize_host(request.host.as_ref());
    let port = normalize_port(request.port);
    let mut args = vec![
        "--json".to_string(),
        "--host".to_string(),
        host,
        "--port".to_string(),
        port.to_string(),
    ];

    if request.probe_video.unwrap_or(false) {
        args.push("--probeVideo".to_string());
    }
    if request.probe_audio.unwrap_or(false) {
        args.push("--probeAudio".to_string());
    }
    if request.require_open.unwrap_or(false) {
        args.push("--requireOpen".to_string());
    }
    if request.strict.unwrap_or(false) {
        args.push("--strict".to_string());
    }

    run_node_script(&repo, &script, &args, &[])
}

#[tauri::command]
fn preview_windows_firewall_rule(
    request: WindowsHostReadinessRequest,
) -> Result<DesktopCommandResult, String> {
    let repo = repo_root()?;
    let script = repo
        .join("scripts")
        .join("windows")
        .join("check-windows-firewall.mjs");
    let host = normalize_host(request.host.as_ref());
    let port = normalize_port(request.port);
    let args = vec![
        "--host".to_string(),
        host,
        "--port".to_string(),
        port.to_string(),
        "--dryRunRule".to_string(),
    ];

    run_node_script(&repo, &script, &args, &[])
}

#[tauri::command]
fn start_windows_host(
    request: WindowsHostLaunchRequest,
    state: tauri::State<'_, WindowsHostProcessState>,
) -> Result<WindowsHostProcessSnapshot, String> {
    if let Some(pid) = prune_stopped_host(&state)? {
        return get_process_snapshot(
            &state,
            None,
            format!("Windows 被控端已经在运行，PID {pid}。"),
        );
    }

    let password = request.password.trim().to_string();
    if password.is_empty() {
        return Err("请先输入 Windows 被控端连接密码。".to_string());
    }

    let repo = repo_root()?;
    let host = normalize_host(request.host.as_ref());
    let port = normalize_port(request.port);
    let screen_mode = normalize_mode(
        request.screen_mode.as_ref(),
        &["auto", "ffmpeg", "system", "mock"],
        "auto",
    );
    let audio_mode = normalize_mode(
        request.audio_mode.as_ref(),
        &["mock", "wasapi", "dshow"],
        "mock",
    );
    let input_mode = normalize_mode(
        request.input_mode.as_ref(),
        &["log", "system", "auto"],
        "log",
    );
    let envs = launch_env(
        &host,
        port,
        &password,
        &screen_mode,
        &audio_mode,
        &input_mode,
    );
    clear_host_logs(&state)?;
    push_host_log(
        &state.logs,
        format!("[INFO] 准备启动 Windows host：{host}:{port}"),
    );

    let start_script = repo
        .join("scripts")
        .join("windows")
        .join("start-windows-host.mjs");
    let mut dry_run_args = mode_args(&host, port, &screen_mode, &audio_mode, &input_mode);
    dry_run_args.push("--requirePassword".to_string());
    dry_run_args.push("--dryRun".to_string());
    let launch_plan = run_node_script(&repo, &start_script, &dry_run_args, &envs)?;
    append_command_result(&state.logs, "启动计划", &launch_plan);
    if !launch_plan.ok {
        return Err("Windows host 启动计划检查失败，请查看本机被控日志。".to_string());
    }

    let server_path = repo.join("apps").join("windows-host").join("server.mjs");
    let mut command = Command::new("node");
    command
        .arg(server_path)
        .arg(port.to_string())
        .arg(&host)
        .current_dir(&repo)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    for (key, value) in &envs {
        command.env(key, value);
    }
    add_hidden_flag(&mut command);

    let mut child = command
        .spawn()
        .map_err(|error| format!("启动 Windows host 失败：{error}"))?;
    let pid = child.id();
    if let Some(stdout) = child.stdout.take() {
        spawn_log_reader(stdout, "host", state.logs.clone());
    }
    if let Some(stderr) = child.stderr.take() {
        spawn_log_reader(stderr, "host:err", state.logs.clone());
    }

    {
        let mut guard = state
            .child
            .lock()
            .map_err(|_| "本机被控进程状态不可用。".to_string())?;
        *guard = Some(child);
    }
    push_host_log(
        &state.logs,
        format!("[OK] Windows host 进程已启动：PID {pid}"),
    );

    let discovery = match wait_for_discovery(port, Duration::from_millis(9000)) {
        Ok(value) => value,
        Err(error) => {
            push_host_log(&state.logs, format!("[ERROR] {error}"));
            let _ = stop_managed_host(&state);
            return Err(error);
        }
    };
    push_host_log(&state.logs, "[OK] /discovery 已就绪，Mac 端可以连接。");

    let firewall_script = repo
        .join("scripts")
        .join("windows")
        .join("check-windows-firewall.mjs");
    let firewall_args = vec![
        "--host".to_string(),
        host,
        "--port".to_string(),
        port.to_string(),
    ];
    if let Ok(firewall_result) = run_node_script(&repo, &firewall_script, &firewall_args, &envs) {
        append_command_result(&state.logs, "局域网/防火墙检查", &firewall_result);
    }

    get_process_snapshot(&state, Some(discovery), "Windows 被控端已启动。")
}

#[tauri::command]
fn stop_windows_host(
    state: tauri::State<'_, WindowsHostProcessState>,
) -> Result<WindowsHostProcessSnapshot, String> {
    let stopped = stop_managed_host(&state)?;
    get_process_snapshot(
        &state,
        None,
        if stopped {
            "Windows 被控端已停止。"
        } else {
            "Windows 被控端当前没有由桌面壳启动的进程。"
        },
    )
}

#[tauri::command]
fn get_windows_host_status(
    state: tauri::State<'_, WindowsHostProcessState>,
) -> Result<WindowsHostProcessSnapshot, String> {
    get_process_snapshot(&state, None, "Windows 被控端状态已刷新。")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_chunked_discovery_body() {
        let body = "a\r\n{\"ok\":true\r\n2\r\n}\n\r\n0\r\n\r\n";
        assert_eq!(
            decode_chunked_body(body).expect("chunked body"),
            "{\"ok\":true}\n"
        );
    }
}

fn main() {
    tauri::Builder::default()
        .manage(WindowsHostProcessState::default())
        .manage(ClipboardFileTransferState::default())
        .invoke_handler(tauri::generate_handler![
            write_files_to_clipboard,
            begin_clipboard_file_write,
            append_clipboard_file_chunk,
            finish_clipboard_file_write,
            cancel_clipboard_file_write,
            run_windows_host_readiness,
            preview_windows_firewall_rule,
            start_windows_host,
            stop_windows_host,
            get_windows_host_status
        ])
        .on_window_event(|window, event| {
            if matches!(event, WindowEvent::CloseRequested { .. }) {
                let state = window.state::<WindowsHostProcessState>();
                let _ = stop_managed_host(&state);
            }
        })
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                window.set_title("局域网远控 - Windows 控制端")?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run Windows desktop shell");
}
