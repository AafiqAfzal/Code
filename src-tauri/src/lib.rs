//! Desktopová vrstva Pedagogického deníku (Tauri). Veškerá logika je v rozhraní
//! (React); zde se jen registrují pluginy pro soubory, dialogy, oznámení a aktualizace.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
