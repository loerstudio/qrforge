"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Bot,
  Download,
  Loader2,
  Mic,
  MicOff,
  QrCode,
  Square,
  Volume2,
} from "lucide-react";
import { getRecognition, playTTS, stopTTS } from "@/lib/speech";
import { deriveSpec, extractUrl } from "@/lib/conversation";
import type { Message } from "@/lib/types";

type Status =
  | "idle" // waiting for user to tap mic
  | "permission" // probing mic permission
  | "listening" // capturing user speech
  | "thinking" // sending to model
  | "speaking" // playing back assistant audio
  | "denied" // permission denied or unsupported
  | "error";

const SILENCE_MS = 1500; // submit after this much silence post-final result

export function VoiceMode({ onExit }: { onExit: () => void }) {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [latestImage, setLatestImage] = useState<Message | null>(null);

  const recRef = useRef<SpeechRecognition | null>(null);
  const supportedRef = useRef<boolean>(false);
  const baseRef = useRef<string>("");
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Probe support once.
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
    silenceTimerRef.current = setTimeout(() => {
      submitTranscript();
    }, SILENCE_MS);
  }

  function stopListening() {
    clearSilenceTimer();
    if (recRef.current) {
      try {
        recRef.current.stop();
      } catch {}
    }
  }

  async function startListening() {
    console.log("[voice] startListening", { supported: supportedRef.current });
    if (!supportedRef.current) {
      setStatus("denied");
      return;
    }
    setErrorMsg(null);

    // Fresh recognition each session so it picks up new permission state cleanly.
    const r = getRecognition();
    if (!r) {
      setStatus("denied");
      setErrorMsg("Browser non supporta il riconoscimento vocale.");
      return;
    }
    recRef.current = r;

    baseRef.current = "";
    setTranscript("");

    let started = false;
    r.onstart = () => {
      started = true;
      console.log("[voice] recognition started");
      setStatus("listening");
    };
    // If Chrome doesn't fire onstart within 2.5s, the permission is almost
    // certainly silently denied or the mic device is missing.
    setTimeout(() => {
      if (!started) {
        console.warn("[voice] no onstart within 2.5s — likely blocked");
        try {
          r.abort();
        } catch {}
        setStatus("denied");
        setErrorMsg(
          "Chrome non ha risposto. Probabilmente il permesso microfono è bloccato per questo sito: clicca l'icona 🔒 accanto all'URL, vai su 'Microfono' → 'Consenti', poi ricarica la pagina.",
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
      console.log("[voice] result:", { final, interim, base: baseRef.current });
      setTranscript(next);
      if (final) {
        baseRef.current = (baseRef.current + " " + final).trim();
        scheduleSubmit();
      } else if (interim) {
        scheduleSubmit();
      }
    };
    r.onerror = (ev) => {
      console.error("[voice] error:", ev.error, ev);
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
        setStatus("denied");
        setErrorMsg(
          "Microfono bloccato. Clicca il lucchetto vicino all'URL → Microfono → Consenti, poi ricarica.",
        );
      } else if (ev.error === "no-speech") {
        // ignore — restart on end handler
      } else if (ev.error === "audio-capture") {
        setStatus("error");
        setErrorMsg(
          "Nessun microfono disponibile. Su macOS: System Settings → Sound → Input → seleziona un mic.",
        );
      } else {
        setStatus("error");
        setErrorMsg(`Errore voce: ${ev.error}`);
      }
    };
    r.onend = () => {
      console.log("[voice] recognition ended", {
        statusAtEnd: status,
        baseText: baseRef.current,
      });
      if (baseRef.current.trim()) {
        clearSilenceTimer();
        submitTranscript();
      }
    };

    setStatus("permission");
    try {
      r.start();
    } catch (e) {
      console.error("[voice] start threw:", e);
      setStatus("error");
      setErrorMsg("Impossibile avviare il microfono. Ricarica la pagina.");
    }
  }

  async function submitTranscript() {
    clearSilenceTimer();
    const text = (baseRef.current || transcript).trim();
    if (!text) {
      // Nothing said; revert to idle.
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

    // Decide response: ask for URL or generate.
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
        text: wasAskingForLink && !newUrl
          ? "Non ho riconosciuto un URL valido. Dimmi il link completo, ad esempio https://miosito.com"
          : "Per generare il QR mi serve il link di redirect. Qual è l'URL?",
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
      text: `Genero il QR per ${spec.redirectUrl}…`,
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
      let data: { imageUrl?: string; fallback?: boolean; error?: string } = {};
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
        text: `Ecco il tuo QR per ${spec.redirectUrl}. Lo vedi sullo schermo, puoi scaricarlo.`,
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
        text: `Ho avuto un problema: ${err}. Vuoi riprovare?`,
        pending: false,
      };
      setMessages((cur) => cur.map((m) => (m.id === pendingId ? errMsg : m)));
      await speakThenResume(errMsg.text);
    }
  }

  async function speakThenResume(text: string) {
    setStatus("speaking");
    try {
      await playTTS(text); // resolves when audio ENDS
    } catch (e) {
      console.error("[tts] failed:", e);
    }
    setTimeout(() => startListening(), 300);
  }

  function manualStop() {
    stopListening();
    stopTTS();
    setStatus("idle");
  }

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="h-14 border-b border-border flex items-center px-4 shrink-0">
        <button
          onClick={() => {
            stopListening();
            stopTTS();
            onExit();
          }}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={16} />
          Cambia modalità
        </button>
        <span className="mx-auto text-sm font-medium">Voice mode</span>
        <span className="w-[120px]" />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 overflow-y-auto scrollbar-thin">
        <StatusOrb status={status} onStart={startListening} onStop={manualStop} />
        <StatusCopy status={status} transcript={transcript} error={errorMsg} />

        {latestImage?.imageUrl && (
          <div className="mt-8 rounded-xl border border-border bg-white p-3 shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={latestImage.imageUrl}
              alt="Generated QR"
              className="w-72 h-72 object-contain rounded-lg"
            />
            <div className="mt-2 flex items-center gap-2">
              <a
                href={latestImage.imageUrl}
                target="_blank"
                rel="noreferrer"
                download={`qrforge-${Date.now()}.svg`}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-pill hover:bg-foreground/10 text-xs"
              >
                <Download size={12} />
                Scarica
              </a>
              {latestImage.spec?.redirectUrl && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground truncate max-w-[200px]">
                  <QrCode size={11} />
                  {latestImage.spec.redirectUrl}
                </span>
              )}
            </div>
          </div>
        )}

        {messages.length > 0 && (
          <details className="mt-8 w-full max-w-md">
            <summary className="text-xs text-muted-foreground cursor-pointer text-center">
              Mostra trascrizione conversazione
            </summary>
            <div className="mt-3 flex flex-col gap-2">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`text-sm px-3 py-2 rounded-lg ${
                    m.role === "user"
                      ? "bg-foreground text-background ml-auto max-w-[80%]"
                      : "bg-pill mr-auto max-w-[80%] flex items-start gap-2"
                  }`}
                >
                  {m.role === "assistant" && (
                    <Bot size={14} className="mt-0.5 shrink-0" />
                  )}
                  <span className="flex-1">
                    {m.pending && (
                      <Loader2 size={12} className="inline animate-spin mr-1" />
                    )}
                    {m.text}
                  </span>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

function StatusOrb({
  status,
  onStart,
  onStop,
}: {
  status: Status;
  onStart: () => void;
  onStop: () => void;
}) {
  const big = "w-32 h-32 sm:w-40 sm:h-40 rounded-full flex items-center justify-center transition-all";
  if (status === "denied" || status === "error") {
    return (
      <button
        onClick={onStart}
        className={`${big} bg-red-50 text-red-600 border-2 border-red-200`}
      >
        <MicOff size={36} />
      </button>
    );
  }
  if (status === "listening") {
    return (
      <button
        onClick={onStop}
        className={`${big} relative bg-blue-600 text-white voice-ring shadow-xl`}
      >
        <Square size={28} />
      </button>
    );
  }
  if (status === "thinking") {
    return (
      <div className={`${big} bg-pill text-foreground`}>
        <Loader2 size={32} className="animate-spin" />
      </div>
    );
  }
  if (status === "speaking") {
    return (
      <div className={`${big} bg-emerald-50 text-emerald-700 voice-ring relative`}>
        <Volume2 size={32} />
      </div>
    );
  }
  if (status === "permission") {
    return (
      <div className={`${big} bg-pill text-foreground`}>
        <Loader2 size={32} className="animate-spin" />
      </div>
    );
  }
  return (
    <button
      onClick={onStart}
      className={`${big} bg-foreground text-background hover:scale-105 shadow-xl`}
    >
      <Mic size={36} />
    </button>
  );
}

function StatusCopy({
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
      <div className="mt-6 text-center max-w-md">
        <p className="text-sm font-medium text-red-700">
          {error ?? "Qualcosa non va col microfono."}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Tap sull&apos;icona per riprovare.
        </p>
      </div>
    );
  }
  if (status === "idle") {
    return (
      <div className="mt-6 text-center">
        <p className="text-lg font-medium">Tocca il microfono per iniziare</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Dimmi che QR vuoi e a quale link deve puntare.
        </p>
      </div>
    );
  }
  if (status === "permission") {
    return (
      <p className="mt-6 text-sm text-muted-foreground">
        Permesso microfono…
      </p>
    );
  }
  if (status === "listening") {
    return (
      <div className="mt-6 text-center max-w-xl">
        <p className="text-sm text-muted-foreground">Ti ascolto…</p>
        {transcript && (
          <p className="mt-3 text-lg text-foreground leading-relaxed">
            {transcript}
          </p>
        )}
        <p className="mt-4 text-xs text-muted-foreground">
          Fai una breve pausa per inviare, oppure tocca per fermare.
        </p>
      </div>
    );
  }
  if (status === "thinking") {
    return (
      <p className="mt-6 text-sm text-muted-foreground">Sto pensando…</p>
    );
  }
  if (status === "speaking") {
    return (
      <p className="mt-6 text-sm text-emerald-700">QRForge sta parlando…</p>
    );
  }
  return null;
}
