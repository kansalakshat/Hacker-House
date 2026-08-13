import { put } from "@vercel/blob";
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

/** 1200x675 PNGs land around 1MB; anything much past that is not ours. */
const MAX_BYTES = 8 * 1024 * 1024;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export async function POST(req: Request) {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) {
    return NextResponse.json({ error: "Image too large." }, { status: 413 });
  }

  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "Image too large." }, { status: 413 });
  }
  // Only ever host real PNGs, whatever the client claims the content type is.
  if (!PNG_MAGIC.every((b, i) => bytes[i] === b)) {
    return NextResponse.json({ error: "Expected a PNG." }, { status: 415 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "Sharing is not configured: BLOB_READ_WRITE_TOKEN is missing." },
      { status: 503 },
    );
  }

  const id = randomBytes(6).toString("hex");
  await put(`f/${id}.png`, Buffer.from(bytes), {
    access: "public",
    contentType: "image/png",
    addRandomSuffix: false,
    cacheControlMaxAge: 31536000,
  });

  return NextResponse.json({ id });
}
