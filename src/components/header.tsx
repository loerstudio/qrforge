"use client";
import { Coins, Sparkles } from "lucide-react";

export function Header() {
  return (
    <header className="h-12 border-b border-border flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">QRForge</span>
        <span className="text-border">/</span>
        <span className="px-2 py-0.5 rounded-md bg-pill text-xs font-medium">
          Free plan
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-pill text-xs text-muted-foreground">
          <Coins size={13} />
          <span className="tabular-nums">300 credits</span>
        </div>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-foreground text-background text-xs font-medium hover:opacity-90 transition-opacity">
          <Sparkles size={13} />
          Upgrade
        </button>
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 text-white text-xs font-semibold flex items-center justify-center">
          L
        </div>
      </div>
    </header>
  );
}
