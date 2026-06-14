import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { writeFile, BaseDirectory } from '@tauri-apps/plugin-fs';
import { getConfig } from './database';
import { getApiKey } from './aiService';

export type VoiceProvider = 'local' | 'openai' | 'live';

export function isWebSpeechAvailable(): boolean {
  return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
}
export type WhisperModel = 'tiny' | 'small' | 'medium' | 'large';

export interface ModelStatus {
  name: string;
  downloaded: boolean;
  size_bytes: number;
}

export async function getVoiceProvider(): Promise<VoiceProvider | null> {
  const v = await getConfig('voice_provider');
  if (v === 'local' || v === 'openai' || v === 'live') return v;
  return null;
}

export async function getWhisperModel(): Promise<WhisperModel> {
  const m = await getConfig('whisper_model');
  if (m === 'tiny' || m === 'small' || m === 'medium' || m === 'large') return m;
  return 'small';
}

export async function getModelsStatus(): Promise<ModelStatus[]> {
  return invoke<ModelStatus[]>('get_whisper_models_status');
}

export async function downloadModel(
  model: WhisperModel,
  onProgress: (progress: number, downloaded: number, total: number) => void
): Promise<void> {
  const unlisten = await listen<{
    model: string;
    progress: number;
    downloaded: number;
    total: number;
  }>('whisper-download-progress', (event) => {
    if (event.payload.model === model) {
      onProgress(event.payload.progress, event.payload.downloaded, event.payload.total);
    }
  });

  try {
    await invoke('download_whisper_model', { model });
  } finally {
    unlisten();
  }
}

export async function deleteModel(model: WhisperModel): Promise<void> {
  await invoke('delete_whisper_model', { model });
}

// Encode Float32Array PCM samples (16kHz, mono) to WAV ArrayBuffer (16-bit PCM)
function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const numSamples = samples.length;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);       // Subchunk size
  view.setUint16(20, 1, true);        // PCM format
  view.setUint16(22, 1, true);        // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // Byte rate
  view.setUint16(32, 2, true);        // Block align
  view.setUint16(34, 16, true);       // Bits per sample
  writeStr(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return buffer;
}

export async function transcribeWithOpenAI(
  samples: Float32Array,
  sampleRate: number
): Promise<string> {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error('Kein OpenAI API-Key gesetzt');

  const wavBuffer = encodeWav(samples, sampleRate);
  const blob = new Blob([wavBuffer], { type: 'audio/wav' });

  const formData = new FormData();
  formData.append('file', blob, 'recording.wav');
  formData.append('model', 'whisper-1');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI Whisper: ${err}`);
  }

  const json = await res.json();
  return (json.text as string) ?? '';
}

export async function transcribeWithLocal(
  samples: Float32Array,
  sampleRate: number,
  model: WhisperModel
): Promise<string> {
  const wavBuffer = encodeWav(samples, sampleRate);
  const filename = `voice-tmp-${Date.now()}.wav`;

  await writeFile(filename, new Uint8Array(wavBuffer), {
    baseDir: BaseDirectory.AppData,
  });

  return invoke<string>('transcribe_audio', { audioFilename: filename, model });
}
