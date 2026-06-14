use std::fs;
use std::io::Write;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};

// NOTE: Building whisper-rs requires CMake to be installed.
// Install from https://cmake.org/download/ or via `winget install cmake`.

const MODELS: &[(&str, &str, u64)] = &[
    (
        "tiny",
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin",
        39_000_000,
    ),
    (
        "small",
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin",
        244_000_000,
    ),
    (
        "medium",
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin",
        769_000_000,
    ),
    (
        "large",
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin",
        1_500_000_000,
    ),
];

fn models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("whisper-models");
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(dir)
}

fn validate_model(model: &str) -> Result<(), String> {
    if MODELS.iter().any(|(name, _, _)| *name == model) {
        Ok(())
    } else {
        Err(format!("Unknown model: {}", model))
    }
}

#[derive(serde::Serialize, Clone)]
pub struct ModelStatus {
    pub name: String,
    pub downloaded: bool,
    pub size_bytes: u64,
}

#[tauri::command]
pub async fn get_whisper_models_status(app: AppHandle) -> Result<Vec<ModelStatus>, String> {
    let dir = models_dir(&app)?;
    let statuses = MODELS
        .iter()
        .map(|(name, _, size)| ModelStatus {
            name: name.to_string(),
            downloaded: dir.join(format!("{}.bin", name)).exists(),
            size_bytes: *size,
        })
        .collect();
    Ok(statuses)
}

#[derive(serde::Serialize, Clone)]
struct DownloadProgress {
    model: String,
    progress: u8,
    downloaded: u64,
    total: u64,
}

#[tauri::command]
pub async fn download_whisper_model(model: String, app: AppHandle) -> Result<(), String> {
    validate_model(&model)?;
    let (_, url, _) = MODELS
        .iter()
        .find(|(n, _, _)| *n == model)
        .ok_or_else(|| format!("Unknown model: {model}"))?;
    let path = models_dir(&app)?.join(format!("{}.bin", model));

    let _ = app.emit(
        "whisper-download-progress",
        DownloadProgress {
            model: model.clone(),
            progress: 0,
            downloaded: 0,
            total: 0,
        },
    );

    let client = reqwest::Client::new();
    let response = client
        .get(*url)
        .send()
        .await
        .map_err(|e| format!("Download error: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }

    let total = response.content_length().unwrap_or(0);
    let tmp_path = path.with_extension("bin.tmp");
    let mut file = fs::File::create(&tmp_path).map_err(|e| e.to_string())?;
    let mut downloaded = 0u64;

    use futures_util::StreamExt;
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Stream error: {}", e))?;
        if let Err(e) = file.write_all(&chunk) {
            let _ = fs::remove_file(&tmp_path);
            return Err(e.to_string());
        }
        downloaded += chunk.len() as u64;
        let progress = downloaded.checked_div(total).map_or(0, |p| (p * 100) as u8);
        let _ = app.emit(
            "whisper-download-progress",
            DownloadProgress {
                model: model.clone(),
                progress,
                downloaded,
                total,
            },
        );
    }

    fs::rename(&tmp_path, &path).map_err(|e| {
        let _ = fs::remove_file(&tmp_path);
        e.to_string()
    })?;

    Ok(())
}

#[tauri::command]
pub async fn delete_whisper_model(model: String, app: AppHandle) -> Result<(), String> {
    validate_model(&model)?;
    let path = models_dir(&app)?.join(format!("{}.bin", model));
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn transcribe_audio(
    audio_filename: String,
    model: String,
    app: AppHandle,
) -> Result<String, String> {
    validate_model(&model)?;
    let model_path = models_dir(&app)?.join(format!("{}.bin", model));
    if !model_path.exists() {
        return Err(format!("Model '{}' not downloaded", model));
    }

    if audio_filename.contains('/')
        || audio_filename.contains('\\')
        || audio_filename.contains("..")
    {
        return Err("Invalid audio filename".to_string());
    }

    let audio_path = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join(&audio_filename);

    let model_path_str = model_path.to_string_lossy().to_string();
    let audio_path_clone = audio_path.clone();

    let text = tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        // Read WAV file and decode samples
        let reader = hound::WavReader::open(&audio_path_clone)
            .map_err(|e| format!("WAV read error: {}", e))?;
        let spec = reader.spec();

        let samples: Vec<f32> = match spec.sample_format {
            hound::SampleFormat::Int => {
                let max = (1i64 << (spec.bits_per_sample - 1)) as f32;
                reader
                    .into_samples::<i32>()
                    .map(|s| s.unwrap() as f32 / max)
                    .collect()
            }
            hound::SampleFormat::Float => reader
                .into_samples::<f32>()
                .map(|s| s.unwrap())
                .collect(),
        };

        // Mix down to mono if stereo
        let mono: Vec<f32> = if spec.channels == 1 {
            samples
        } else {
            let ch = spec.channels as usize;
            samples
                .chunks(ch)
                .map(|c| c.iter().sum::<f32>() / ch as f32)
                .collect()
        };

        use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

        let ctx = WhisperContext::new_with_params(
            &model_path_str,
            WhisperContextParameters::default(),
        )
        .map_err(|e| format!("Failed to load model: {}", e))?;

        let mut state = ctx.create_state().map_err(|e| e.to_string())?;

        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        params.set_language(Some("auto"));
        params.set_print_realtime(false);
        params.set_print_progress(false);
        params.set_print_special(false);
        params.set_print_timestamps(false);

        state.full(params, &mono).map_err(|e| e.to_string())?;

        let n = state.full_n_segments().map_err(|e| e.to_string())?;
        let mut text = String::new();
        for i in 0..n {
            text.push_str(&state.full_get_segment_text(i).map_err(|e| e.to_string())?);
        }

        Ok(text.trim().to_string())
    })
    .await
    .map_err(|e| e.to_string())??;

    // Clean up temp audio file
    let _ = fs::remove_file(&audio_path);

    Ok(text)
}
