import { NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import QRCode from "qrcode";

export const runtime = "nodejs";
export const maxDuration = 60;

interface Body {
  redirectUrl?: string;
  styleHint?: string;
  referenceImage?: string | null; // data URI from browser FileReader
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
  return {
    blob: new Blob([bytes], { type: mime }),
    ext,
  };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      console.warn(`[fal] timed out after ${ms}ms`);
      resolve(null);
    }, ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        console.error("[fal] rejected:", e);
        resolve(null);
      },
    );
  });
}

async function generateBackground(
  prompt: string,
  referenceImage: string | null,
): Promise<string | null> {
  if (!process.env.FAL_KEY) return null;
  try {
    fal.config({ credentials: process.env.FAL_KEY });

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

    const TIMEOUT = 45_000;

    if (referenceUrl) {
      const result = await withTimeout(
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
      );
      return (
        (result as { data?: { images?: { url?: string }[] } } | null)?.data
          ?.images?.[0]?.url ?? null
      );
    }

    const result = await withTimeout(
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
    );
    return (
      (result as { data?: { images?: { url?: string }[] } } | null)?.data
        ?.images?.[0]?.url ?? null
    );
  } catch (err) {
    console.error("[fal] gpt-image-2 failed:", err);
    return null;
  }
}

async function composeQR(redirectUrl: string, bgUrl: string | null) {
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
    ${
      bgUrl
        ? `<image href="${escapeAttr(bgUrl)}" x="0" y="0" width="${SIZE}" height="${SIZE}" preserveAspectRatio="xMidYMid slice"/>
           <rect x="0" y="0" width="${SIZE}" height="${SIZE}" fill="rgba(255,255,255,0.18)"/>`
        : `<rect width="${SIZE}" height="${SIZE}" fill="#fafafa"/>`
    }
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

    const prompt = buildPrompt(styleHint, Boolean(body.referenceImage));
    const bg = await generateBackground(prompt, body.referenceImage ?? null);
    const svg = await composeQR(redirectUrl, bg);

    const dataUri =
      "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
    return NextResponse.json({
      imageUrl: dataUri,
      fallback: !bg,
      bgUrl: bg ?? null,
    });
  } catch (err) {
    console.error("[generate] fatal:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Errore interno",
      },
      { status: 500 },
    );
  }
}
