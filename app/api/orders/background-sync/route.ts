import { NextRequest, NextResponse } from "next/server";
import { bulkSyncOrdersByOrderNumber } from "../../../../lib/delhiverySync";
import { bulkSyncShadowfaxStatuses } from "../../../../lib/shadowfaxSync";
import { completeDeliveredCodOrders } from "../../../../lib/codCompletion";

async function runSync(force: boolean) {
  const [delhivery, shadowfax] = await Promise.all([
    bulkSyncOrdersByOrderNumber({ staleOnly: !force }),
    bulkSyncShadowfaxStatuses({ staleOnly: !force }),
  ]);
  const cod = await completeDeliveredCodOrders();
  const errors = [delhivery.error, shadowfax.error, cod.error].filter(Boolean);
  return {
    ok: errors.length === 0,
    delhivery,
    shadowfax,
    cod,
    error: errors.join("; ") || undefined,
  };
}

// Browser-triggered refresh. The dashboard middleware requires a valid
// admin session cookie before this handler can be reached.
export async function POST(req: NextRequest) {
  let force = false;
  try {
    const body = await req.json();
    force = body?.force === true;
  } catch {
    // Empty POST means the normal freshness-throttled automatic refresh.
  }
  const result = await runSync(force);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}

// Scheduled refresh. Middleware and this handler both verify CRON_SECRET.
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const authorization = req.headers.get("authorization");
  if (!expected || authorization !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runSync(false);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}

