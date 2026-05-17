import type { Message } from "./types";

const VALID_TLDS = [
  "com",
  "it",
  "net",
  "org",
  "io",
  "ai",
  "app",
  "co",
  "me",
  "us",
  "eu",
  "de",
  "fr",
  "es",
  "uk",
  "dev",
  "tech",
  "store",
  "shop",
  "cloud",
  "online",
  "site",
  "biz",
  "info",
  "tv",
  "gg",
  "xyz",
];

/**
 * Normalize Italian/English spoken text into a parseable URL string.
 * Examples:
 *   "salute di ferro punto com"      → "salutediferro.com"
 *   "vai a www dot google dot com"   → "www.google.com"
 *   "loer studio trattino ai punto com" → "loerstudio-ai.com"
 */
function normalizeSpoken(input: string): string {
  let s = " " + input.toLowerCase() + " ";

  // Verbal symbols → literal characters
  s = s.replace(/\s(punto|dot|point)\s/g, ".");
  s = s.replace(/\s(slash|barra)\s/g, "/");
  s = s.replace(/\s(trattino|dash|hyphen)\s/g, "-");
  s = s.replace(/\s(underscore|underline)\s/g, "_");
  s = s.replace(/\s(chiocciola|at)\s/g, "@");

  // Spoken "www" variants
  s = s.replace(/\s(vu vu vu|vvv|tripla v|triple w|w w w)\s/g, " www ");

  // Spoken "https" / "http"
  s = s.replace(/\s(acca ti ti pi esse|h t t p s)\s/g, " https ");
  s = s.replace(/\s(acca ti ti pi|h t t p)\s/g, " http ");

  // "due punti" → ":"
  s = s.replace(/\sdue punti\s/g, ":");

  // Glue words separated by spaces immediately before ".tld"
  // e.g. "salute di ferro.com" → "salutediferro.com"
  const tldAlt = VALID_TLDS.join("|");
  const glueRe = new RegExp(
    `([a-z0-9][a-z0-9 \\-_]*?[a-z0-9])\\s*\\.\\s*(${tldAlt})\\b`,
    "g",
  );
  s = s.replace(glueRe, (_m, name: string, tld: string) => {
    const collapsed = name.replace(/\s+/g, "").toLowerCase();
    return collapsed + "." + tld;
  });

  // Collapse stray whitespace around dots and slashes
  s = s.replace(/\s*\.\s*/g, ".");
  s = s.replace(/\s*\/\s*/g, "/");
  s = s.replace(/\s*:\s*\/\s*\//g, "://");

  return s.trim();
}

const STRICT_URL_RE = /\bhttps?:\/\/[^\s]+/i;
const HOST_RE = new RegExp(
  `\\b(?:www\\.)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\\.(?:${VALID_TLDS.join("|")})(?:\\/[^\\s]*)?\\b`,
  "i",
);

export function extractUrl(rawText: string): string | null {
  const normalized = normalizeSpoken(rawText);

  // 1) Already a full http(s) URL anywhere?
  const strict = normalized.match(STRICT_URL_RE);
  if (strict) {
    const cleaned = strict[0].replace(/[.,;:!?)\]}'"]+$/, "");
    try {
      return new URL(cleaned).toString();
    } catch {
      // fall through
    }
  }

  // 2) Host-like sequence with a known TLD
  const host = normalized.match(HOST_RE);
  if (host) {
    const cleaned = host[0].replace(/[.,;:!?)\]}'"]+$/, "");
    const url = "https://" + cleaned;
    try {
      return new URL(url).toString();
    } catch {
      return null;
    }
  }
  return null;
}

export function deriveSpec(messages: Message[]) {
  const userTexts = messages.filter((m) => m.role === "user").map((m) => m.text);
  const joined = userTexts.join("\n");
  const redirectUrl = extractUrl(joined);

  // Style hint: latest user message minus the URL bits
  const lastUser = userTexts[userTexts.length - 1] ?? "";
  const styleHint = lastUser
    .replace(/\bhttps?:\/\/\S+/gi, "")
    .replace(/\b(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+\b/gi, "")
    .trim()
    .replace(/\s+/g, " ");

  return {
    redirectUrl,
    styleHint: styleHint || "modern minimal premium design",
  };
}
