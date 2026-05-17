import { NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import QRCode from "qrcode";

export const runtime = "nodejs";
export const maxDuration = 60;

interface Body {
  redirectUrl?: string;
  styleHint?: string;
  referenceImage?: string | null;
}

interface FalImageResult {
  data?: { images?: { url?: string }[] };
}

function buildPrompt(styleHint: string, hasRef: boolean) {
  const base = [
    "A square, high-resolution decorative artwork that serves as a stylish backdrop for a QR code.",
    `Style and theme: ${styleHint}.`,
    "Composition: leave a clean, centered square area with calm contrast suitable for an overlaid QR matrix.",
    "Avoid text, letters, words, numbers, signatures, watermarks, or logos.",
    "Aesthetic: premium, modern, balanced negative space, soft lighting, professional poster look.",
  ];
  if (hasRef) {
    base.push(
      "Use the reference image for brand colors, mood, and visual identity. Do NOT reproduce its content literally; translate it into a clean square backdrop.",
    );
  }
  return base.join(" ");
}

function dataUriToBlob(dataUri: string): { blob: Blob; ext: string } | null {
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUri);
  if (!m) return null;
  const mime = m[1];
  const bytes = Buffer.from(m[2], "base64");
  const ext = mime.split("/")[1] || "png";
  return { blob: new Blob([bytes], { type: mime }), ext };
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      console.warn(`[fal:${label}] timed out after ${ms}ms`);
      resolve(null);
    }, ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        console.error(`[fal:${label}] rejected:`, e);
        resolve(null);
      },
    );
  });
}

function pickUrl(result: FalImageResult | null): string | null {
  return result?.data?.images?.[0]?.url ?? null;
}

// --- Model attempts (each returns a URL or null; never throws) ---

async function tryGptImage2(
  prompt: string,
  referenceUrl: string | null,
): Promise<string | null> {
  const TIMEOUT = 35_000;
  if (referenceUrl) {
    const r = await withTimeout(
      fal.subscribe("openai/gpt-image-2/edit", {
        input: {
          prompt,
          image_urls: [referenceUrl],
          image_size: "square_hd",
          quality: "medium",
          num_images: 1,
          output_format: "png",
        },
        logs: false,
      }),
      TIMEOUT,
      "gpt-image-2/edit",
    );
    return pickUrl(r as FalImageResult | null);
  }
  const r = await withTimeout(
    fal.subscribe("openai/gpt-image-2", {
      input: {
        prompt,
        image_size: "square_hd",
        quality: "medium",
        num_images: 1,
        output_format: "png",
      },
      logs: false,
    }),
    TIMEOUT,
    "gpt-image-2",
  );
  return pickUrl(r as FalImageResult | null);
}

async function trySeedreamV4(prompt: string): Promise<string | null> {
  const r = await withTimeout(
    fal.subscribe("fal-ai/bytedance/seedream/v4/text-to-image", {
      input: {
        prompt,
        image_size: "square_hd",
        num_images: 1,
        enable_safety_checker: false,
      },
      logs: false,
    }),
    25_000,
    "seedream-v4",
  );
  return pickUrl(r as FalImageResult | null);
}

async function tryNanoBanana2(prompt: string): Promise<string | null> {
  const r = await withTimeout(
    fal.subscribe("fal-ai/nano-banana-2", {
      input: {
        prompt,
        aspect_ratio: "1:1",
        resolution: "1K",
        num_images: 1,
        output_format: "png",
      },
      logs: false,
    }),
    25_000,
    "nano-banana-2",
  );
  return pickUrl(r as FalImageResult | null);
}

