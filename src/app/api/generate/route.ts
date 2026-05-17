import { NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import QRCode from "qrcode";
import { put } from "@vercel/blob";

export const runtime = "nodejs";
export const maxDuration = 60;

interface Body {
  redirectUrl?: string;
  styleHint?: string;
}

function buildPrompt(styleHint: string) {
  return [
    "A square, high-resolution decorative artwork that serves as a stylish backdrop for a QR code.",
    `Style and theme: ${styleHint}.`,
    "Composition: leave a clean, centered square area with calm contrast suitable for an overlaid QR matrix.",
    "Avoid text, letters, words, numbers, signatures, watermarks, or logos.",
    "Aesthetic: premium, modern, balanced negative space, soft lighting, professional poster look.",
  ].join(" ");
}

async function generateBackground(prompt: string): Promise<string | null> {
  if (!process.env.FAL_KEY) return null;
  try {
    fal.config({ credentials: process.env.FAL_KEY });
    const result = await fal.subscribe("openai/gpt-image-2", {
      input: {
        prompt,
        image_size: "square_hd",
        quality: "high",
        num_images: 1,
        output_format: "png",
      },
      logs: false,
    });
    const url = (result as { data?: { images?: { url?: string }[] } })?.data
      ?.images?.[0]?.url;
    return url ?? null;
  } catch (err) {
    console.error("[fal] gpt-image-2 failed:", err);
    return null;
  }
}

async function composeQR(redirectUrl: string, bgUrl: string | null) {
  // Always produce a guaranteed-scannable QR; if we have a fal background,
  // we render the QR on top as a centered overlay (white safe zone behind it).
  const qrSvg = await QRCode.toString(redirectUrl, {
    type: "svg",
    errorCorrectionLevel: "H",
    margin: 2,
    width: 600,
    color: { dark: "#0a0a0a", light: "#ffffff" },
  });

  // Wrap in an outer SVG that includes the background image (if any) plus the
  // QR centered with a white rounded card behind it.
  const SIZE = 1024;
  const QR_SIZE = 600;
  const offset = (SIZE - QR_SIZE) / 2;
  const innerQR = qrSvg
    .replace(/<\?xml[^?]*\?>/, "")
    .replace(/<svg[^>]*>/, "")
    .replace(/<\/svg>/, "");

  const composed = `<?xml version="1.0" encoding="UTF-8"?>
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
  return composed;
}

function escapeAttr(s: string) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const redirectUrl = body.redirectUrl?.trim();
  const styleHint = body.styleHint?.trim() || "modern minimal premium design";
  if (!redirectUrl) {
    return NextResponse.json({ error: "redirectUrl required" }, { status: 400 });
  }
  try {
    new URL(redirectUrl);
  } catch {
    return NextResponse.json({ error: "redirectUrl is not a valid URL" }, { status: 400 });
  }

  const prompt = buildPrompt(styleHint);
  const bg = await generateBackground(prompt);
  const svg = await composeQR(redirectUrl, bg);

  // Try to upload to Vercel Blob; if unavailable in this env, fall back to data URI.
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const blob = await put(
        `qr/${crypto.randomUUID()}.svg`,
        new Blob([svg], { type: "image/svg+xml" }),
        { access: "public", addRandomSuffix: false },
      );
      return NextResponse.json({
        imageUrl: blob.url,
        fallback: !bg,
        bgUrl: bg ?? null,
      });
    } catch (err) {
      console.error("[blob] put failed:", err);
    }
  }

  const dataUri = "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
  return NextResponse.json({
    imageUrl: dataUri,
    fallback: !bg,
    bgUrl: bg ?? null,
  });
}
