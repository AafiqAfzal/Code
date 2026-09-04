// Zabrání otevření konzole na Windows
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    pedagogicky_denik_lib::run()
}
