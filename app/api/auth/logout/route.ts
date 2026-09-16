import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, PUSH_DEVICE_COOKIE } from "../../../../lib/auth";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  const endpoint = req.cookies.get(PUSH_DEVICE_COOKIE)?.value;
  let alertsDisabled = true;
  if (endpoint) {
    try {
      const { error } = await supabaseAdmin().from("push_subscriptions").delete().eq("endpoint", endpoint);
      alertsDisabled = !error;
    } catch { alertsDisabled = false; }
  }
  // A push/database outage must never prevent signing out.
  const destination = new URL("/login", req.url);
  if (!alertsDisabled) destination.searchParams.set("alerts", "still-enabled");
  const res = NextResponse.redirect(destination, 303);
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  if (alertsDisabled) res.cookies.set(PUSH_DEVICE_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
