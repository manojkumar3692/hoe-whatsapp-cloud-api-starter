"use client";
import { useState } from "react";

export default function DownloadButton({ month, format = "zip", label }: { month: string; format?: "zip" | "csv"; label?: string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function download() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/accounts/export?month=${month}&format=${format}`);
      if (response.redirected) throw new Error("Your session expired. Sign in again to download.");
      if (!response.ok) { const body = await response.json(); throw new Error(body.error || "Download failed."); }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a"); link.href = url; link.download = `accounts-${month}.${format}`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setError(error instanceof Error ? error.message : "Download failed. Try again."); }
    finally { setBusy(false); }
  }
  return <span><button type="button" onClick={download} disabled={busy} aria-label={`${label || "Download " + format.toUpperCase()} for ${month}`}>{busy ? "Preparing…" : label || "Download " + format.toUpperCase()}</button>{error && <span role="alert" style={{ display: "block", color: "#a22c25", fontSize: 12, marginTop: 8, maxWidth: 320 }}>{error}</span>}</span>;
}
