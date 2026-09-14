import { NextRequest, NextResponse } from "next/server";
import { syncOrderShiprocketStatus } from "../../../../../lib/shiprocketSync";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await syncOrderShiprocketStatus(id);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.redirect(new URL(`/orders/${id}`, req.url), 303);
}
