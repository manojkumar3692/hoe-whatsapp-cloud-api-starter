import { cartItemName, cartItemSlug, parseCartItems } from "./cartItems";

const FRAGRANCES = [
  ["desert-tonka", "Desert Tonka"],
  ["arctic-wave", "Arctic Wave"],
  ["zyrox", "Zyrox"],
  ["rank", "RANK"],
  ["syra", "Syra"],
  ["silent-gold", "Silent Gold"],
] as const;

export function isTrialPack(items: unknown) {
  return parseCartItems(items).some((item) => {
    const text = `${cartItemSlug(item) || ""} ${cartItemName(item) || ""} ${item?.size || ""}`.toLowerCase();
    return text.includes("trial-pack") || text.includes("trial pack") || text.includes("3x8ml") || text.includes("3×8ml");
  });
}

export function orderItemNames(items: unknown) {
  return parseCartItems(items)
    .map((item) => cartItemName(item) || "Item")
    .filter(Boolean);
}

export function trialPackFragrances(items: unknown) {
  const text = parseCartItems(items)
    .map((item) => `${cartItemSlug(item) || ""} ${cartItemName(item) || ""}`)
    .join(" ")
    .toLowerCase();

  return FRAGRANCES.filter(([key, name]) =>
    text.includes(key) || text.includes(name.toLowerCase())
  ).map(([, name]) => name);
}

export function formatFollowupStatus(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function followupBadgeColors(value: string): [string, string] {
  if (["issue"].includes(value)) return ["#fee2e2", "#991b1b"];
  if (["interested"].includes(value)) return ["#dcfce7", "#166534"];
  if (["due", "call_later"].includes(value)) return ["#fef3c7", "#854d0e"];
  if (["awaiting_reply", "in_progress"].includes(value)) return ["#dbeafe", "#1d4ed8"];
  return ["#f3f4f6", "#374151"];
}

