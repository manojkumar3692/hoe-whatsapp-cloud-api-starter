import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { pushConfigured } from "../../../../lib/push";
import { validSubscription, isAllowedPushEndpoint } from "../../../../lib/pushValidation";
import { PUSH_DEVICE_COOKIE, SESSION_MAX_AGE_SECONDS } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

// Dashboard middleware protects all methods. No endpoints/keys are exposed by GET.
export async function GET() {
  return NextResponse.json({ configured: pushConfigured(), publicKey: pushConfigured() ? process.env.WEB_PUSH_PUBLIC_KEY : null }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== req.nextUrl.origin) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  if (!pushConfigured()) return NextResponse.json({ error: "Order alerts need server setup before they can be enabled." }, { status: 503 });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid subscription" }, { status: 400 }); }
  if (!validSubscription(body)) return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  const { error } = await supabaseAdmin().from("push_subscriptions").upsert({
    endpoint: body.endpoint, keys: body.keys,
    expires_at: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString(),
  }, { onConflict: "endpoint" });
  if (error) return NextResponse.json({ error: "Could not save alerts. Please check the server setup and try again." }, { status: 503 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(PUSH_DEVICE_COOKIE, body.endpoint, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}

export async function DELETE(req: NextRequest) {
  if (req.headers.get("origin") !== req.nextUrl.origin) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid subscription" }, { status: 400 }); }
  if (!isAllowedPushEndpoint(body?.endpoint)) return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  const { error } = await supabaseAdmin().from("push_subscriptions").delete().eq("endpoint", body.endpoint);
  if (error) return NextResponse.json({ error: "Could not disable alerts. Please try again." }, { status: 503 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(PUSH_DEVICE_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
