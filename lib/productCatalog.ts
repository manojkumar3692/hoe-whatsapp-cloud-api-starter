// Maps the short productId stored in cart_items/orders.items (e.g.
// "silent-gold") to the actual URL slug on the storefront
// (houseofeon.in/products/<slug>) — they aren't always the same string
// (e.g. "silent-gold" -> "silent-gold-unisex-perfume"), so this can't be
// derived automatically. Confirmed against real product URLs; update this
// whenever a product is added, renamed, or its URL changes.
export const PRODUCT_URL_SLUGS: Record<string, string> = {
  "desert-tonka": "desert-tonka-perfume",
  "arctic-wave": "arctic-wave-perfume",
  zyrox: "zyrox-perfume",
  rank: "rank-perfume",
  syra: "syra-women-perfume",
  "silent-gold": "silent-gold-unisex-perfume",
};

// Returns the real product-page slug for a cart item's productId, or null
// if it's not in the catalog (caller should fall back to the homepage).
export function resolveProductSlug(productId: string | null | undefined): string | null {
  if (!productId) return null;
  return PRODUCT_URL_SLUGS[productId] || null;
}
