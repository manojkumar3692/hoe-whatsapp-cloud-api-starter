import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { dispatchOrderPush, pushConfigured } from "../../../../lib/push";

export const runtime = "nodejs";
export const maxDuration = 60;

async function dispatch(req: NextRequest) {
  const secret = req.method === "POST" ? process.env.PUSH_WEBHOOK_SECRET : process.env.CRON_SECRET;
  const expected = Buffer.from(`Bearer ${secret || ""}`);
  const actual = Buffer.from(req.headers.get("authorization") || "");
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!pushConfigured()) return NextResponse.json({ error: "Push is not configured" }, { status: 503 });
  try {
    const result = await dispatchOrderPush();
    return NextResponse.json({ ok: result.retried === 0, ...result }, { status: result.retried ? 502 : 200 });
  } catch {
    return NextResponse.json({ error: "Push dispatch failed; queued events can be retried." }, { status: 503 });
  }
}

export const POST = dispatch;
export const GET = dispatch;
