"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Mic, MicOff, Paperclip, Sparkles, Square } from "lucide-react";
import { getRecognition } from "@/lib/speech";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}

export function Composer({
  value,
  onChange,
  onSubmit,
  placeholder,
  autoFocus,
  disabled,
}: Props) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const recRef = useRef<SpeechRecognition | null>(null);
  const baseRef = useRef<string>("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const r = getRecognition();
    if (!r) {
      setSupported(false);
      return;
    }
    r.onresult = (e) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const txt = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += txt;
        else interim += txt;
      }
      const next = (baseRef.current + " " + final + interim).trim();
      onChange(next);
      if (final) baseRef.current = (baseRef.current + " " + final).trim();
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recRef.current = r;
    return () => {
      try {
        r.abort();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleVoice() {
    if (!recRef.current) return;
    if (listening) {
      recRef.current.stop();
      setListening(false);
    } else {
      baseRef.current = value;
      try {
        recRef.current.start();
        setListening(true);
      } catch {
        setListening(false);
      }
    }
  }

  function handleSubmit() {
    const t = value.trim();
    if (!t || disabled) return;
    if (listening) {
      try {
        recRef.current?.stop();
      } catch {}
      setListening(false);
    }
    onSubmit(t);
    onChange("");
    baseRef.current = "";
  }

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "0px";
    ta.style.height = Math.min(ta.scrollHeight, 220) + "px";
  }, [value]);

  return (
    <div
      className={`relative rounded-2xl border ${
        listening ? "border-blue-500 ring-2 ring-blue-100" : "border-border"
      } bg-white shadow-sm transition-all`}
    >
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
          }
        }}
        placeholder={placeholder}
        autoFocus={autoFocus}
        rows={1}
        className="w-full resize-none bg-transparent px-4 pt-4 pb-2 text-[15px] leading-6 placeholder:text-muted-foreground focus:outline-none"
      />
      <div className="flex items-center justify-between px-2 pb-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-pill"
            aria-label="Attach"
          >
            <Paperclip size={16} />
          </button>
          <button
            type="button"
            className="hidden sm:flex items-center gap-1 px-2 h-8 rounded-lg text-xs text-muted-foreground hover:bg-pill"
          >
            <Sparkles size={14} />
            <span>gpt-image-2</span>
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={toggleVoice}
            disabled={!supported}
            title={supported ? "Voice mode" : "Browser non supportato"}
            className={`relative w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
              listening
                ? "bg-blue-600 text-white voice-ring"
                : supported
                  ? "text-muted-foreground hover:bg-pill"
                  : "text-border cursor-not-allowed"
            }`}
            aria-label="Voice"
          >
            {listening ? <Square size={14} /> : supported ? <Mic size={16} /> : <MicOff size={16} />}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!value.trim() || disabled}
            className="w-8 h-8 rounded-lg flex items-center justify-center bg-foreground text-background disabled:bg-pill disabled:text-muted-foreground transition-colors"
            aria-label="Send"
          >
            <ArrowUp size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
