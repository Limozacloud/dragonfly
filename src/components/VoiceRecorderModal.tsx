import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { IconMicrophone, IconPlayerStop } from '@tabler/icons-react';
import { AppModal } from './ui/app-modal';
import { Button } from './ui/button';
import {
  getVoiceProvider,
  getWhisperModel,
  transcribeWithOpenAI,
  transcribeWithLocal,
} from '../services/voiceService';
import { log } from '../services/logService';

// Minimal interface for the Web Speech API SpeechRecognition object
// (not yet in TypeScript's default lib.dom.d.ts)
interface SpeechRecognitionResult {
  isFinal: boolean;
  [index: number]: { transcript: string };
}
interface SpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResult[] & { length: number };
}
interface SpeechRecognitionErrorEvent {
  error: string;
}
interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

interface VoiceRecorderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTranscription: (text: string) => void;
}

const SAMPLE_RATE = 16000;

export function VoiceRecorderModal({ isOpen, onClose, onTranscription }: VoiceRecorderModalProps) {
  const { t } = useTranslation();
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);

  // Live (Web Speech API) state
  const [liveText, setLiveText] = useState('');
  const [interimText, setInterimText] = useState('');

  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const samplesRef = useRef<Float32Array[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const liveTextRef = useRef('');

  const stopStream = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    gainRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    processorRef.current = null;
    sourceRef.current = null;
    gainRef.current = null;
    streamRef.current = null;
  }, []);

  const stopLiveRecognition = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    try { recognitionRef.current?.stop(); } catch { /* stop() throws when not running */ }
    recognitionRef.current = null;
  }, []);

  useEffect(() => {
    if (!isOpen) {
      stopStream();
      stopLiveRecognition();
      samplesRef.current = [];
      liveTextRef.current = '';
      setIsRecording(false);
      setIsTranscribing(false);
      setError(null);
      setSeconds(0);
      setLiveText('');
      setInterimText('');
    }
  }, [isOpen, stopStream, stopLiveRecognition]);

  // ── Whisper / OpenAI path ────────────────────────────────────────────────

  const startRecording = async () => {
    try {
      setError(null);
      samplesRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE });
      audioCtxRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      sourceRef.current = source;

      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      processor.onaudioprocess = (e) => {
        const data = e.inputBuffer.getChannelData(0);
        samplesRef.current.push(new Float32Array(data));
      };

      const gain = audioCtx.createGain();
      gain.gain.value = 0;
      gainRef.current = gain;

      source.connect(processor);
      processor.connect(gain);
      gain.connect(audioCtx.destination);

      setIsRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (err) {
      setError(t('voice.micDenied'));
      log('ERR', 'VoiceRecorder.startRecording: ' + String(err));
    }
  };

  const stopAndTranscribe = async () => {
    if (timerRef.current) clearInterval(timerRef.current);

    const totalLen = samplesRef.current.reduce((sum, arr) => sum + arr.length, 0);
    const merged = new Float32Array(totalLen);
    let offset = 0;
    for (const chunk of samplesRef.current) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    stopStream();
    setIsRecording(false);
    setIsTranscribing(true);

    try {
      const provider = await getVoiceProvider();
      let text = '';

      if (provider === 'openai') {
        text = await transcribeWithOpenAI(merged, SAMPLE_RATE);
      } else {
        const model = await getWhisperModel();
        text = await transcribeWithLocal(merged, SAMPLE_RATE, model);
      }

      if (text) onTranscription(text);
      onClose();
    } catch (err) {
      setError(String(err));
      log('ERR', 'VoiceRecorder.transcribe: ' + String(err));
    } finally {
      setIsTranscribing(false);
    }
  };

  // ── Web Speech API (live) path ───────────────────────────────────────────

  const startLiveRecording = () => {
    try {
      setError(null);
      liveTextRef.current = '';
      setLiveText('');
      setInterimText('');

      const SpeechRecognitionAPI = (
        (window as Window & { SpeechRecognition?: new () => SpeechRecognitionInstance; webkitSpeechRecognition?: new () => SpeechRecognitionInstance })
          .SpeechRecognition ||
        (window as Window & { SpeechRecognition?: new () => SpeechRecognitionInstance; webkitSpeechRecognition?: new () => SpeechRecognitionInstance })
          .webkitSpeechRecognition
      );

      const recognition: SpeechRecognitionInstance = new SpeechRecognitionAPI!();
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            liveTextRef.current += transcript;
            setLiveText(liveTextRef.current);
          } else {
            interim += transcript;
          }
        }
        setInterimText(interim);
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error === 'no-speech') return;
        setError(t('voice.recognitionError', { error: event.error }));
        log('ERR', 'VoiceRecorder.live: ' + event.error);
      };

      recognition.onend = () => {
        // Auto-restart if still in recording state (recognition stops on silence)
        if (recognitionRef.current) {
          try { recognition.start(); } catch { /* start() throws if already started */ }
        }
      };

      recognition.start();
      recognitionRef.current = recognition;

      setIsRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (err) {
      setError(t('voice.notAvailable'));
      log('ERR', 'VoiceRecorder.startLive: ' + String(err));
    }
  };

  const stopLiveAndInsert = () => {
    stopLiveRecognition();
    setIsRecording(false);
    const text = (liveTextRef.current + interimText).trim();
    if (text) onTranscription(text);
    onClose();
  };

  // ── Unified start ────────────────────────────────────────────────────────

  const handleStart = async () => {
    const provider = await getVoiceProvider();
    if (provider === 'live') {
      startLiveRecording();
    } else {
      startRecording();
    }
  };

  const handleStop = async () => {
    const provider = await getVoiceProvider();
    if (provider === 'live') {
      stopLiveAndInsert();
    } else {
      stopAndTranscribe();
    }
  };

  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  const isLiveMode = !!(
    isRecording &&
    recognitionRef.current
  );

  return (
    <AppModal isOpen={isOpen} onClose={onClose} title={t('voice.title')} size="sm">
      <div className="flex flex-col items-center gap-4 py-4 min-h-[200px] justify-center">
        {error && (
          <p className="text-sm text-destructive text-center px-4">{error}</p>
        )}

        {!isRecording && !isTranscribing && !error && (
          <>
            <Button
              size="lg"
              className="rounded-full w-20 h-20"
              onClick={handleStart}
            >
              <IconMicrophone size={36} />
            </Button>
            <p className="text-xs text-muted-foreground">
              {t('voice.startHint')}
            </p>
          </>
        )}

        {isRecording && (
          <>
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-40" />
              <Button
                size="lg"
                variant="destructive"
                className="rounded-full w-20 h-20 relative"
                onClick={handleStop}
              >
                <IconPlayerStop size={32} />
              </Button>
            </div>

            <p className="text-2xl font-mono tabular-nums text-red-600">
              {formatTime(seconds)}
            </p>

            {isLiveMode && (
              <div className="w-full max-h-36 overflow-y-auto rounded-md border border-border bg-white p-3 text-sm leading-relaxed">
                <span>{liveText}</span>
                {interimText && (
                  <span className="text-muted-foreground italic">{interimText}</span>
                )}
                {!liveText && !interimText && (
                  <span className="text-muted-foreground">{t('voice.listening')}</span>
                )}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              {isLiveMode ? t('voice.recordingLive') : t('voice.recording')}
            </p>
          </>
        )}

        {isTranscribing && (
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">{t('voice.transcribing')}</p>
          </div>
        )}

        {error && (
          <Button variant="outline" size="sm" onClick={() => setError(null)}>
            {t('voice.retry')}
          </Button>
        )}
      </div>
    </AppModal>
  );
}
