# QRForge

> Minimal chat that builds AI-powered, scannable QR codes — with **ElevenLabs voice**.

A fullscreen chat (no chrome, no sidebar). You type or talk; the assistant asks for the redirect URL and returns a stylized, scannable QR. Drop in a logo or reference image — it's read locally in the browser and steered into the generation.

## Stack

- **Next.js 16** (App Router, Turbopack) + **TypeScript** + **Tailwind v4**
- **lucide-react**
- **fal.ai**
  - `openai/gpt-image-2` — text-to-image backdrop
  - `openai/gpt-image-2/edit` — image-to-image when a reference is attached
  - `fal-ai/elevenlabs/tts/turbo-v2.5` — voice for assistant replies
- **qrcode** — server-side QR matrix (error-correction H, guaranteed scannable)
- **Web Speech API** — STT in the browser (free, no key)

## How it works

1. **Chat fullscreen.** Empty state → "Genera il tuo QR" + composer. No sidebar, no header, no plan/credits.
2. **Voice ON / Voice OFF** toggle in the composer. When ON, every assistant message is auto-spoken via fal → ElevenLabs Turbo v2.5. Each message also has a 🔊 button to replay.
3. **🎙️ Mic** dictates into the composer (browser `SpeechRecognition`, `it-IT`).
4. **📎 Paperclip** opens a local file picker. The image is read with `FileReader` as a base64 data URI — **never leaves the browser** until the user clicks send. On generate it's uploaded once to fal storage and used as a reference image for `gpt-image-2/edit`.
5. The composed QR is returned as a `data:image/svg+xml;base64,…` URI — no storage required.

## Env vars (set on Vercel)

| Name | Required | Notes |
|---|---|---|
| `FAL_KEY` | yes (for AI + voice) | If absent: QR still generated locally, no voice |

No DB, no auth, no Blob — demo-ready.

## Run

```bash
bun install
bun run dev   # http://localhost:3000
```

## Deploy

```bash
vercel --prod
```

Or push to `main` — Vercel auto-deploys (GitHub linked).

## Cost notes

- TTS: ElevenLabs Turbo v2.5 via fal — ~$0.05 / 1,000 chars.
- Image: fal `openai/gpt-image-2` — pay-per-image.

## License

MIT — built for an investor pitch by Loer Studio.
