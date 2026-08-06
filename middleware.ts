import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, getExpectedSessionValue } from "./lib/auth";

// Gates the whole dashboard behind the simple login in /login. Excludes
// (via the matcher below) the handful of routes that must stay reachable
// without a browser session:
//   - /login itself + /api/auth/* (or nobody could ever log in)
//   - /api/webhook/* — Meta calls this directly, no cookies
//   - /api/checkout-sessions/send-abandoned-cart-reminders — hit by
//     Vercel Cron (or a manual curl with CRON_SECRET), no cookies; it has
//     its own bearer-token check inside the route already
export async function middleware(req: NextRequest) {
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  const expected = await getExpectedSessionValue();

  if (cookie && cookie === expected) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", req.url);
  const next = req.nextUrl.pathname + req.nextUrl.search;
  if (next !== "/") loginUrl.searchParams.set("next", next);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!login|api/auth|api/webhook|api/checkout-sessions/send-abandoned-cart-reminders|_next/static|_next/image|favicon.ico).*)",
  ],
};
