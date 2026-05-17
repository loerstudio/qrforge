"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Loader2, RotateCcw, X } from "lucide-react";
import { getRecognition, playTTS, stopTTS } from "@/lib/speech";
import { deriveSpec, extractUrl } from "@/lib/conversation";
import type { Message } from "@/lib/types";

type Status =
  | "idle"
  | "permission"
  | "listening"
  | "thinking"
  | "speaking"
  | "denied"
  | "error";

const SILENCE_MS = 1500;

export function VoiceMode() {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [latestImage, setLatestImage] = useState<Message | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);

  const recRef = useRef<SpeechRecognition | null>(null);
  const supportedRef = useRef<boolean>(false);
  const baseRef = useRef<string>("");
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  useEffect(() => {
    const r = getRecognition();
    if (!r) {
      supportedRef.current = false;
      setStatus("denied");
      setErrorMsg(
        "Browser non supportato. Apri questo sito su Chrome o Safari desktop.",
      );
      return;
    }
    supportedRef.current = true;
    return () => {
      try {
        r.abort();
      } catch {}
    };
  }, []);

  function clearSilenceTimer() {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }

  function scheduleSubmit() {
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => submitTranscript(), SILENCE_MS);
  }

  function stopListening() {
    clearSilenceTimer();
    if (recRef.current) {
      try {
        recRef.current.stop();
      } catch {}
    }
  }

  function startListening() {
    if (!supportedRef.current) {
      setStatus("denied");
      return;
    }
    setErrorMsg(null);
    const r = getRecognition();
    if (!r) {
      setStatus("denied");
      return;
    }
    recRef.current = r;
    baseRef.current = "";
    setTranscript("");

    let started = false;
    r.onstart = () => {
      started = true;
      setStatus("listening");
    };
    setTimeout(() => {
      if (!started) {
        try {
          r.abort();
        } catch {}
        setStatus("denied");
        setErrorMsg(
          "Microfono bloccato. Clicca 🔒 vicino all'URL → Microfono → Consenti, poi ricarica.",
        );
      }
    }, 2500);

    r.onresult = (e) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t;
        else interim += t;
      }
      const next = (baseRef.current + " " + final + interim).trim();
      setTranscript(next);
      if (final) {
        baseRef.current = (baseRef.current + " " + final).trim();
        scheduleSubmit();
      } else if (interim) {
        scheduleSubmit();
      }
    };
    r.onerror = (ev) => {
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
        setStatus("denied");
        setErrorMsg("Microfono bloccato dal browser.");
      } else if (ev.error === "audio-capture") {
        setStatus("error");
        setErrorMsg("Nessun microfono disponibile.");
      } else if (ev.error !== "no-speech") {
        setStatus("error");
        setErrorMsg(`Errore: ${ev.error}`);
      }
    };
    r.onend = () => {
      if (baseRef.current.trim()) {
        clearSilenceTimer();
        submitTranscript();
      }
    };

    setStatus("permission");
    try {
      r.start();
    } catch {
      setStatus("error");
      setErrorMsg("Impossibile avviare il microfono.");
    }
  }

  async function submitTranscript() {
    clearSilenceTimer();
    const text = (baseRef.current || transcript).trim();
    if (!text) {
      stopListening();
      setStatus("idle");
      return;
    }
    stopListening();
    setStatus("thinking");
    setTranscript("");

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      text,
    };
    const nextMessages = [...messagesRef.current, userMsg];
    setMessages(nextMessages);

    const spec = deriveSpec(nextMessages);
    const lastAssistant = [...nextMessages]
      .reverse()
      .find((m) => m.role === "assistant");
    const wasAskingForLink = lastAssistant?.needsLink;
    const newUrl = wasAskingForLink ? extractUrl(text) : null;

    if (!spec.redirectUrl) {
      const reply: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        text:
          wasAskingForLink && !newUrl
            ? "Non ho capito. Ripeti solo il sito, ad esempio: salute di ferro punto com."
            : "Dimmi il sito a cui deve puntare il QR. Per esempio: salute di ferro punto com.",
        needsLink: true,
      };
      setMessages([...nextMessages, reply]);
      await speakThenResume(reply.text);
      return;
    }

    const pendingId = crypto.randomUUID();
    const host = new URL(spec.redirectUrl).hostname;
    const pending: Message = {
      id: pendingId,
      role: "assistant",
      text: `Genero il QR per ${host}.`,
      pending: true,
      spec: { redirectUrl: spec.redirectUrl, styleHint: spec.styleHint },
    };
    setMessages([...nextMessages, pending]);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          redirectUrl: spec.redirectUrl,
          styleHint: spec.styleHint,
        }),
      });
      const raw = await res.text();
      let data: {
        imageUrl?: string;
        model?: string;
        error?: string;
      } = {};
      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error(
          res.ok ? "Risposta non JSON" : `Server error ${res.status}`,
        );
      }
      if (!res.ok) throw new Error(data?.error || "Generation failed");
      if (!data.imageUrl) throw new Error("Nessuna immagine restituita");
      const finalMsg: Message = {
        ...pending,
        text: `Pronto. Il tuo QR per ${host} è sullo schermo.`,
        imageUrl: data.imageUrl,
        pending: false,
      };
      setMessages((cur) => cur.map((m) => (m.id === pendingId ? finalMsg : m)));
      setLatestImage(finalMsg);
      await speakThenResume(finalMsg.text);
    } catch (e) {
      const err = e instanceof Error ? e.message : "Errore generazione";
      const errMsg: Message = {
        ...pending,
        text: `Non ce l'ho fatta. ${err}. Riproviamo?`,
        pending: false,
      };
      setMessages((cur) => cur.map((m) => (m.id === pendingId ? errMsg : m)));
      await speakThenResume(errMsg.text);
    }
  }

  async function speakThenResume(text: string) {
    setStatus("speaking");
    try {
      await playTTS(text);
    } catch {}
    setTimeout(() => startListening(), 250);
  }

  function reset() {
    stopListening();
    stopTTS();
    setMessages([]);
    setLatestImage(null);
    setTranscript("");
    setErrorMsg(null);
    setStatus("idle");
  }

  const subtitle =
    status === "idle"
      ? "Tocca per iniziare"
      : status === "permission"
        ? "Attivazione microfono…"
        : status === "listening"
          ? "Ti ascolto"
          : status === "thinking"
            ? "Sto creando…"
            : status === "speaking"
              ? "Sto parlando"
              : status === "denied"
                ? "Microfono bloccato"
                : "Qualcosa è andato storto";

  return (
    <div className="h-full relative overflow-hidden bg-black text-white apple-bg">
      {/* Top bar — minimal Apple-style */}
      <div className="relative z-10 h-16 flex items-center px-6">
        <div className="text-[15px] font-medium tracking-tight">QRForge</div>
        <div className="ml-auto flex items-center gap-1">
          {messages.length > 0 && (
            <>
              <button
                onClick={() => setShowTranscript(true)}
                className="px-3 h-8 rounded-full text-xs text-white/60 hover:text-white hover:bg-white/5 transition-all"
              >
                Conversazione
              </button>
              <button
                onClick={reset}
                className="w-8 h-8 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/5 transition-all"
                aria-label="Ricomincia"
                title="Ricomincia"
              >
                <RotateCcw size={15} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Stage */}
      <div className="relative z-10 flex flex-col items-center justify-center px-6 h-[calc(100%-4rem)]">
        {/* Hero copy when nothing has been generated yet */}
        {!latestImage && status === "idle" && (
          <h1 className="text-[44px] sm:text-[56px] font-light tracking-[-0.02em] leading-none text-center mb-12">
            <span className="bg-gradient-to-b from-white to-white/60 bg-clip-text text-transparent">
              QR. Parla.
            </span>
          </h1>
        )}

        <Orb
          status={status}
          onStart={startListening}
          onStop={stopListening}
        />

        <Caption
          status={status}
          subtitle={subtitle}
          transcript={transcript}
          error={errorMsg}
        />

        {/* QR card */}
        {latestImage?.imageUrl && (
          <div className="mt-10 orb-floaty">
            <div className="rounded-[28px] bg-white/[0.06] backdrop-blur-2xl border border-white/10 p-4 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={latestImage.imageUrl}
                alt="QR"
                className="w-72 h-72 object-contain rounded-2xl"
              />
              <div className="mt-3 flex items-center justify-between gap-3">
                <a
                  href={latestImage.imageUrl}
                  target="_blank"
                  rel="noreferrer"
                  download={`qrforge-${Date.now()}.svg`}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white text-black text-[13px] font-medium hover:bg-white/90 transition-colors"
                >
                  <Download size={13} />
                  Scarica
                </a>
                <span className="text-[12px] text-white/40 truncate max-w-[160px] font-mono">
                  {latestImage.spec?.redirectUrl
                    ? new URL(latestImage.spec.redirectUrl).hostname
                    : ""}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Transcript sheet */}
      {showTranscript && (
        <div
          className="absolute inset-0 z-30 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center"
          onClick={() => setShowTranscript(false)}
        >
          <div
            className="w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl bg-[#101015] border border-white/10 max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
              <span className="text-sm font-medium">Conversazione</span>
              <button
                onClick={() => setShowTranscript(false)}
                className="w-7 h-7 rounded-full hover:bg-white/10 flex items-center justify-center"
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4 flex flex-col gap-2">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`text-[14px] leading-snug px-3.5 py-2.5 rounded-2xl max-w-[88%] ${
                    m.role === "user"
                      ? "bg-white text-black ml-auto rounded-tr-md"
                      : "bg-white/10 text-white mr-auto rounded-tl-md"
                  }`}
                >
                  {m.pending && (
                    <Loader2
                      size={12}
                      className="inline animate-spin mr-1.5 -mt-0.5"
                    />
                  )}
                  {m.text}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Orb({
  status,
  onStart,
  onStop,
}: {
  status: Status;
  onStart: () => void;
  onStop: () => void;
}) {
  const onClick =
    status === "listening"
      ? onStop
      : status === "idle" || status === "denied" || status === "error"
        ? onStart
        : undefined;

  // Color palette per state
  const palette =
    status === "listening"
      ? ["#60a5fa", "#a855f7", "#22d3ee", "#60a5fa"]
      : status === "thinking"
        ? ["#fbbf24", "#fb923c", "#f472b6", "#fbbf24"]
        : status === "speaking"
          ? ["#34d399", "#22d3ee", "#a78bfa", "#34d399"]
          : status === "denied" || status === "error"
            ? ["#ef4444", "#f87171", "#ef4444", "#ef4444"]
            : ["#a78bfa", "#60a5fa", "#22d3ee", "#a78bfa"]; // idle

  const conic = `conic-gradient(from 0deg, ${palette[0]}, ${palette[1]}, ${palette[2]}, ${palette[3]})`;
  const conic2 = `conic-gradient(from 180deg, ${palette[2]}, ${palette[0]}, ${palette[1]}, ${palette[2]})`;

  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className="relative w-[240px] h-[240px] sm:w-[280px] sm:h-[280px] rounded-full focus:outline-none group"
      aria-label="Voice"
    >
      {/* Outer halo */}
      <div
        className="absolute inset-[-40px] rounded-full blur-3xl opacity-50 orb-shell"
        style={{ background: conic }}
      />
      {/* Conic layer A */}
      <div
        className="absolute inset-0 rounded-full opacity-90 orb-conic-a"
        style={{ background: conic, filter: "blur(8px)" }}
      />
      {/* Conic layer B (reverse) */}
      <div
        className="absolute inset-3 rounded-full opacity-70 orb-conic-b mix-blend-screen"
        style={{ background: conic2, filter: "blur(10px)" }}
      />
      {/* Glass core */}
      <div className="absolute inset-6 rounded-full bg-black/40 backdrop-blur-sm border border-white/10" />
      {/* Center icon */}
      <div className="absolute inset-0 flex items-center justify-center text-white/90">
        {status === "thinking" || status === "permission" ? (
          <Loader2 size={28} strokeWidth={1.5} className="animate-spin" />
        ) : status === "listening" ? (
          <SquareDot />
        ) : status === "speaking" ? (
          <WaveBars />
        ) : (
          <MicDot />
        )}
      </div>
    </button>
  );
}

function MicDot() {
  return (
    <svg width="34" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11v1a7 7 0 0 0 14 0v-1" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}

function SquareDot() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22">
      <rect x="3" y="3" width="16" height="16" rx="3" fill="currentColor" />
    </svg>
  );
}

function WaveBars() {
  return (
    <svg width="44" height="28" viewBox="0 0 44 28" fill="currentColor">
      {[0, 1, 2, 3, 4].map((i) => (
        <rect
          key={i}
          x={i * 9 + 2}
          y={4}
          width="5"
          height="20"
          rx="2.5"
        >
          <animate
            attributeName="y"
            values="8;2;8"
            dur={`${0.6 + i * 0.12}s`}
            repeatCount="indefinite"
          />
          <animate
            attributeName="height"
            values="12;24;12"
            dur={`${0.6 + i * 0.12}s`}
            repeatCount="indefinite"
          />
        </rect>
      ))}
    </svg>
  );
}

function Caption({
  status,
  subtitle,
  transcript,
  error,
}: {
  status: Status;
  subtitle: string;
  transcript: string;
  error: string | null;
}) {
  if (status === "denied" || status === "error") {
    return (
      <div className="mt-10 text-center max-w-md">
        <p className="text-[15px] text-red-300/90">{error ?? subtitle}</p>
        <p className="mt-2 text-xs text-white/30">Tocca l&apos;orb per riprovare.</p>
      </div>
    );
  }
  return (
    <div className="mt-10 text-center max-w-2xl px-4 min-h-[3.5rem]">
      <p className="text-[11px] uppercase tracking-[0.18em] text-white/40 mb-2.5">
        {subtitle}
      </p>
      {status === "listening" && transcript && (
        <p className="text-[20px] sm:text-[22px] font-light leading-snug text-white">
          {transcript}
        </p>
      )}
      {status === "listening" && !transcript && (
        <p className="text-white/30 text-[15px]">Parla pure…</p>
      )}
      {status === "idle" && (
        <p className="text-white/40 text-[14px]">
          Dimmi link e stile. Penso al resto.
        </p>
      )}
    </div>
  );
}
