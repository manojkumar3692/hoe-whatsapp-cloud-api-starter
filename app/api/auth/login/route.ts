import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, getExpectedSessionValue, verifyCredentials } from "../../../../lib/auth";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const username = String(form.get("username") || "");
  const password = String(form.get("password") || "");
  const next = String(form.get("next") || "/");

  if (!verifyCredentials(username, password)) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("error", "1");
    if (next && next !== "/") loginUrl.searchParams.set("next", next);
    return NextResponse.redirect(loginUrl, 303);
  }

  const sessionValue = await getExpectedSessionValue();
  const res = NextResponse.redirect(new URL(next || "/", req.url), 303);
  res.cookies.set(SESSION_COOKIE, sessionValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return res;
}
