import { NextRequest, NextResponse } from "next/server";
import { financeAccess } from "../../../../../lib/financeRequest";
import { checkMetaBilling } from "../../../../../lib/metaBilling";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(req: NextRequest) {
  const denied = await financeAccess(req, true); if (denied) return denied;
  try {
    const body = await req.json();
    return NextResponse.json(await checkMetaBilling(String(body.month || "")), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    // Never forward Graph payloads or network exception details to the browser.
    const message = error instanceof Error ? error.message : "";
    const safe = /^(Set META_|Invalid Meta|Choose a valid|Future months|Billing checks|Meta )/.test(message);
    return NextResponse.json({ error: safe ? message : "Billing API check failed. Retry later." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
