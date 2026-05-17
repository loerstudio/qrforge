"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Mic,
  MicOff,
  Paperclip,
  Square,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { getRecognition } from "@/lib/speech";

interface SendPayload {
  text: string;
  attachmentDataUri?: string;
}

interface Props {
  onSubmit: (p: SendPayload) => void;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  voiceMode: boolean;
  onToggleVoiceMode: () => void;
}

export function Composer({
  onSubmit,
  placeholder,
  autoFocus,
  disabled,
  voiceMode,
  onToggleVoiceMode,
}: Props) {
  const [value, setValue] = useState("");
  const [listening, setListening] = useState(false);
  const [supportedSTT, setSupportedSTT] = useState(true);
  const [attachment, setAttachment] = useState<{
    dataUri: string;
    name: string;
  } | null>(null);

  const recRef = useRef<SpeechRecognition | null>(null);
  const baseRef = useRef<string>("");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const r = getRecognition();
    if (!r) {
      setSupportedSTT(false);
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
      setValue(next);
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
  }, []);

  function toggleMic() {
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

  function handleFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    if (file.size > 8 * 1024 * 1024) {
      alert("Immagine troppo grande (max 8MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUri = reader.result as string;
      setAttachment({ dataUri, name: file.name });
    };
    reader.readAsDataURL(file);
  }

  function submit() {
    const t = value.trim();
    if (!t && !attachment) return;
    if (disabled) return;
    if (listening) {
      try {
        recRef.current?.stop();
      } catch {}
      setListening(false);
    }
    onSubmit({ text: t, attachmentDataUri: attachment?.dataUri });
    setValue("");
    setAttachment(null);
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
      {attachment && (
        <div className="flex items-center gap-3 px-3 pt-3">
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={attachment.dataUri}
              alt={attachment.name}
              className="w-14 h-14 rounded-lg object-cover border border-border"
            />
            <button
              onClick={() => setAttachment(null)}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-foreground text-background flex items-center justify-center"
              aria-label="Remove attachment"
            >
              <X size={12} />
            </button>
          </div>
          <span className="text-xs text-muted-foreground truncate max-w-[200px]">
            {attachment.name}
          </span>
        </div>
      )}

      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        autoFocus={autoFocus}
        rows={1}
        className="w-full resize-none bg-transparent px-4 pt-4 pb-2 text-[15px] leading-6 placeholder:text-muted-foreground focus:outline-none"
      />

      <div className="flex items-center justify-between px-2 pb-2">
        <div className="flex items-center gap-1">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-pill"
            aria-label="Allega immagine"
            title="Allega immagine (logo, riferimento)"
          >
            <Paperclip size={16} />
          </button>
          <button
            type="button"
            onClick={onToggleVoiceMode}
            className={`flex items-center gap-1 px-2 h-8 rounded-lg text-xs transition-colors ${
              voiceMode
                ? "bg-blue-50 text-blue-700"
                : "text-muted-foreground hover:bg-pill"
            }`}
            title={voiceMode ? "Voice mode ON" : "Voice mode OFF"}
          >
            {voiceMode ? <Volume2 size={14} /> : <VolumeX size={14} />}
            <span>{voiceMode ? "Voice ON" : "Voice OFF"}</span>
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={toggleMic}
            disabled={!supportedSTT}
            title={supportedSTT ? "Parla" : "Browser non supportato"}
            className={`relative w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
              listening
                ? "bg-blue-600 text-white voice-ring"
                : supportedSTT
                  ? "text-muted-foreground hover:bg-pill"
                  : "text-border cursor-not-allowed"
            }`}
            aria-label="Voice input"
          >
            {listening ? (
              <Square size={14} />
            ) : supportedSTT ? (
              <Mic size={16} />
            ) : (
              <MicOff size={16} />
            )}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={(!value.trim() && !attachment) || disabled}
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
