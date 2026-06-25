mod camera;

use camera::WsState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(WsState::default())
        .invoke_handler(tauri::generate_handler![
            camera::camera_request,
            camera::camera_ws_connect,
            camera::camera_ws_send,
            camera::camera_ws_disconnect,
            camera::discover_cameras,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
