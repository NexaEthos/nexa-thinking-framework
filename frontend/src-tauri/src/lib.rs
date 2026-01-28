use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::{Manager, RunEvent};

struct BackendProcess(Mutex<Option<Child>>);

fn find_backend_binary(app_handle: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    let binary_name = if cfg!(target_os = "windows") {
        "nexa-backend.exe"
    } else {
        "nexa-backend"
    };
    
    let mut search_paths: Vec<std::path::PathBuf> = Vec::new();
    
    if let Ok(resource_dir) = app_handle.path().resource_dir() {
        log::info!("Resource dir: {}", resource_dir.display());
        search_paths.push(resource_dir.join("binaries").join("nexa-backend").join(binary_name));
        search_paths.push(resource_dir.join("nexa-backend").join(binary_name));
        search_paths.push(resource_dir.join(binary_name));
    }
    
    if let Ok(exe_path) = std::env::current_exe() {
        log::info!("Exe path: {}", exe_path.display());
        if let Some(exe_dir) = exe_path.parent() {
            search_paths.push(exe_dir.join("binaries").join("nexa-backend").join(binary_name));
            search_paths.push(exe_dir.join("nexa-backend").join(binary_name));
            search_paths.push(exe_dir.join(binary_name));
            search_paths.push(exe_dir.join("resources").join("binaries").join("nexa-backend").join(binary_name));
            search_paths.push(exe_dir.join("resources").join("nexa-backend").join(binary_name));
            search_paths.push(exe_dir.join("_up_").join("resources").join("binaries").join("nexa-backend").join(binary_name));
            if let Some(parent_dir) = exe_dir.parent() {
                search_paths.push(parent_dir.join("resources").join("binaries").join("nexa-backend").join(binary_name));
                search_paths.push(parent_dir.join("resources").join("nexa-backend").join(binary_name));
                search_paths.push(parent_dir.join("binaries").join("nexa-backend").join(binary_name));
            }
        }
    }
    
    if let Ok(app_data) = app_handle.path().app_local_data_dir() {
        log::info!("App local data dir: {}", app_data.display());
        search_paths.push(app_data.join("binaries").join("nexa-backend").join(binary_name));
        search_paths.push(app_data.join("nexa-backend").join(binary_name));
    }
    
    for path in &search_paths {
        log::info!("Checking path: {} (exists: {})", path.display(), path.exists());
        if path.exists() {
            if let Some(parent) = path.parent() {
                log::info!("Working dir will be: {}", parent.display());
                if let Ok(entries) = std::fs::read_dir(parent) {
                    for entry in entries.flatten() {
                        log::info!("  - {}", entry.path().display());
                    }
                }
            }
            return Some(path.clone());
        }
    }
    
    log::warn!("Backend binary not found in any search path");
    if let Ok(resource_dir) = app_handle.path().resource_dir() {
        log::warn!("Listing resource dir contents:");
        list_dir_recursive(&resource_dir, 0);
    }
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            log::warn!("Listing exe dir contents:");
            list_dir_recursive(exe_dir, 0);
        }
    }
    None
}

fn list_dir_recursive(dir: &std::path::Path, depth: usize) {
    if depth > 3 {
        return;
    }
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let indent = "  ".repeat(depth);
            let path = entry.path();
            log::info!("{}{}", indent, path.display());
            if path.is_dir() {
                list_dir_recursive(&path, depth + 1);
            }
        }
    }
}

fn start_backend_bundled(binary_path: &std::path::Path) -> Option<Child> {
    let working_dir = binary_path.parent()?;
    log::info!("Starting bundled backend from {}", binary_path.display());
    log::info!("Working directory: {}", working_dir.display());
    
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        
        match Command::new(binary_path)
            .current_dir(working_dir)
            .env("PORT", "8000")
            .env("HOST", "127.0.0.1")
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
        {
            Ok(child) => {
                log::info!("Backend spawned with PID: {}", child.id());
                return Some(child);
            }
            Err(e) => {
                log::error!("Failed to spawn backend: {e}");
                return None;
            }
        }
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        match Command::new(binary_path)
            .current_dir(working_dir)
            .env("PORT", "8000")
            .env("HOST", "127.0.0.1")
            .spawn()
        {
            Ok(child) => {
                log::info!("Backend spawned with PID: {}", child.id());
                Some(child)
            }
            Err(e) => {
                log::error!("Failed to spawn backend: {e}");
                None
            }
        }
    }
}

fn start_backend_dev() -> Option<Child> {
    let exe_path = std::env::current_exe().ok()?;
    let project_root = exe_path
        .parent()?
        .parent()?
        .parent()?
        .parent()?
        .parent()?;
    let backend_dir = project_root.join("backend");

    if !backend_dir.exists() {
        log::warn!("Backend directory not found at {}", backend_dir.display());
        return None;
    }

    let venv_python = if cfg!(target_os = "windows") {
        backend_dir.join(".venv").join("Scripts").join("python.exe")
    } else {
        backend_dir.join(".venv").join("bin").join("python")
    };

    if !venv_python.exists() {
        log::warn!("Python venv not found at {}", venv_python.display());
        return None;
    }

    log::info!("Starting dev backend from {}", backend_dir.display());
    Command::new(&venv_python)
        .args(["-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000"])
        .current_dir(&backend_dir)
        .spawn()
        .ok()
}

fn stop_backend(process: &mut Option<Child>) {
    if let Some(child) = process {
        log::info!("Stopping backend process...");
        let _ = child.kill();
        let _ = child.wait();
    }
}

#[allow(clippy::missing_panics_doc)]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .manage(BackendProcess(Mutex::new(None)))
        .setup(|app| {
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log::LevelFilter::Info)
                    .build(),
            )?;

            let backend = if let Some(binary_path) = find_backend_binary(app.handle()) {
                start_backend_bundled(&binary_path)
            } else {
                log::info!("No bundled backend found, trying dev mode...");
                start_backend_dev()
            };

            if backend.is_some() {
                log::info!("Backend process started successfully");
            } else {
                log::warn!("Failed to start backend - ensure it's running separately");
            }

            let state = app.state::<BackendProcess>();
            *state.0.lock().unwrap() = backend;

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let RunEvent::Exit = event {
                let state = app_handle.state::<BackendProcess>();
                stop_backend(&mut state.0.lock().unwrap());
            }
        });
}
