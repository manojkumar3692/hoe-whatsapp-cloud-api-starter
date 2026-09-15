// Shiprocket External API client (authentication + shipment tracking).
// Official docs: https://apidocs.shiprocket.in/

const BASE_URL = process.env.SHIPROCKET_BASE_URL || "https://apiv2.shiprocket.in/v1/external";
const TOKEN_REUSE_MS = 9 * 24 * 60 * 60 * 1000; // Shiprocket tokens are valid for 10 days.

export function isShiprocketEnabled(): boolean {
  return process.env.SHIPROCKET_ENABLED === "true";
}

let cachedToken: { value: string; obtainedAt: number } | null = null;
let tokenRequest: Promise<string> | null = null;

export type ShiprocketTrackingActivity = {
  date?: string;
  status?: string;
  activity?: string;
  location?: string;
  "sr-status"?: string;
  "sr-status-label"?: string;
};

export type ShiprocketShipmentTrack = {
  awb_code?: string;
  current_status?: string;
  courier_name?: string;
  destination?: string;
  delivered_to?: string;
};

export type ShiprocketTrackingData = {
  track_status?: number;
  shipment_status?: number;
  shipment_track?: ShiprocketShipmentTrack[];
  shipment_track_activities?: ShiprocketTrackingActivity[];
  track_url?: string;
  error?: string;
};

export type ShiprocketTrackingResult = {
  tracking_data?: ShiprocketTrackingData;
};

async function requestToken(force = false): Promise<string> {
  if (!force && cachedToken && Date.now() - cachedToken.obtainedAt < TOKEN_REUSE_MS) {
    return cachedToken.value;
  }
  if (!force && tokenRequest) return tokenRequest;

  const email = process.env.SHIPROCKET_API_EMAIL;
  const password = process.env.SHIPROCKET_API_PASSWORD;
  if (!email || !password) {
    throw new Error("Missing SHIPROCKET_API_EMAIL or SHIPROCKET_API_PASSWORD env var");
  }

  tokenRequest = (async () => {
    const response = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    });
    const body = await readJson(response, "authentication");
    if (!response.ok || !body?.token) {
      throw new Error(apiError(body, `Shiprocket authentication failed (${response.status})`));
    }
    cachedToken = { value: body.token, obtainedAt: Date.now() };
    return body.token as string;
  })();

  try {
    return await tokenRequest;
  } finally {
    tokenRequest = null;
  }
}

async function readJson(response: Response, operation: string): Promise<any> {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Shiprocket ${operation} returned non-JSON (status ${response.status}): ${text.slice(0, 300)}`);
  }
}

function apiError(body: any, fallback: string): string {
  if (typeof body?.message === "string") return body.message;
  if (typeof body?.error === "string") return body.error;
  if (body?.errors && typeof body.errors === "object") {
    return Object.values(body.errors).flat().join("; ") || fallback;
  }
  return fallback;
}

async function trackRequest(awbs: string[], forceToken = false): Promise<Response> {
  const token = await requestToken(forceToken);
  return fetch(`${BASE_URL}/courier/track/awbs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ awbs }),
    cache: "no-store",
  });
}

async function trackOrderRequest(orderId: string, forceToken = false): Promise<Response> {
  const token = await requestToken(forceToken);
  const query = new URLSearchParams({ order_id: orderId });
  const channelId = process.env.SHIPROCKET_CHANNEL_ID?.trim();
  if (channelId) query.set("channel_id", channelId);
  return fetch(`${BASE_URL}/courier/track?${query.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
}

// Shiprocket accepts a maximum of 50 AWBs per request. The caller batches
// larger workloads so this method deliberately rejects an oversized input.
export async function trackShiprocketWaybills(
  awbNumbers: string[]
): Promise<Record<string, ShiprocketTrackingResult>> {
  const clean = [...new Set(awbNumbers.map((awb) => awb.trim()).filter(Boolean))];
  if (clean.length === 0) return {};
  if (clean.length > 50) throw new Error("Shiprocket tracking supports at most 50 AWBs per call");

  let response = await trackRequest(clean);
  if (response.status === 401) {
    cachedToken = null;
    response = await trackRequest(clean, true);
  }
  const body = await readJson(response, "tracking");
  if (!response.ok) {
    throw new Error(apiError(body, `Shiprocket tracking failed (${response.status})`));
  }
  return body || {};
}

// Looks up a shipment using the merchant/store order ID supplied when the
// order was created or imported into Shiprocket. Shiprocket returns an array
// because the same ID can exist in more than one channel.
export async function trackShiprocketOrder(orderId: string): Promise<ShiprocketTrackingResult | null> {
  const clean = orderId.trim();
  if (!clean) return null;

  let response = await trackOrderRequest(clean);
  if (response.status === 401) {
    cachedToken = null;
    response = await trackOrderRequest(clean, true);
  }
  const body = await readJson(response, "order tracking");
  if (!response.ok) {
    throw new Error(apiError(body, `Shiprocket order tracking failed (${response.status})`));
  }
  const results: ShiprocketTrackingResult[] = Array.isArray(body) ? body : [];
  return results.find((result) => result?.tracking_data?.track_status !== 0) || results[0] || null;
}

function normalizeStatus(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

export function mapShiprocketStatus(rawStatus: string): string | null {
  const status = normalizeStatus(rawStatus || "");
  if (!status) return null;

  if (/\brto delivered\b|\breturned to (seller|origin)\b/.test(status)) return "returned";
  if (/\brto initiated\b|\breturn initiated\b|\breturn in transit\b|\brto in transit\b/.test(status)) return "return_requested";
  if (/\bdelivered\b/.test(status)) return "delivered";
  if (/\bout for delivery\b/.test(status)) return "out_for_delivery";
  if (/\bcancel(l)?ed\b|\blost\b/.test(status)) return "cancelled";
  if (/\bshipped\b|\bin transit\b|\bpicked up\b|\breached at destination\b/.test(status)) return "shipped";
  if (/\bready to ship\b|\bmanifest(ed)?\b|\bawb assigned\b|\bpickup (scheduled|generated|queued|rescheduled)\b/.test(status)) return "packed";
  if (/\bnew\b|\bconfirmed\b|\bpending\b/.test(status)) return "confirmed";
  return null;
}
