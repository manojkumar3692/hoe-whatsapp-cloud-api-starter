import { NextRequest, NextResponse } from "next/server";
import { fetchMediaBytes } from "../../../../lib/whatsapp";

// Streams a customer-sent WhatsApp media file (image/audio/video/document)
// through our server so <img>/<audio>/<video>/download links can use it
// directly, without exposing the Meta access token to the browser.
//
// Note: same trust model as the rest of this internal dashboard — there's
// no session auth on GET routes here (see README: "add proper login before
// real production use"). Don't put this dashboard on the public internet
// without adding auth in front of it.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Media id required" }, { status: 400 });
    }

    const { buffer, mimeType } = await fetchMediaBytes(id);

    return new NextResponse(Buffer.from(buffer), {
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e: any) {
    console.error("MEDIA PROXY ERROR:", e);

    return NextResponse.json(
      { error: e.message || "Media fetch failed" },
      { status: 500 }
    );
  }
}
