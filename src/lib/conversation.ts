import type { Message } from "./types";

const VALID_TLDS = [
  "com", "it", "net", "org", "io", "ai", "app", "co", "me", "us", "eu",
  "de", "fr", "es", "uk", "dev", "tech", "store", "shop", "cloud",
  "online", "site", "biz", "info", "tv", "gg", "xyz",
];

const TLD_ALT = VALID_TLDS.join("|");

// Verbal markers that introduce a URL: "riporta a", "il link è", "punta a", …
const URL_MARKERS = [
  "riporta al sito",
  "riporta a",
  "porta al sito",
  "porta a",
  "punta a",
  "punta al sito",
  "manda a",
  "manda al sito",
  "vai a",
  "vai al sito",
  "il sito è",
  "il sito e",
  "il link è",
  "il link e",
  "url",
  "indirizzo",
  "dominio",
];

function normalizeSpoken(input: string): string {
  let s = " " + input.toLowerCase() + " ";

  // Verbal symbols → literal characters
  s = s.replace(/\s(punto|dot|point)\s/g, ".");
  s = s.replace(/\s(slash|barra)\s/g, "/");
  s = s.replace(/\s(trattino|dash|hyphen)\s/g, "-");
  s = s.replace(/\s(underscore|underline)\s/g, "_");
  s = s.replace(/\s(chiocciola|at)\s/g, "@");
  s = s.replace(/\s(vu vu vu|vvv|tripla v|triple w|w w w)\s/g, " www ");
  s = s.replace(/\s(acca ti ti pi esse|h t t p s)\s/g, " https ");
  s = s.replace(/\s(acca ti ti pi|h t t p)\s/g, " http ");
  s = s.replace(/\sdue punti\s/g, ":");

  // Glue multi-word names before a known TLD:
  // "salute di ferro . com" → "salutediferro.com"
  const glueRe = new RegExp(
    `([a-z0-9][a-z0-9 \\-_]*?[a-z0-9])\\s*\\.\\s*(${TLD_ALT})\\b`,
    "g",
  );
  s = s.replace(glueRe, (_m, name: string, tld: string) => {
    const collapsed = name.replace(/\s+/g, "").toLowerCase();
    return collapsed + "." + tld;
  });

  // Normalize whitespace around URL chars
  s = s.replace(/\s*\.\s*/g, ".");
  s = s.replace(/\s*\/\s*/g, "/");
  s = s.replace(/\s*:\s*\/\s*\//g, "://");

  return s.trim();
}

const STRICT_URL_RE = /\bhttps?:\/\/[^\s]+/gi;
const HOST_RE = new RegExp(
  `\\b(?:www\\.)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\\.(?:${TLD_ALT})(?:\\/[^\\s]*)?\\b`,
  "gi",
);

function validateUrl(raw: string): string | null {
  let cleaned = raw.replace(/[.,;:!?)\]}'"]+$/, "");
  if (!/^https?:\/\//.test(cleaned)) cleaned = "https://" + cleaned;
  try {
    return new URL(cleaned).toString();
  } catch {
    return null;
  }
}

/**
 * Extract the most likely intended URL from a possibly-spoken transcript.
 *
 * Strategy (in order):
 *  1. If there's a "marker phrase" (e.g. "riporta a X"), use whatever follows.
 *  2. Otherwise, find ALL host/URL candidates and pick the LAST one
 *     (users typically state the destination at the END of the prompt:
 *      "voglio grafica accattivante che riporta a salutediferro.com").
 *  3. Validate via new URL().
 */
export function extractUrl(rawText: string): string | null {
  const normalized = normalizeSpoken(rawText);

  // 1) Marker-based extraction
  for (const marker of URL_MARKERS) {
    const idx = normalized.indexOf(marker);
    if (idx !== -1) {
      const tail = normalized.slice(idx + marker.length).trim();
      // Find the first URL-like token in the tail
      const strictMatch = tail.match(/^[^\s]*https?:\/\/[^\s]+|^[^\s]+/);
      void strictMatch;
      const tailMatches = [...tail.matchAll(STRICT_URL_RE)];
      if (tailMatches.length > 0) {
        const u = validateUrl(tailMatches[0][0]);
        if (u) return u;
      }
      const hostMatches = [...tail.matchAll(HOST_RE)];
      if (hostMatches.length > 0) {
        const u = validateUrl(hostMatches[0][0]);
        if (u) return u;
      }
    }
  }

  // 2) Pick the LAST URL/host candidate in the whole text
  const strictAll = [...normalized.matchAll(STRICT_URL_RE)];
  if (strictAll.length > 0) {
    const u = validateUrl(strictAll[strictAll.length - 1][0]);
    if (u) return u;
  }
  const hostAll = [...normalized.matchAll(HOST_RE)];
  if (hostAll.length > 0) {
    const u = validateUrl(hostAll[hostAll.length - 1][0]);
    if (u) return u;
  }
  return null;
}

export function deriveSpec(messages: Message[]) {
  const userTexts = messages.filter((m) => m.role === "user").map((m) => m.text);
  const joined = userTexts.join("\n");
  const redirectUrl = extractUrl(joined);

  // Style hint: latest user message minus URL bits
  const lastUser = userTexts[userTexts.length - 1] ?? "";
  let styleHint = lastUser
    .replace(/\bhttps?:\/\/\S+/gi, " ")
    .replace(/\b(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+\b/gi, " ");
  // Also strip marker phrases so they don't pollute the style prompt
  for (const m of URL_MARKERS) {
    styleHint = styleHint.replace(new RegExp("\\b" + m + "\\b.*", "i"), " ");
  }
  styleHint = styleHint.trim().replace(/\s+/g, " ");

  return {
    redirectUrl,
    styleHint: styleHint || "modern premium minimal design",
  };
}