async function generateBackground(
  prompt: string,
  referenceImage: string | null,
): Promise<{ url: string; model: string } | null> {
  if (!process.env.FAL_KEY) return null;
  fal.config({ credentials: process.env.FAL_KEY });

  // Upload reference image to fal storage once (used by gpt-image-2/edit).
  let referenceUrl: string | null = null;
  if (referenceImage) {
    const parsed = dataUriToBlob(referenceImage);
    if (parsed) {
      try {
        const file = new File([parsed.blob], `ref.${parsed.ext}`, {
          type: parsed.blob.type,
        });
        referenceUrl = await fal.storage.upload(file);
      } catch (e) {
        console.error("[fal] storage upload failed:", e);
      }
    }
  }

  // Chain: gpt-image-2 → Seedream v4 → Nano Banana 2
  // Each attempt is timeout-bounded and never throws.
  const attempts: { name: string; run: () => Promise<string | null> }[] = [
    { name: "gpt-image-2", run: () => tryGptImage2(prompt, referenceUrl) },
    { name: "seedream-v4", run: () => trySeedreamV4(prompt) },
    { name: "nano-banana-2", run: () => tryNanoBanana2(prompt) },
  ];

  for (const a of attempts) {
    console.log(`[fal] attempting ${a.name}`);
    const url = await a.run();
    if (url) {
      console.log(`[fal] ✓ ${a.name} succeeded`);
      return { url, model: a.name };
    }
    console.warn(`[fal] ✗ ${a.name} failed, falling through`);
  }
  return null;
}

async function composeQR(redirectUrl: string, bgUrl: string) {
  const qrSvg = await QRCode.toString(redirectUrl, {
    type: "svg",
    errorCorrectionLevel: "H",
    margin: 2,
    width: 600,
    color: { dark: "#0a0a0a", light: "#ffffff" },
  });

  const SIZE = 1024;
  const QR_SIZE = 600;
  const offset = (SIZE - QR_SIZE) / 2;
  const innerQR = qrSvg
    .replace(/<\?xml[^?]*\?>/, "")
    .replace(/<svg[^>]*>/, "")
    .replace(/<\/svg>/, "");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
  <defs>
    <clipPath id="round"><rect width="${SIZE}" height="${SIZE}" rx="48" ry="48"/></clipPath>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="6"/>
    </filter>
  </defs>
  <g clip-path="url(#round)">
    <image href="${escapeAttr(bgUrl)}" x="0" y="0" width="${SIZE}" height="${SIZE}" preserveAspectRatio="xMidYMid slice"/>
    <rect x="0" y="0" width="${SIZE}" height="${SIZE}" fill="rgba(255,255,255,0.18)"/>
    <rect x="${offset - 24}" y="${offset - 24}" width="${QR_SIZE + 48}" height="${QR_SIZE + 48}" rx="32" fill="rgba(0,0,0,0.18)" filter="url(#soft)"/>
    <rect x="${offset - 20}" y="${offset - 20}" width="${QR_SIZE + 40}" height="${QR_SIZE + 40}" rx="28" fill="#ffffff"/>
    <g transform="translate(${offset}, ${offset})">
      <svg width="${QR_SIZE}" height="${QR_SIZE}" viewBox="0 0 ${QR_SIZE} ${QR_SIZE}" xmlns="http://www.w3.org/2000/svg">${innerQR}</svg>
    </g>
  </g>
</svg>`;
}

function escapeAttr(s: string) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

export async function POST(req: Request) {
  try {
    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const redirectUrl = body.redirectUrl?.trim();
    const styleHint = body.styleHint?.trim() || "modern minimal premium design";
    if (!redirectUrl) {
      return NextResponse.json(
        { error: "redirectUrl required" },
        { status: 400 },
      );
    }
    try {
      new URL(redirectUrl);
    } catch {
      return NextResponse.json(
        { error: "redirectUrl is not a valid URL" },
        { status: 400 },
      );
    }

    if (!process.env.FAL_KEY) {
      return NextResponse.json(
        {
          error:
            "Configurazione mancante: FAL_KEY non impostata. Aggiungila su Vercel.",
        },
        { status: 503 },
      );
    }

    const prompt = buildPrompt(styleHint, Boolean(body.referenceImage));
    const bg = await generateBackground(prompt, body.referenceImage ?? null);

    if (!bg) {
      // POLICY: never fall back to static QR. Surface the error to the caller.
      return NextResponse.json(
        {
          error:
            "Tutti e tre i modelli AI (gpt-image-2, Seedream v4, Nano Banana 2) non hanno risposto in tempo. Riprova fra qualche secondo o semplifica la descrizione.",
        },
        { status: 502 },
      );
    }

    const svg = await composeQR(redirectUrl, bg.url);
    const dataUri =
      "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
    return NextResponse.json({
      imageUrl: dataUri,
      model: bg.model,
      bgUrl: bg.url,
    });
  } catch (err) {
    console.error("[generate] fatal:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Errore interno" },
      { status: 500 },
    );
  }
}
