export function normalizePhone(raw:string){
  let s=(raw||"").trim().replace(/[^0-9+]/g,"");
  if(s.startsWith("+")) s=s.slice(1);
  if(s.length===10 && /^[6-9]/.test(s)) s="91"+s; // India default for old customers
  return s;
}
