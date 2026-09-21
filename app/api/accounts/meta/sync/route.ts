import { NextRequest, NextResponse } from "next/server";
import { financeAccess } from "../../../../../lib/financeRequest";
import { syncMetaMonth } from "../../../../../lib/metaAds";
import { dateKey, shiftMonth } from "../../../../../lib/accounting";
export const runtime = "nodejs";
export const maxDuration = 300;
// Scheduled refresh uses the same shared secret as existing operational jobs.
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const month = dateKey(new Date()).slice(0, 7);
    const current = await syncMetaMonth(month);
    const previous = await syncMetaMonth(shiftMonth(month, -1));
    return NextResponse.json({ current, previous });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Meta sync failed." }, { status: 502 }); }
}
export async function POST(req: NextRequest) {
  const denied = await financeAccess(req, true); if (denied) return denied;
  try {
    const body = await req.json();
    const result = await syncMetaMonth(String(body.month || ""));
    return NextResponse.json(result);
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Meta sync failed. Please retry." }, { status: 400 }); }
}
