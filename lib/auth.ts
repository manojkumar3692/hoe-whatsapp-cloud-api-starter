import { NextRequest } from "next/server";
export function requireAdmin(req: NextRequest){
  const configured=process.env.ADMIN_PASSWORD;
  if(!configured) throw new Error("ADMIN_PASSWORD missing");
  const got=req.headers.get("x-admin-password") || req.nextUrl.searchParams.get("admin_password");
  if(got!==configured) throw new Error("Unauthorized");
}
