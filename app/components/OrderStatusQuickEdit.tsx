"use client";

import { useRef, useState } from "react";

const STATUS_OPTIONS = [
  "pending",
  "confirmed",
  "packed",
  "shipped",
  "out_for_delivery",
  "delivered",
  "completed",
  "cancelled",
  "return_requested",
  "returned",
  "refunded",
  "rejected",
];

// Quick-edit dropdown for the orders list — picks a new status and submits
// immediately. The app login already protects this action, so operations
// staff do not have to enter the admin password again. Re-submits the
// order's existing payment_status / tracking_url /
// notes unchanged (the update route overwrites those fields with whatever
// it receives, so they have to be included here or they'd get wiped).
export default function OrderStatusQuickEdit({
  orderId,
  paymentStatus,
  currentStatus,
  trackingUrl,
  notes,
  returnTo,
}: {
  orderId: string;
  paymentStatus: string;
  currentStatus: string;
  trackingUrl: string | null;
  notes: string | null;
  returnTo: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [saving, setSaving] = useState(false);

  return (
    <form
      ref={formRef}
      action="/api/orders/update"
      method="POST"
      style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 145 }}
      onSubmit={() => setSaving(true)}
    >
      <input type="hidden" name="id" value={orderId} />
      <input type="hidden" name="payment_status" value={paymentStatus} />
      <input type="hidden" name="tracking_url" value={trackingUrl || ""} />
      <input type="hidden" name="notes" value={notes || ""} />
      <input type="hidden" name="return_to" value={returnTo} />

      <select
        name="shipping_status"
        defaultValue={currentStatus}
        disabled={saving}
        onChange={() => formRef.current?.requestSubmit()}
        style={{
          padding: "6px 8px",
          borderRadius: 8,
          border: "1px solid #d9cdbb",
          fontSize: 13,
          fontWeight: 700,
          color: "#1c1712",
          background: saving ? "#f3f4f6" : "#fffdf9",
        }}
      >
        {STATUS_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {s.replaceAll("_", " ")}
          </option>
        ))}
      </select>

      <span style={{ color: "#958879", fontSize: 10 }}>{saving ? "Saving…" : "Change status"}</span>
    </form>
  );
}
