"use client";

import { useState } from "react";
import { ModePicker } from "./mode-picker";
import { Chat } from "./chat";
import { VoiceMode } from "./voice-mode";

export type Mode = "text" | "voice";

export function ModeRouter() {
  const [mode, setMode] = useState<Mode | null>(null);
  if (!mode) return <ModePicker onPick={setMode} />;
  if (mode === "text") return <Chat onExit={() => setMode(null)} />;
  return <VoiceMode onExit={() => setMode(null)} />;
}
