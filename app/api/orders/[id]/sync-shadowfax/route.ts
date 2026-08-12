import { NextRequest, NextResponse } from "next/server";
import { syncOrderShadowfaxStatus } from "../../../../../lib/shadowfaxSync";

// Manual "Sync Now" for Shadowfax — mirrors sync-delhivery/route.ts.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const form = await req.formData();

  if (form.get("admin_password") !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await syncOrderShadowfaxStatus(id);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.redirect(new URL(`/orders/${id}`, req.url), 303);
}
