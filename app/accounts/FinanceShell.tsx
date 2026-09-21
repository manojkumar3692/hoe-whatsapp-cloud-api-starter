import { ReactNode } from "react";
import Header from "../components/Header";
import AccountsNav from "./AccountsNav";
import { dateKey, validMonth } from "../../lib/accounting";
import styles from "./accounts.module.css";
export function selectedMonth(value?: string) { return value && validMonth(value) && value.startsWith("20") ? value : dateKey(new Date()).slice(0, 7); }
export function SetupMessage({ message }: { message: string }) { return <section className={styles.panel} role="status"><h2>Finance setup pending</h2><p>{message}</p><p className={styles.footnote}>Existing sales reports and invoice downloads remain available. New purchases and costs can be saved once setup is complete.</p></section>; }
export default function FinanceShell({ active, month, title, description, children }: { active: string; month: string; title: string; description: string; children: ReactNode }) {
  return <main className={styles.page}><Header active="accounts" /><div className={styles.heading}><div><p className={styles.eyebrow}>HOUSE OF EON / FINANCE</p><h1>{title}</h1><p>{description}</p></div></div><AccountsNav active={active} month={month} /><section className={styles.toolbar}><form><label htmlFor="finance-month">Reporting month</label><input id="finance-month" name="month" type="month" min="2000-01" max="2099-12" defaultValue={month} required /><button type="submit">View month</button></form></section><div className={styles.financeContent}>{children}</div></main>;
}
