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

// Per-product header images for the image-header abandoned-cart template.
// Anything not listed here falls back to ABANDONED_CART_FALLBACK_IMAGE_URL
// if set, otherwise no image header is sent at all (plain — no generic
// banner substitute, by design).
export const PRODUCT_IMAGE_URLS: Record<string, string> = {
  zyrox: "https://fvctxehmnzprbqhrxukc.supabase.co/storage/v1/object/public/campaign-image/zyrox-lifestyle-1.png",
  "silent-gold": "https://fvctxehmnzprbqhrxukc.supabase.co/storage/v1/object/public/campaign-image/sgold-lifestyle-3.png",
  "arctic-wave": "https://fvctxehmnzprbqhrxukc.supabase.co/storage/v1/object/public/campaign-image/ARCTIC_WAVES_PROM_2.png",
  syra: "https://fvctxehmnzprbqhrxukc.supabase.co/storage/v1/object/public/campaign-image/ChatGPT%20Image%20Jul%2029,%202026,%2006_16_29%20PM.png",
  "desert-tonka": "https://fvctxehmnzprbqhrxukc.supabase.co/storage/v1/object/public/campaign-image/ChatGPT%20Image%20Jul%202,%202026,%2001_21_42%20AM.png",
  rank: "https://fvctxehmnzprbqhrxukc.supabase.co/storage/v1/object/public/campaign-image/ChatGPT%20Image%20Jun%202,%202026,%2005_41_26%20PM.png",
};

// Returns a header image URL for a cart item: its specific product image
// if known, otherwise the generic fallback banner (if configured),
// otherwise null — caller should skip the image header component
// entirely rather than send a broken/missing URL.
export function resolveProductImageUrl(productId: string | null | undefined): string | null {
  if (productId && PRODUCT_IMAGE_URLS[productId]) {
    return PRODUCT_IMAGE_URLS[productId];
  }
  return process.env.ABANDONED_CART_FALLBACK_IMAGE_URL || null;
}
