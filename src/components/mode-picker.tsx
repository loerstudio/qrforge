"use client";

import { MessageSquare, Mic, ArrowRight } from "lucide-react";
import type { Mode } from "./mode-router";

export function ModePicker({ onPick }: { onPick: (m: Mode) => void }) {
  return (
    <div className="h-full flex flex-col items-center justify-center bg-background px-6">
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-pill text-xs text-muted-foreground mb-5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          QRForge · gpt-image-2 + ElevenLabs voice
        </div>
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
          Come vuoi creare il tuo QR?
        </h1>
        <p className="mt-2 text-muted-foreground">
          Scegli la modalità — puoi sempre cambiare dopo.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-2xl">
        <button
          onClick={() => onPick("text")}
          className="group text-left p-6 rounded-2xl border border-border bg-white hover:border-foreground hover:shadow-md transition-all"
        >
          <div className="w-12 h-12 rounded-xl bg-pill flex items-center justify-center mb-4 group-hover:bg-foreground group-hover:text-background transition-colors">
            <MessageSquare size={22} />
          </div>
          <h2 className="text-lg font-semibold">Scrivi</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Chat classica. Scrivi il prompt, allega un logo, premi invio.
          </p>
          <div className="mt-4 flex items-center gap-1 text-sm text-foreground/80 group-hover:text-foreground">
            Inizia <ArrowRight size={14} />
          </div>
        </button>

        <button
          onClick={() => onPick("voice")}
          className="group text-left p-6 rounded-2xl border border-border bg-white hover:border-blue-600 hover:shadow-md transition-all relative overflow-hidden"
        >
          <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-blue-50 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="relative">
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4 group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <Mic size={22} />
            </div>
            <h2 className="text-lg font-semibold">Parla</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Hands-free. Parli, QRForge risponde con voce ElevenLabs. Stile
              ChatGPT Advanced Voice.
            </p>
            <div className="mt-4 flex items-center gap-1 text-sm text-blue-700">
              Inizia <ArrowRight size={14} />
            </div>
          </div>
        </button>
      </div>

      <p className="mt-10 text-xs text-muted-foreground text-center max-w-md">
        Per la modalità vocale serve un browser desktop (Chrome / Edge / Safari)
        e l&apos;accesso al microfono.
      </p>
    </div>
  );
}
