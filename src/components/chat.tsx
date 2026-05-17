"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Bot, Download, Loader2, QrCode, Volume2 } from "lucide-react";
import { Composer } from "./composer";
import type { Message } from "@/lib/types";
import { extractUrl, deriveSpec } from "@/lib/conversation";
import { playTTS, stopTTS } from "@/lib/speech";

export function Chat({ onExit }: { onExit?: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const lastHandledRef = useRef<string | null>(null);
  const lastSpokenRef = useRef<string | null>(null);

  const handlers = useMemo(
    () => ({
      pushAssistant(partial: Partial<Message>) {
        const m: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          text: "",
          ...partial,
        };
        setMessages((cur) => [...cur, m]);
        return m.id;
      },
      patch(id: string, patch: Partial<Message>) {
        setMessages((cur) =>
          cur.map((m) => (m.id === id ? { ...m, ...patch } : m)),
        );
      },
    }),
    [],
  );

  // Auto-flow: when user sends, ask for link or generate.
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last || last.role !== "user") return;
    if (lastHandledRef.current === last.id) return;
    lastHandledRef.current = last.id;

    const spec = deriveSpec(messages);
    const reference = [...messages]
      .reverse()
      .find((m) => m.role === "user" && m.attachmentDataUri)?.attachmentDataUri;

    if (!spec.redirectUrl) {
      handlers.pushAssistant({
        text: "Perfetto. Per generare il QR mi serve il link di redirect — qual è l'URL a cui deve puntare? (es: https://miosito.com)",
        needsLink: true,
      });
      return;
    }

    const pendingId = handlers.pushAssistant({
      text: `Genero il QR per ${spec.redirectUrl} in stile "${spec.styleHint}"…`,
      pending: true,
      spec: { redirectUrl: spec.redirectUrl, styleHint: spec.styleHint },
    });

    (async () => {
      setBusy(true);
      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            redirectUrl: spec.redirectUrl,
            styleHint: spec.styleHint,
            referenceImage: reference ?? null,
          }),
        });
        const text = await res.text();
        let data: {
          imageUrl?: string;
          model?: string;
          error?: string;
        } = {};
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error(
            res.ok
              ? "Risposta non JSON dal server"
              : `Server error ${res.status}`,
          );
        }
        if (!res.ok) throw new Error(data?.error || "Generation failed");
        if (!data.imageUrl) throw new Error("Nessuna immagine restituita");
        handlers.patch(pendingId, {
          text: `Ecco il tuo QR per ${spec.redirectUrl}. Reso con ${data.model ?? "AI"}.`,
          imageUrl: data.imageUrl,
          pending: false,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Errore generazione";
        handlers.patch(pendingId, {
          text: `Non sono riuscito a generare la grafica AI. ${msg}. Tocca riprova o semplifica la descrizione.`,
          pending: false,
        });
      } finally {
        setBusy(false);
      }
    })();
  }, [messages, handlers]);

  // Voice mode: auto-speak each NEW assistant message once it's no longer pending.
  useEffect(() => {
    if (!voiceMode) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant" || last.pending) return;
    if (lastSpokenRef.current === last.id) return;
    lastSpokenRef.current = last.id;
    playTTS(last.text).catch(() => {});
  }, [messages, voiceMode]);

  // Stop audio when voice mode is turned off.
  useEffect(() => {
    if (!voiceMode) stopTTS();
  }, [voiceMode]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function send({
    text,
    attachmentDataUri,
  }: {
    text: string;
    attachmentDataUri?: string;
  }) {
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      text,
      attachmentDataUri,
    };
    const last = messages[messages.length - 1];
    if (last?.role === "assistant" && last.needsLink) {
      const u = extractUrl(text);
      if (!u) {
        setMessages((cur) => [
          ...cur,
          userMsg,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            text: "Non riesco a leggere un URL valido. Mandami il link completo, ad esempio https://miosito.com/promo",
            needsLink: true,
          },
        ]);
        lastHandledRef.current = userMsg.id;
        return;
      }
    }
    setMessages((cur) => [...cur, userMsg]);
  }

  const empty = messages.length === 0;

  return (
    <div className="h-full flex flex-col bg-background">
      {onExit && (
        <div className="h-12 border-b border-border flex items-center px-4 shrink-0">
          <button
            onClick={() => {
              stopTTS();
              onExit();
            }}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={16} />
            Cambia modalità
          </button>
        </div>
      )}
      <div ref={scrollerRef} className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-2xl mx-auto px-6 py-10 flex flex-col gap-6">
          {empty && (
            <div className="text-center pt-16 pb-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-pill text-xs text-muted-foreground mb-4">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                QRForge · gpt-image-2 + ElevenLabs voice
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Genera il tuo QR
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Descrivi quello che vuoi. Allega un&apos;immagine se ti serve.
                Attiva il <strong>Voice mode</strong> per parlare.
              </p>
            </div>
          )}
          {messages.map((m) => (
            <Bubble key={m.id} msg={m} />
          ))}
        </div>
      </div>
      <div className="border-t border-border bg-background">
        <div className="max-w-2xl mx-auto px-6 py-4">
          <Composer
            onSubmit={send}
            placeholder="Scrivi o parla… (link, stile, brand)"
            disabled={busy}
            autoFocus={empty}
            voiceMode={voiceMode}
            onToggleVoiceMode={() => setVoiceMode((v) => !v)}
          />
          <p className="mt-2 text-[11px] text-muted-foreground text-center">
            QRForge può sbagliare. Verifica sempre il link prima di stampare.
          </p>
        </div>
      </div>
    </div>
  );
}

function Bubble({ msg }: { msg: Message }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] flex flex-col items-end gap-2">
          {msg.attachmentDataUri && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={msg.attachmentDataUri}
              alt="attachment"
              className="rounded-xl max-w-[240px] border border-border"
            />
          )}
          {msg.text && (
            <div className="rounded-2xl rounded-tr-sm bg-foreground text-background px-4 py-2.5 text-[15px] leading-6">
              {msg.text}
            </div>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-full bg-pill flex items-center justify-center shrink-0">
        <Bot size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[15px] leading-6 text-foreground flex items-start gap-2">
          {msg.pending && (
            <Loader2 size={14} className="animate-spin mt-1.5 shrink-0" />
          )}
          <span>{msg.text}</span>
          {!msg.pending && msg.text && (
            <button
              onClick={() => playTTS(msg.text).catch(() => {})}
              className="ml-1 mt-1 text-muted-foreground hover:text-foreground"
              title="Riproduci voce"
              aria-label="Play"
            >
              <Volume2 size={14} />
            </button>
          )}
        </div>
        {msg.pending && !msg.imageUrl && (
          <div className="mt-3 w-64 h-64 rounded-xl shimmer" />
        )}
        {msg.imageUrl && (
          <div className="mt-3 inline-block">
            <div className="rounded-xl border border-border bg-white p-3 shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={msg.imageUrl}
                alt="Generated QR"
                className="w-72 h-72 object-contain rounded-lg"
              />
              <div className="mt-2 flex items-center gap-2">
                <a
                  href={msg.imageUrl}
                  target="_blank"
                  rel="noreferrer"
                  download={`qrforge-${Date.now()}.svg`}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-pill hover:bg-foreground/10 text-xs"
                >
                  <Download size={12} />
                  Scarica
                </a>
                {msg.spec?.redirectUrl && (
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground truncate max-w-[200px]">
                    <QrCode size={11} />
                    {msg.spec.redirectUrl}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
