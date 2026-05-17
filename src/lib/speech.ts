"use client";

type AnyWin = typeof window & {
  webkitSpeechRecognition?: new () => SpeechRecognition;
  SpeechRecognition?: new () => SpeechRecognition;
};

export function getRecognition(): SpeechRecognition | null {
  if (typeof window === "undefined") return null;
  const w = window as AnyWin;
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = "it-IT";
  return rec;
}

declare global {
  interface SpeechRecognitionEvent extends Event {
    resultIndex: number;
    results: SpeechRecognitionResultList;
  }
  interface SpeechRecognitionErrorEvent extends Event {
    error: string;
    message: string;
  }
  interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
    onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null;
    onend: ((this: SpeechRecognition, ev: Event) => void) | null;
    onstart: ((this: SpeechRecognition, ev: Event) => void) | null;
    start(): void;
    stop(): void;
    abort(): void;
  }
}

let audioEl: HTMLAudioElement | null = null;

function getAudio(): HTMLAudioElement {
  if (typeof window === "undefined") throw new Error("no window");
  if (!audioEl) {
    audioEl = new Audio();
    audioEl.preload = "auto";
  }
  return audioEl;
}

/**
 * Fetches TTS audio from /api/tts and plays it.
 * Resolves when playback has fully ENDED (or errored out).
 */
export async function playTTS(text: string): Promise<void> {
  if (!text.trim()) return;
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`tts failed: ${res.status} ${body}`);
  }
  const data = (await res.json()) as { audioUrl?: string };
  if (!data.audioUrl) throw new Error("no audio url");

  const a = getAudio();
  a.src = data.audioUrl;

  return new Promise<void>((resolve) => {
    const cleanup = () => {
      a.removeEventListener("ended", onEnd);
      a.removeEventListener("error", onErr);
    };
    const onEnd = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      resolve();
    };
    a.addEventListener("ended", onEnd);
    a.addEventListener("error", onErr);
    a.play().catch(() => {
      cleanup();
      resolve();
    });
  });
}

export function stopTTS() {
  if (audioEl) {
    audioEl.pause();
    audioEl.currentTime = 0;
  }
}
