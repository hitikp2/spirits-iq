import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// In-memory store for receipt images (auto-expires after 10 min)
// Works reliably on Railway/Docker — no filesystem dependency
const imageStore = new Map<string, { buffer: Buffer; expires: number }>();

function cleanExpired() {
  const now = Date.now();
  for (const [key, val] of imageStore) {
    if (val.expires < now) imageStore.delete(key);
  }
}

// POST — Store a receipt image (base64 PNG), return its public URL
export async function POST(request: NextRequest) {
  try {
    const { imageBase64 } = await request.json();
    if (!imageBase64 || typeof imageBase64 !== "string") {
      return NextResponse.json({ success: false, error: "imageBase64 required" }, { status: 400 });
    }

    // Strip data URI prefix if present
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    // Limit to 5MB (Twilio MMS limit)
    if (buffer.length > 5 * 1024 * 1024) {
      return NextResponse.json({ success: false, error: "Image exceeds 5MB limit" }, { status: 400 });
    }

    // Cleanup expired images periodically
    cleanExpired();

    const id = `rcpt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    imageStore.set(id, { buffer, expires: Date.now() + 10 * 60 * 1000 });

    // Build public URL for Twilio to fetch
    const baseUrl = process.env.NEXTAUTH_URL || `https://${request.headers.get("host")}`;
    const imageUrl = `${baseUrl}/api/receipt-image?id=${id}`;

    return NextResponse.json({ success: true, data: { id, imageUrl } });
  } catch (error) {
    console.error("Receipt image upload failed:", error);
    return NextResponse.json({ success: false, error: "Failed to store image" }, { status: 500 });
  }
}

// GET — Serve a stored receipt image by ID (called by Twilio to fetch MMS media)
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id || !/^rcpt_\d+_[a-z0-9]+$/.test(id)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const entry = imageStore.get(id);
  if (!entry || entry.expires < Date.now()) {
    if (entry) imageStore.delete(id);
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(entry.buffer, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=600",
    },
  });
}
