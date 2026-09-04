//! Desktopová vrstva Pedagogického deníku (Tauri). Veškerá logika je v rozhraní
//! (React); zde se jen registrují pluginy pro soubory, dialogy, oznámení a aktualizace.

/// Zápis chyb z rozhraní do standardního chybového výstupu (pro ladění a testy).
#[tauri::command]
fn log_line(msg: String) {
    eprintln!("[denik] {msg}");
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![log_line])
        .setup(|_app| {
            eprintln!("[denik] setup ok");
            Ok(())
        })
        .on_page_load(|_webview, payload| {
            eprintln!("[denik] page {:?} {}", payload.event(), payload.url());
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .run(tauri::generate_context!())
        .expect("chyba při spuštění aplikace");
}
