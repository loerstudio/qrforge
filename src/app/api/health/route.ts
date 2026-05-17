import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    name: "QRForge",
    falConfigured: Boolean(process.env.FAL_KEY),
    blobConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    timestamp: new Date().toISOString(),
  });
}
