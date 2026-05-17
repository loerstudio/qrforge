"use client";

import { useState } from "react";
import { QrCode, Sparkles, Image as ImageIcon, Palette } from "lucide-react";
import { Composer } from "./composer";
import type { Message } from "@/lib/types";

const PILLS = [
  { icon: <QrCode size={14} />, label: "Crea un QR per il mio sito" },
  { icon: <Sparkles size={14} />, label: "QR con stile cyberpunk" },
  { icon: <ImageIcon size={14} />, label: "QR + logo brand" },
  { icon: <Palette size={14} />, label: "QR pastello minimal" },
];

export function Hero({ onStart }: { onStart: (m: Message) => void }) {
  const [seed, setSeed] = useState<string>("");

  function startWith(text: string) {
    onStart({ id: crypto.randomUUID(), role: "user", text });
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="max-w-3xl mx-auto px-6 flex flex-col items-center justify-center min-h-full py-16">
        <div className="mb-4 flex items-center gap-2 px-3 py-1 rounded-full bg-pill text-xs text-muted-foreground">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          QRForge · powered by GPT-Image-2
        </div>

        <h1 className="text-[34px] sm:text-[40px] font-semibold tracking-tight text-center leading-tight">
          Hello, Loer
        </h1>
        <p className="mt-2 text-lg text-muted-foreground text-center">
          What can I do for you?
        </p>

        <div className="w-full mt-8">
          <Composer
            value={seed}
            onChange={setSeed}
            onSubmit={(t) => startWith(t)}
            placeholder="Descrivi il QR che vuoi creare… (es: QR per shop con stile dark neon)"
            autoFocus
          />
        </div>

        <div className="mt-5 flex flex-wrap gap-2 justify-center">
          {PILLS.map((p) => (
            <button
              key={p.label}
              onClick={() => startWith(p.label)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-pill hover:bg-foreground/10 text-xs text-foreground/80 transition-colors"
            >
              {p.icon}
              {p.label}
            </button>
          ))}
        </div>

        <p className="mt-10 text-xs text-muted-foreground text-center max-w-md">
          Voice mode supportato 🎙️ — clicca il microfono e parla. QRForge ti
          chiederà link di redirect e stile grafico, poi genera il QR
          AI-powered.
        </p>
      </div>
    </div>
  );
}
