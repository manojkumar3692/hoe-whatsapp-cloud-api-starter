import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
export async function GET(req:NextRequest){const sp=req.nextUrl.searchParams;const mode=sp.get("hub.mode");const token=sp.get("hub.verify_token");const challenge=sp.get("hub.challenge");if(mode==="subscribe"&&token===process.env.META_VERIFY_TOKEN) return new NextResponse(challenge||"",{status:200});return new NextResponse("Forbidden",{status:403});}
export async function POST(req:NextRequest){const body=await req.json();const supabase=supabaseAdmin();const changes=body.entry?.flatMap((e:any)=>e.changes||[])||[];for(const ch of changes){const value=ch.value||{};for(const m of value.messages||[]){await supabase.from("message_logs").insert({phone:m.from,direction:"inbound",whatsapp_message_id:m.id,status:"received",body:m.text?.body||m.button?.text||m.type,raw:m});}
for(const s of value.statuses||[]){await supabase.from("message_logs").insert({phone:s.recipient_id,direction:"status",whatsapp_message_id:s.id,status:s.status,raw:s});}}
return NextResponse.json({ok:true});}
