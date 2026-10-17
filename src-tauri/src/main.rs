// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;
mod models;
mod commands;

use std::sync::Mutex;
use commands::AppState;
use db::Database;

#[cfg(target_os = "windows")]
fn show_native_message_box(title: &str, message: &str) {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    let wide_title: Vec<u16> = OsStr::new(title).encode_wide().chain(std::iter::once(0)).collect();
    let wide_msg: Vec<u16> = OsStr::new(message).encode_wide().chain(std::iter::once(0)).collect();

    #[link(name = "user32")]
    extern "system" {
        fn MessageBoxW(hwnd: isize, text: *const u16, caption: *const u16, utype: u32) -> i32;
    }

    unsafe {
        MessageBoxW(0, wide_msg.as_ptr(), wide_title.as_ptr(), 0x00000010 /* MB_ICONERROR */);
    }
}

#[cfg(not(target_os = "windows"))]
fn show_native_message_box(_title: &str, _message: &str) {}

fn main() {
    // 强制将当前工作目录锁定在可执行文件所在目录，防止快捷方式启动导致路径漂移
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(parent) = exe_path.parent() {
            let _ = std::env::set_current_dir(parent);
        }
    }

    // 设置全局 panic hook，确保崩溃时大声报错写入 panic.log 并弹出系统对话框展示真实错误
    std::panic::set_hook(Box::new(|panic_info| {
        let payload = if let Some(s) = panic_info.payload().downcast_ref::<&str>() {
            (*s).to_string()
        } else if let Some(s) = panic_info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            format!("{:?}", panic_info)
        };
        let location = panic_info.location().map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column())).unwrap_or_default();
        let msg = format!("[CRITICAL PANIC] 计件管理系统发生异常崩溃:\n位置: {}\n原因: {}\n", location, payload);
        eprintln!("{}", msg);
        let _ = std::fs::write("panic.log", &msg);
        show_native_message_box("计件管理系统 - 崩溃详情", &msg);
    }));

    let db = match Database::new() {
        Ok(d) => d,
        Err(e) => {
            let err_msg = format!("[CRITICAL] 数据库启动失败: {}", e);
            eprintln!("{}", err_msg);
            let _ = std::fs::write("panic.log", &err_msg);
            show_native_message_box("计件管理系统 - 数据库错误", &err_msg);
            panic!("{}", err_msg);
        }
    };

    let state = AppState {
        db: Mutex::new(db),
    };

    let result = tauri::Builder::default()
        .manage(state)
        .setup(|app| {
            println!("[INFO] 正在安全初始化主窗口...");
            let handle = app.handle();
            let windows_config = &app.config().app.windows;
            if windows_config.is_empty() {
                let err_msg = "[CRITICAL] 配置文件中未定义任何窗口！".to_string();
                show_native_message_box("计件管理系统 - 错误", &err_msg);
                return Err(Box::new(std::io::Error::new(std::io::ErrorKind::Other, err_msg)));
            }

            let main_config = &windows_config[0];
            
            // 候选用户数据目录列表（优先使用系统临时目录，具备最完整的用户级读写执行权限，彻底避开 os error 5）
            let candidate_dirs = vec![
                std::env::temp_dir().join("piecework_webview_data"),
                std::env::var_os("LOCALAPPDATA")
                    .map(std::path::PathBuf::from)
                    .unwrap_or_else(std::env::temp_dir)
                    .join("piecework_system")
                    .join("webview_cache"),
                std::path::PathBuf::from("data").join("webview_cache"),
            ];

            let mut last_error = String::new();
            let mut window_created = false;

            for dir in candidate_dirs {
                let _ = std::fs::create_dir_all(&dir);
                println!("[INFO] 尝试使用 WebView 数据目录: {:?}", dir);
                match tauri::WebviewWindowBuilder::from_config(handle, main_config) {
                    Ok(builder) => {
                        let builder = builder.data_directory(dir.clone());
                        match builder.build() {
                            Ok(win) => {
                                let _ = win.show();
                                let _ = win.unminimize();
                                let _ = win.set_focus();
                                println!("[INFO] 主窗口创建并显示成功！使用目录: {:?}", dir);
                                window_created = true;
                                break;
                            }
                            Err(e) => {
                                last_error = format!("{}", e);
                                eprintln!("[WARN] 目录 {:?} 创建 WebView 失败: {}", dir, e);
                            }
                        }
                    }
                    Err(e) => {
                        last_error = format!("{}", e);
                        eprintln!("[WARN] 解析配置失败: {}", e);
                    }
                }
            }

            if !window_created {
                let err_msg = format!("[CRITICAL] 构建主窗口 WebView 失败:\n{}\n请检查 Windows WebView2 运行时状态。", last_error);
                eprintln!("{}", err_msg);
                let _ = std::fs::write("panic.log", &err_msg);
                show_native_message_box("计件管理系统 - WebView2 错误", &err_msg);
                return Err(Box::new(std::io::Error::new(std::io::ErrorKind::Other, err_msg)));
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_departments,
            commands::save_department,
            commands::delete_department,
            commands::get_teams,
            commands::save_team,
            commands::delete_team,
            commands::get_workshops,
            commands::get_stations,
            commands::save_station,
            commands::get_employees,
            commands::add_employee,
            commands::update_employee,
            commands::delete_employee,
            commands::assign_employee_station,
            commands::get_station_employees,
            commands::get_processes,
            commands::save_process_with_pricing,
            commands::get_process_price_history,
            commands::delete_process,
            commands::get_records,
            commands::add_record,
            commands::add_team_batch_record,
            commands::delete_record,
            commands::settle_records,
            commands::get_payroll_summary,
            commands::get_station_summary,
            commands::get_process_stats,
            commands::get_system_stats,
            commands::backup_database,
            commands::list_backups,
            commands::restore_backup,
            commands::delete_backup,
            commands::open_backup_folder,
            commands::export_csv_records,
            commands::export_csv_payroll,
            commands::export_csv_stations,
            commands::clear_all_data,
            commands::get_product_models,
            commands::save_product_model,
            commands::delete_product_model,
            commands::get_next_product_code,
            commands::get_hole_specs,
            commands::add_hole_spec,
            commands::delete_hole_spec,
            commands::get_product_routes,
            commands::save_product_routes,
            commands::get_all_product_routes_summary,
            commands::get_stations_by_product,
            commands::get_processes_by_product_station,
        ])
        .run(tauri::generate_context!());

    if let Err(e) = result {
        let err_msg = format!("[CRITICAL] 运行 Tauri 桌面应用失败: {}", e);
        eprintln!("{}", err_msg);
        let _ = std::fs::write("panic.log", &err_msg);
        show_native_message_box("计件管理系统 - 启动失败", &err_msg);
    }
}

