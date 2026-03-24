import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BUCKET = "receipts";

// Upload receipt image to Supabase Storage and return a public URL
export async function POST(request: NextRequest) {
  try {
    const { imageBase64 } = await request.json();
    if (!imageBase64 || typeof imageBase64 !== "string") {
      return NextResponse.json({ success: false, error: "imageBase64 required" }, { status: 400 });
    }

    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    if (buffer.length > 5 * 1024 * 1024) {
      return NextResponse.json({ success: false, error: "Image exceeds 5MB limit" }, { status: 400 });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      console.error("Receipt image upload: SUPABASE_URL or SUPABASE_SERVICE_KEY not configured");
      return NextResponse.json({ success: false, error: "Storage not configured" }, { status: 503 });
    }

    const fileName = `rcpt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;

    // Upload to Supabase Storage via REST API
    const uploadUrl = `${supabaseUrl}/storage/v1/object/${BUCKET}/${fileName}`;
    const uploadRes = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "image/png",
        "x-upsert": "true",
      },
      body: buffer,
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      // If bucket doesn't exist, try to create it and retry
      if (uploadRes.status === 404 || err.includes("Bucket not found")) {
        const createBucketRes = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: BUCKET,
            name: BUCKET,
            public: true,
          }),
        });

        if (!createBucketRes.ok) {
          const bucketErr = await createBucketRes.text();
          console.error("Failed to create receipts bucket:", bucketErr);
          return NextResponse.json({ success: false, error: "Failed to create storage bucket" }, { status: 500 });
        }

        // Retry upload
        const retryRes = await fetch(uploadUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "image/png",
            "x-upsert": "true",
          },
          body: buffer,
        });

        if (!retryRes.ok) {
          const retryErr = await retryRes.text();
          console.error("Receipt image upload retry failed:", retryErr);
          return NextResponse.json({ success: false, error: "Upload failed after bucket creation" }, { status: 500 });
        }
      } else {
        console.error("Receipt image upload failed:", err);
        return NextResponse.json({ success: false, error: "Upload to storage failed" }, { status: 500 });
      }
    }

    // Public URL — Supabase serves public bucket files at this path
    const imageUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${fileName}`;

    return NextResponse.json({ success: true, data: { id: fileName, imageUrl } });
  } catch (error) {
    console.error("Receipt image upload failed:", error);
    return NextResponse.json({ success: false, error: "Failed to store image" }, { status: 500 });
  }
}
