import { NextRequest, NextResponse } from "next/server";
import { financeAccess } from "../../../lib/financeRequest";
import { loadGenie } from "../../../lib/genieData";
import { askGenie } from "../../../lib/genieAi";
export const runtime = "nodejs";
export const maxDuration = 60;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
export async function POST(req: NextRequest) {
  const denied = await financeAccess(req, true);
  if (denied) return denied;
  if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_GENIE_MODEL) return json({ error: "AI chat is not connected yet. The business dashboard is available; configure the server AI connection to ask questions." }, 503);
  let body;
  try {
    const raw = await req.text();
    if (raw.length > 16000) return json({ error: "Please shorten the conversation." }, 400);
    body = JSON.parse(raw);
  } catch { return json({ error: "Enter a valid question." }, 400); }
  if (!body || typeof body.question !== "string" || !body.question.trim() || body.question.length > 1000 || !Array.isArray(body.history) || body.history.length > 6 || body.history.some((m: any) => !m || !["user", "assistant"].includes(m.role) || typeof m.content !== "string" || m.content.length > 2000)) return json({ error: "Use a question under 1,000 characters and a short conversation." }, 400);
  try {
    const snapshot = await loadGenie();
    const answer = await askGenie(snapshot, body.question.trim(), body.history.map((m: any) => ({ role: m.role, content: m.content })));
    return json({ answer, generatedAt: snapshot.generatedAt });
  } catch { return json({ error: "Genie could not answer right now. Please retry; the dashboard remains available." }, 503); }
}
