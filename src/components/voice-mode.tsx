"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Download,
  Loader2,
  Mic,
  MicOff,
  Square,
  Volume2,
  X,
} from "lucide-react";
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

export function VoiceMode({ onExit }: { onExit: () => void }) {
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
        "Il tuo browser non supporta il riconoscimento vocale. Usa Chrome o Edge su desktop.",
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
          "Chrome non ha risposto. Probabilmente il permesso microfono è bloccato — clicca il lucchetto vicino all'URL → Microfono → Consenti, poi ricarica.",
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
        setErrorMsg("Permesso microfono bloccato dal browser.");
      } else if (ev.error === "audio-capture") {
        setStatus("error");
        setErrorMsg(
          "Nessun microfono disponibile. macOS → Impostazioni → Suono → Input.",
        );
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
            ? "Non ho capito il link. Dimmelo lettera per lettera, oppure scrivilo: ad esempio salute di ferro punto com."
            : "Per generare il QR dimmi il link di destinazione. Ad esempio salute di ferro punto com.",
        needsLink: true,
      };
      setMessages([...nextMessages, reply]);
      await speakThenResume(reply.text);
      return;
    }

    const pendingId = crypto.randomUUID();
    const pending: Message = {
      id: pendingId,
      role: "assistant",
      text: `Ho capito ${spec.redirectUrl}. Sto generando…`,
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
        text: `Ecco fatto. QR pronto per ${spec.redirectUrl}.`,
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
    setTimeout(() => startListening(), 300);
  }

  function manualStop() {
    stopListening();
    stopTTS();
    setStatus("idle");
  }

  return (
    <div className="h-full relative overflow-hidden bg-[#0a0a0f] text-white">
      {/* Background gradient + grain */}
      <div className="absolute inset-0 opacity-90 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(99,102,241,0.18),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,rgba(236,72,153,0.12),transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_75%,rgba(34,197,94,0.10),transparent_55%)]" />
      </div>

      {/* Top bar */}
      <div className="relative z-10 h-14 flex items-center px-5">
        <button
          onClick={() => {
            stopListening();
            stopTTS();
            onExit();
          }}
          className="flex items-center gap-1.5 text-sm text-white/70 hover:text-white transition-colors"
        >
          <ArrowLeft size={16} />
          Esci
        </button>
        <div className="mx-auto flex items-center gap-2 text-xs text-white/60">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              status === "listening"
                ? "bg-blue-400 animate-pulse"
                : status === "speaking"
                  ? "bg-emerald-400 animate-pulse"
                  : status === "thinking"
                    ? "bg-amber-400 animate-pulse"
                    : "bg-white/30"
            }`}
          />
          QRForge Voice
        </div>
        <button
          onClick={() => setShowTranscript((v) => !v)}
          className="text-xs text-white/60 hover:text-white transition-colors"
        >
          {messages.length > 0 ? `${messages.length} msg` : ""}
        </button>
      </div>

      {/* Center stage */}
      <div className="relative z-10 flex flex-col items-center justify-center px-6 h-[calc(100%-3.5rem)]">
        <Orb status={status} onStart={startListening} onStop={manualStop} />
        <Caption status={status} transcript={transcript} error={errorMsg} />

        {/* QR card floating */}
        {latestImage?.imageUrl && (
          <div className="mt-10 group">
            <div className="rounded-3xl bg-white/8 backdrop-blur-xl border border-white/15 p-4 shadow-2xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={latestImage.imageUrl}
                alt="Generated QR"
                className="w-72 h-72 object-contain rounded-2xl"
              />
              <div className="mt-3 flex items-center justify-between gap-2">
                <a
                  href={latestImage.imageUrl}
                  target="_blank"
                  rel="noreferrer"
                  download={`qrforge-${Date.now()}.svg`}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white text-black text-xs font-medium hover:bg-white/90 transition-colors"
                >
                  <Download size={12} />
                  Scarica
                </a>
                <span className="text-[11px] text-white/50 truncate max-w-[150px]">
                  {latestImage.spec?.redirectUrl}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Transcript drawer */}
      {showTranscript && messages.length > 0 && (
        <div className="absolute inset-x-0 bottom-0 z-20 max-h-[60vh] overflow-y-auto scrollbar-thin bg-[#0a0a0f]/95 backdrop-blur-xl border-t border-white/10 rounded-t-3xl">
          <div className="sticky top-0 flex items-center justify-between px-5 py-3 border-b border-white/10 bg-[#0a0a0f]/80 backdrop-blur-xl">
            <span className="text-xs font-medium text-white/70">
              Conversazione
            </span>
            <button
              onClick={() => setShowTranscript(false)}
              className="w-6 h-6 rounded-full hover:bg-white/10 flex items-center justify-center"
            >
              <X size={14} />
            </button>
          </div>
          <div className="px-5 py-4 flex flex-col gap-2 max-w-xl mx-auto">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`text-sm px-3.5 py-2.5 rounded-2xl max-w-[85%] ${
                  m.role === "user"
                    ? "bg-white text-black ml-auto rounded-tr-md"
                    : "bg-white/10 text-white mr-auto rounded-tl-md flex items-start gap-2"
                }`}
              >
                {m.pending && (
                  <Loader2 size={12} className="inline animate-spin mt-1 shrink-0" />
                )}
                <span className="flex-1">{m.text}</span>
              </div>
            ))}
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
  const isInteractive = status === "idle" || status === "listening";
  const onClick = status === "listening" ? onStop : onStart;

  return (
    <div className="relative">
      {/* Halo rings (animate when active) */}
      {(status === "listening" || status === "speaking") && (
        <>
          <div
            className={`absolute inset-0 rounded-full blur-2xl scale-150 opacity-60 ${
              status === "speaking" ? "bg-emerald-500" : "bg-blue-500"
            } animate-pulse`}
          />
          <div
            className={`absolute inset-0 rounded-full ${
              status === "speaking" ? "bg-emerald-500" : "bg-blue-500"
            } opacity-30 animate-ping`}
            style={{ animationDuration: "2s" }}
          />
        </>
      )}
      {status === "thinking" && (
        <div className="absolute inset-0 rounded-full bg-amber-500 blur-2xl scale-150 opacity-40 animate-pulse" />
      )}

      <button
        disabled={!isInteractive && status !== "denied" && status !== "error"}
        onClick={onClick}
        className={`relative w-44 h-44 sm:w-56 sm:h-56 rounded-full flex items-center justify-center transition-all duration-300 ${
          status === "idle"
            ? "bg-gradient-to-br from-white to-white/80 text-black hover:scale-105 shadow-[0_0_60px_-10px_rgba(255,255,255,0.5)]"
            : status === "listening"
              ? "bg-gradient-to-br from-blue-400 to-indigo-600 text-white shadow-[0_0_80px_-5px_rgba(59,130,246,0.7)]"
              : status === "thinking"
                ? "bg-gradient-to-br from-amber-400 to-orange-600 text-white"
                : status === "speaking"
                  ? "bg-gradient-to-br from-emerald-400 to-teal-600 text-white shadow-[0_0_80px_-5px_rgba(16,185,129,0.7)]"
                  : "bg-red-500/20 text-red-300 border border-red-500/40"
        }`}
      >
        {status === "idle" && <Mic size={56} strokeWidth={1.5} />}
        {status === "listening" && <Square size={40} strokeWidth={1.5} />}
        {status === "thinking" && (
          <Loader2 size={56} strokeWidth={1.5} className="animate-spin" />
        )}
        {status === "speaking" && <Volume2 size={56} strokeWidth={1.5} />}
        {(status === "denied" || status === "error") && (
          <MicOff size={56} strokeWidth={1.5} />
        )}
        {status === "permission" && (
          <Loader2 size={56} strokeWidth={1.5} className="animate-spin" />
        )}
      </button>
    </div>
  );
}

function Caption({
  status,
  transcript,
  error,
}: {
  status: Status;
  transcript: string;
  error: string | null;
}) {
  if (status === "denied" || status === "error") {
    return (
      <div className="mt-10 text-center max-w-md">
        <p className="text-sm font-medium text-red-300">
          {error ?? "Qualcosa non va col microfono."}
        </p>
        <p className="mt-2 text-xs text-white/40">Tocca l&apos;orb per riprovare.</p>
      </div>
    );
  }
  if (status === "idle") {
    return (
      <div className="mt-10 text-center">
        <p className="text-2xl sm:text-3xl font-light tracking-tight">
          Tocca per parlare
        </p>
        <p className="mt-2 text-sm text-white/50">
          Dimmi il link e lo stile, penso a tutto.
        </p>
      </div>
    );
  }
  if (status === "permission") {
    return <p className="mt-10 text-sm text-white/50">Sto attivando il microfono…</p>;
  }
  if (status === "listening") {
    return (
      <div className="mt-10 text-center max-w-2xl px-4">
        <p className="text-xs uppercase tracking-widest text-blue-300 mb-3">
          Ti ascolto
        </p>
        {transcript ? (
          <p className="text-xl sm:text-2xl font-light leading-snug text-white">
            {transcript}
          </p>
        ) : (
          <p className="text-white/30 text-base">Parla pure…</p>
        )}
      </div>
    );
  }
  if (status === "thinking") {
    return (
      <p className="mt-10 text-lg text-amber-200 font-light tracking-wide">
        Sto generando la grafica…
      </p>
    );
  }
  if (status === "speaking") {
    return (
      <p className="mt-10 text-lg text-emerald-200 font-light tracking-wide">
        Sto parlando…
      </p>
    );
  }
  return null;
}
