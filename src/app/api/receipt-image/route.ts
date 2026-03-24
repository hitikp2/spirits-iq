import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir, readFile, unlink } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

const RECEIPT_DIR = path.join(process.cwd(), ".receipt-images");

// POST — Store a receipt image (base64 PNG), return its ID
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

    await mkdir(RECEIPT_DIR, { recursive: true });

    const id = `rcpt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const filePath = path.join(RECEIPT_DIR, `${id}.png`);
    await writeFile(filePath, buffer);

    // Auto-cleanup after 10 minutes
    setTimeout(async () => {
      try { await unlink(filePath); } catch {}
    }, 10 * 60 * 1000);

    // Build public URL for Twilio to fetch
    const baseUrl = process.env.NEXTAUTH_URL || `https://${request.headers.get("host")}`;
    const imageUrl = `${baseUrl}/api/receipt-image?id=${id}`;

    return NextResponse.json({ success: true, data: { id, imageUrl } });
  } catch (error) {
    console.error("Receipt image upload failed:", error);
    return NextResponse.json({ success: false, error: "Failed to store image" }, { status: 500 });
  }
}

// GET — Serve a stored receipt image by ID
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id || !/^rcpt_\d+_[a-z0-9]+$/.test(id)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const filePath = path.join(RECEIPT_DIR, `${id}.png`);
  try {
    const buffer = await readFile(filePath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=600",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
