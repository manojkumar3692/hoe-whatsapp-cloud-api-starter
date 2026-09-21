import { NextRequest, NextResponse } from "next/server";
import { getExpectedSessionValue, SESSION_COOKIE } from "./auth";

// Explicit session checks supplement middleware for all finance mutations.
export async function financeAccess(req: NextRequest, write = false) {
  if (!process.env.ADMIN_PASSWORD || req.cookies.get(SESSION_COOKIE)?.value !== await getExpectedSessionValue()) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  if (write) {
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
    let matches = false;
    try { matches = !!origin && !!host && new URL(origin).host === host; } catch { /* Invalid origin is denied. */ }
    if (!matches) return NextResponse.json({ error: "Request origin did not match this app." }, { status: 403 });
  }
  return null;
}
export function financeError(error: any) {
  if (["42P01", "PGRST205", "PGRST202"].includes(error?.code)) return NextResponse.json({ error: "Finance setup is required before saving. Apply migration 013_finance.sql." }, { status: 503 });
  if (error?.code === "23505") return NextResponse.json({ error: "This supplier invoice or cost effective date already exists. Open the existing entry instead." }, { status: 409 });
  // PostgreSQL user-defined validation errors are written by our RPCs.
  if (error?.code === "P0001") return NextResponse.json({ error: error.message }, { status: 409 });
  return NextResponse.json({ error: "Could not save the finance record. Please retry." }, { status: 500 });
}
export function validId(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
