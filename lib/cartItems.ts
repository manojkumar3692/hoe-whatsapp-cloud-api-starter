// orders.items and checkout_sessions.cart_items both come back from
// Supabase as a *string* containing JSON (e.g. the app that writes them
// does JSON.stringify(cartItems) before insert), not a native JSON array.
// A plain `Array.isArray(raw)` check is false for that string, so any code
// written assuming a real array silently sees an empty list. Real sample:
//   cart_items: "[{\"name\": \"Silent Gold\", \"price\": 1249,
//                  \"quantity\": 1, \"productId\": \"silent-gold\"}]"
export function parseCartItems(raw: any): any[] {
  if (Array.isArray(raw)) {
    return raw;
  }

  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

export function getFirstCartItem(raw: any): any | null {
  const list = parseCartItems(raw);
  return list[0] || null;
}

// Best-effort product display name from a cart item.
export function cartItemName(item: any): string | null {
  if (!item) return null;
  return item.name || item.product_name || item.title || null;
}

// Best-effort product slug/id for building a product page URL.
export function cartItemSlug(item: any): string | null {
  if (!item) return null;
  return (
    item.productId ||
    item.product_id ||
    item.slug ||
    item.handle ||
    item.id ||
    null
  );
}
