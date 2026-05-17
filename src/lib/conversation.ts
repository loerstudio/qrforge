import type { Message } from "./types";

const URL_RE = /\b((?:https?:\/\/|www\.)[^\s)]+|[a-zA-Z0-9-]+\.[a-z]{2,}(?:\/[^\s)]*)?)/i;

export function extractUrl(text: string): string | null {
  const m = text.match(URL_RE);
  if (!m) return null;
  let u = m[1];
  if (!/^https?:\/\//.test(u)) u = "https://" + u;
  try {
    new URL(u);
    return u;
  } catch {
    return null;
  }
}

export function deriveSpec(messages: Message[]) {
  // Collect all user text + any spec already on a user message.
  const userTexts = messages.filter((m) => m.role === "user").map((m) => m.text);
  const joined = userTexts.join("\n");
  const redirectUrl = extractUrl(joined);
  // style hint = the latest user message text minus URL bits (rough)
  const styleHint = userTexts
    .map((t) => t.replace(URL_RE, "").trim())
    .filter(Boolean)
    .join(" — ");
  return {
    redirectUrl,
    styleHint: styleHint || "modern minimal QR code",
  };
}
