use std::io::{Read, Write};
use std::path::Path;
use tauri::Manager;
use rusqlite;
use walkdir::WalkDir;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

#[derive(serde::Serialize)]
pub struct BackupEntry {
    pub name: String,
    pub size: u64,
    pub created: String,
}

fn get_data_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))
}

fn ensure_backup_dir(data_dir: &Path) -> Result<std::path::PathBuf, String> {
    let backup_dir = data_dir.join("backups");
    if !backup_dir.exists() {
        std::fs::create_dir_all(&backup_dir).map_err(|e| format!("Failed to create backup dir: {}", e))?;
    }
    Ok(backup_dir)
}

fn add_file_to_zip<W: Write + std::io::Seek>(
    zip: &mut ZipWriter<W>,
    file_path: &Path,
    archive_name: &str,
    options: SimpleFileOptions,
) -> Result<(), String> {
    if !file_path.exists() {
        return Ok(());
    }
    let mut f = std::fs::File::open(file_path).map_err(|e| format!("Failed to open {}: {}", archive_name, e))?;
    let mut buffer = Vec::new();
    f.read_to_end(&mut buffer).map_err(|e| format!("Failed to read {}: {}", archive_name, e))?;
    zip.start_file(archive_name, options).map_err(|e| format!("Failed to add {}: {}", archive_name, e))?;
    zip.write_all(&buffer).map_err(|e| format!("Failed to write {}: {}", archive_name, e))?;
    Ok(())
}

#[tauri::command]
pub async fn create_backup(app: tauri::AppHandle) -> Result<String, String> {
    let data_dir = get_data_dir(&app)?;
    let backup_dir = ensure_backup_dir(&data_dir)?;

    let now = chrono::Local::now();
    let ts = now.format("%Y-%m-%d_%H-%M-%S").to_string();
    let file_name = format!("dragonfly_{}.zip", ts);
    let zip_path = backup_dir.join(&file_name);
    let tmp_path = backup_dir.join(format!("{}.tmp", file_name));

    // Create a consistent DB snapshot via VACUUM INTO (single atomic read, no WAL/SHM needed)
    let vacuum_path = backup_dir.join(format!("dragonfly_vacuum_{}.db", ts));
    {
        let db_src = data_dir.join("dragonfly.db");
        let vp = vacuum_path.clone();
        tokio::task::spawn_blocking(move || -> Result<(), String> {
            let conn = rusqlite::Connection::open(&db_src)
                .map_err(|e| format!("Failed to open DB for backup: {}", e))?;
            let path_str = vp.to_string_lossy().replace('\'', "''");
            conn.execute_batch(&format!("VACUUM INTO '{}'", path_str))
                .map_err(|e| format!("VACUUM INTO failed: {}", e))?;
            Ok(())
        })
        .await
        .map_err(|e| format!("Backup task error: {}", e))??;
    }

    // Write to .tmp first; rename to final path only on success
    let result = (|| -> Result<(), String> {
        let file = std::fs::File::create(&tmp_path)
            .map_err(|e| format!("Failed to create zip: {}", e))?;
        let mut zip = ZipWriter::new(file);
        let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

        // Add consistent DB snapshot (WAL/SHM excluded — not needed with VACUUM INTO)
        add_file_to_zip(&mut zip, &vacuum_path, "dragonfly.db", options)?;

        // Add attachments directory
        let attachments_dir = data_dir.join("attachments");
        if attachments_dir.exists() {
            for entry in WalkDir::new(&attachments_dir).into_iter().filter_map(|e| e.ok()) {
                let path = entry.path();
                let relative = path.strip_prefix(&data_dir).map_err(|e| e.to_string())?;
                let archive_name = relative.to_string_lossy().replace('\\', "/");

                if path.is_dir() {
                    zip.add_directory(&archive_name, options)
                        .map_err(|e| format!("Failed to add dir: {}", e))?;
                } else {
                    add_file_to_zip(&mut zip, path, &archive_name, options)?;
                }
            }
        }

        zip.finish().map_err(|e| format!("Failed to finish zip: {}", e))?;
        Ok(())
    })();

    // Always remove the vacuum snapshot — it's already inside the zip
    let _ = tokio::fs::remove_file(&vacuum_path).await;

    match result {
        Ok(()) => {
            tokio::fs::rename(&tmp_path, &zip_path)
                .await
                .map_err(|e| format!("Failed to finalize backup: {}", e))?;
            Ok(file_name)
        }
        Err(e) => {
            let _ = tokio::fs::remove_file(&tmp_path).await;
            Err(e)
        }
    }
}

#[tauri::command]
pub async fn list_backups(app: tauri::AppHandle) -> Result<Vec<BackupEntry>, String> {
    let data_dir = get_data_dir(&app)?;
    let backup_dir = ensure_backup_dir(&data_dir)?;

    let mut backups = Vec::new();
    let entries = std::fs::read_dir(&backup_dir).map_err(|e| format!("Failed to read backup dir: {}", e))?;

    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with("dragonfly_") && name.ends_with(".zip") {
            let meta = entry.metadata().map_err(|e| e.to_string())?;
            let created = meta
                .created()
                .or_else(|_| meta.modified())
                .map(|t| {
                    let dt: chrono::DateTime<chrono::Local> = t.into();
                    dt.format("%Y-%m-%dT%H:%M:%S").to_string()
                })
                .unwrap_or_default();

            backups.push(BackupEntry {
                name,
                size: meta.len(),
                created,
            });
        }
    }

    // Sort newest first
    backups.sort_by(|a, b| b.created.cmp(&a.created));
    Ok(backups)
}

#[tauri::command]
pub async fn delete_backup(app: tauri::AppHandle, name: String) -> Result<(), String> {
    let data_dir = get_data_dir(&app)?;
    let backup_dir = ensure_backup_dir(&data_dir)?;

    // Validate before join to prevent path traversal
    if !name.ends_with(".zip")
        || !name.starts_with("dragonfly_")
        || name.contains('/')
        || name.contains('\\')
        || name.contains("..")
    {
        return Err("Invalid backup file".to_string());
    }

    let file_path = backup_dir.join(&name);

    // Canonicalization check to prevent path traversal escape
    let canonical_backup_dir = backup_dir.canonicalize().map_err(|e| e.to_string())?;
    let canonical_file = file_path.canonicalize().map_err(|e| e.to_string())?;
    if !canonical_file.starts_with(&canonical_backup_dir) {
        return Err("Invalid backup path".to_string());
    }

    if !file_path.exists() {
        return Err("Backup not found".to_string());
    }

    tokio::fs::remove_file(&file_path)
        .await
        .map_err(|e| format!("Failed to delete backup: {}", e))?;
    Ok(())
}
