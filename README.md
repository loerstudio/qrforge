# QRForge

> Manus-style AI studio that builds beautiful, scannable QR codes from a chat — with **Voice Mode**.

A pixel-careful Manus clone (thin left sidebar, centered hero, Free plan / credits / Upgrade header, pill quick-actions, large bordered input) re-skinned and repurposed for one job: **AI-powered QR code generation**.

## What it does

1. You describe the QR you want (style, brand, use case) — by typing OR by **voice** (Web Speech API).
2. The assistant asks for your **redirect URL**.
3. It calls **fal.ai → `openai/gpt-image-2`** to generate a square branded backdrop, then composes a **guaranteed-scannable QR** (error-correction H) centered on top with a white safe zone.
4. Result is uploaded to **Vercel Blob** and shown in chat with a one-click download.

If `FAL_KEY` is missing or fal errors, the route still returns a clean, scannable QR (fallback mode).

## Stack

- **Next.js 16** (App Router, Turbopack, RSC) + **TypeScript**
- **Tailwind CSS v4**
- **lucide-react** icons
- **@fal-ai/client** — `openai/gpt-image-2` (text-to-image)
- **qrcode** — server-side QR matrix (error-correction H)
- **@vercel/blob** — image storage
- **Web Speech API** — Voice Mode (Chrome / Edge / Safari)

## Local dev

```bash
bun install
bun run dev
```

Open http://localhost:3000.

## Env vars

Set these in Vercel:

| Name | Required | What it is |
|---|---|---|
| `FAL_KEY` | recommended | fal.ai API key. Without it, generation falls back to a plain styled QR. |
| `BLOB_READ_WRITE_TOKEN` | recommended | Vercel Blob token. Without it, the SVG is returned as a data URI. |

## Deploy

```bash
vercel link
vercel --prod
```

Push to `main` → Vercel auto-deploys.

## Voice Mode

Click the 🎙️ in the composer. It uses the browser's `SpeechRecognition` (continuous + interim results, `it-IT` by default). The assistant also speaks short confirmations back via `speechSynthesis`.

## Project layout

```
src/
  app/
    api/generate/route.ts   # fal gpt-image-2 → SVG compose → Vercel Blob
    api/health/route.ts     # env / status probe
    layout.tsx              # sidebar + header shell
    page.tsx                # Studio (hero ↔ chat)
    globals.css             # Manus-style tokens
  components/
    sidebar.tsx
    header.tsx
    studio.tsx
    hero.tsx                # "What can I do for you?" + pills
    composer.tsx            # input + voice + send
    chat.tsx                # messages, generation flow
  lib/
    conversation.ts         # URL extraction + spec derivation
    speech.ts               # Web Speech wrappers
    types.ts
```

## License

MIT — built for an investor pitch demo by Loer Studio.
