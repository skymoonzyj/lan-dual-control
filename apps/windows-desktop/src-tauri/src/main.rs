#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

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

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![write_files_to_clipboard])
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                window.set_title("局域网远控 - Windows 控制端")?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run Windows desktop shell");
}
