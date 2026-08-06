import { NextRequest } from "next/server";
export function requireAdmin(req: NextRequest){
  const configured=process.env.ADMIN_PASSWORD;
  if(!configured) throw new Error("ADMIN_PASSWORD missing");
  const got=req.headers.get("x-admin-password") || req.nextUrl.searchParams.get("admin_password");
  if(got!==configured) throw new Error("Unauthorized");
}

// ------------------------------------------------------------------
// Simple dashboard login gate (username/password from env, one session
// cookie) — separate from requireAdmin above, which is a per-action
// header/query-param check used by a couple of older routes. This is the
// app-wide "are you even allowed to see this dashboard" gate, backing
// /login + middleware.ts.
//
// Deliberately basic: no users table, no roles, no password hashing
// library. This is a placeholder to keep the dashboard off the open
// internet; swap in a real auth system (NextAuth, Clerk, Supabase Auth,
// etc.) later without touching anything outside this file + middleware.ts.
// ------------------------------------------------------------------

export const SESSION_COOKIE = "hoe_admin_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

// Hashes with the Web Crypto API (available in both the Node runtime and
// the Edge runtime middleware runs on) so the raw password never sits in
// the cookie itself — just a value only the server can reproduce.
async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function getExpectedSessionValue(): Promise<string> {
  return sha256Hex(`${ADMIN_USERNAME}:${ADMIN_PASSWORD}`);
}

export function verifyCredentials(username: string, password: string): boolean {
  return username === ADMIN_USERNAME && password === ADMIN_PASSWORD && !!ADMIN_PASSWORD;
}
