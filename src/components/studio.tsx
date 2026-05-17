"use client";

import { useState } from "react";
import { Hero } from "./hero";
import { Chat } from "./chat";
import type { Message } from "@/lib/types";

export function Studio() {
  const [messages, setMessages] = useState<Message[]>([]);
  if (messages.length === 0) {
    return <Hero onStart={(m) => setMessages([m])} />;
  }
  return <Chat messages={messages} setMessages={setMessages} />;
}
