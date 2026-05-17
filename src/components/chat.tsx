"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Download, Loader2, QrCode, Sparkles, Bot } from "lucide-react";
import { Composer } from "./composer";
import type { Message } from "@/lib/types";
import { extractUrl, deriveSpec } from "@/lib/conversation";
import { speak } from "@/lib/speech";

interface Props {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
}

export function Chat({ messages, setMessages }: Props) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const lastHandledRef = useRef<string | null>(null);

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
        setMessages((cur) => cur.map((m) => (m.id === id ? { ...m, ...patch } : m)));
      },
    }),
    [setMessages],
  );

  // React to a NEW user message: ask for link if missing, otherwise generate.
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last || last.role !== "user") return;
    if (lastHandledRef.current === last.id) return;
    lastHandledRef.current = last.id;

    const spec = deriveSpec(messages);
    if (!spec.redirectUrl) {
      const txt =
        "Perfetto. Per generare il QR mi serve il link di redirect — qual è l'URL a cui deve puntare? (es: https://miosito.com)";
      handlers.pushAssistant({ text: txt, needsLink: true });
      speak(txt);
      return;
    }

    // We have a URL. Generate.
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
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Generation failed");
        handlers.patch(pendingId, {
          text: `Ecco il tuo QR per ${spec.redirectUrl}. Scansionato porta al tuo link. ${
            data.fallback ? "(reso con generatore QR locale)" : "(rendering AI gpt-image-2)"
          }`,
          imageUrl: data.imageUrl,
          pending: false,
        });
        speak("Pronto. Ecco il tuo QR code.");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Errore generazione";
        handlers.patch(pendingId, {
          text: `Ho avuto un problema: ${msg}. Riprova o cambia descrizione.`,
          pending: false,
        });
      } finally {
        setBusy(false);
      }
    })();
  }, [messages, handlers]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function send(text: string) {
    const userMsg: Message = { id: crypto.randomUUID(), role: "user", text };
    // If the previous assistant asked for a link AND text looks like a URL, attach the spec hint.
    const last = messages[messages.length - 1];
    if (last?.role === "assistant" && last.needsLink) {
      const u = extractUrl(text);
      if (!u) {
        // Re-ask
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

  return (
    <div className="h-full flex flex-col">
      <div ref={scrollerRef} className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-3xl mx-auto px-6 py-8 flex flex-col gap-6">
          {messages.map((m) => (
            <Bubble key={m.id} msg={m} />
          ))}
        </div>
      </div>
      <div className="border-t border-border bg-background">
        <div className="max-w-3xl mx-auto px-6 py-4">
          <Composer
            value={draft}
            onChange={setDraft}
            onSubmit={send}
            placeholder="Scrivi o parla… (link, stile, colori, brand)"
            disabled={busy}
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
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-foreground text-background px-4 py-2.5 text-[15px] leading-6">
          {msg.text}
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
          {msg.pending && <Loader2 size={14} className="animate-spin mt-1.5 shrink-0" />}
          <span>{msg.text}</span>
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
                  download
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
                <span className="ml-auto text-[10px] text-muted-foreground flex items-center gap-1">
                  <Sparkles size={10} />
                  AI
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Reference imports kept for tree-shake friendliness
void Image;
