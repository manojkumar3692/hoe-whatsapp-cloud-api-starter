"use client";
import { FormEvent, useState } from "react";
import styles from "./genie.module.css";
type Message = { role: "user" | "assistant"; content: string };
const suggestions = ["What is actually happening with our sales?", "Which product should we focus on?", "How is this month compared with last month?", "What should I do to improve sales this week?"];
export default function GenieChat({ enabled }: { enabled: boolean }) {
  const [messages, setMessages] = useState<Message[]>([]), [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!question.trim() || busy) return;
    const asked = question.trim(); setBusy(true); setError("");
    try {
      const res = await fetch("/api/genie", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(60_000), body: JSON.stringify({ question: asked, history: messages.slice(-6).map(m => ({ ...m, content: m.content.slice(0, 2000) })) }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not get an answer.");
      setMessages(prev => [...prev, { role: "user", content: asked }, { role: "assistant", content: data.answer }]); setQuestion("");
    } catch (e) { setError(e instanceof Error && e.name !== "TimeoutError" ? e.message : "The request timed out. Please retry."); }
    finally { setBusy(false); }
  }
  return <section className={styles.panel}>
    <div className={styles.sectionHead}><div><span className={styles.eyebrow}>Your business, explained</span><h2>Ask Genie</h2></div><span className={styles.badge}>{enabled ? "AI connected" : "AI not connected"}</span></div>
    <p>Ask about growth, product demand or what to investigate next. Answers use a fresh business snapshot.</p>
    {!enabled && <p className={styles.notice}>Your insights below are ready. Free-text AI chat needs a server connection before it can answer.</p>}
    <div className={styles.prompts}>{suggestions.map(s => <button type="button" key={s} onClick={() => setQuestion(s)} disabled={!enabled || busy}>{s}</button>)}</div>
    <div className={styles.conversation} role="log" aria-live="polite">{messages.map((m,i) => <div key={i} className={m.role === "user" ? styles.user : styles.answer}><strong>{m.role === "user" ? "You" : "Genie"}</strong><p>{m.content}</p></div>)}</div>
    <form onSubmit={submit} className={styles.chatForm}>
      <label htmlFor="genie-question">Your question</label>
      <textarea id="genie-question" value={question} onChange={e => setQuestion(e.target.value)} maxLength={1000} disabled={!enabled || busy} placeholder="Which perfume deserves more attention, and why?" rows={3} required />
      <div className={styles.sectionHead}><small>Aggregate figures only. Avoid entering customer details. AI suggestions can be wrong; check the evidence.</small><button disabled={!enabled || busy || !question.trim()} type="submit">{busy ? "Reading the numbers…" : "Ask Genie →"}</button></div>
    </form>
    {error && <p role="alert" className={styles.notice}>{error}</p>}
  </section>;
}
