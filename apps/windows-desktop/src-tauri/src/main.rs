#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                window.set_title("局域网远控 - Windows 控制端")?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run Windows desktop shell");
}
