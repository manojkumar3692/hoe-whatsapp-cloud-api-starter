import { NextRequest, NextResponse } from "next/server";
import { syncOrderDelhiveryStatus } from "../../../../../lib/delhiverySync";

// Manual "Sync Now" — always forces a fresh Delhivery call regardless of
// how recently it last synced (unlike the automatic on-page-load sync,
// which throttles itself). Shares the actual sync logic with that
// automatic path via lib/delhiverySync.ts.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await syncOrderDelhiveryStatus(id);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.redirect(new URL(`/orders/${id}`, req.url), 303);
}
