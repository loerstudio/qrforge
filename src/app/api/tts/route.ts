import { NextResponse } from "next/server";
import { fal } from "@fal-ai/client";

export const runtime = "nodejs";
export const maxDuration = 30;

interface Body {
  text?: string;
  voice?: string;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ error: "text required" }, { status: 400 });
  }
  if (!process.env.FAL_KEY) {
    return NextResponse.json(
      { error: "FAL_KEY non configurata" },
      { status: 503 },
    );
  }
  try {
    fal.config({ credentials: process.env.FAL_KEY });
    const result = await fal.subscribe("fal-ai/elevenlabs/tts/turbo-v2.5", {
      input: {
        text: text.slice(0, 2000),
        voice: body.voice || "Rachel",
        stability: 0.45,
        similarity_boost: 0.8,
        speed: 1,
        language_code: "it",
      },
      logs: false,
    });
    const url = (result as { data?: { audio?: { url?: string } } })?.data
      ?.audio?.url;
    if (!url) {
      return NextResponse.json({ error: "no audio url" }, { status: 502 });
    }
    return NextResponse.json({ audioUrl: url });
  } catch (err) {
    console.error("[tts] fal failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "tts failed" },
      { status: 502 },
    );
  }
}
