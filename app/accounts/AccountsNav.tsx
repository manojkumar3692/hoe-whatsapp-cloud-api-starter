import Link from "next/link";
import styles from "./accounts.module.css";
export default function AccountsNav({ active, month }: { active: string; month: string }) {
  return <nav className={styles.accountNav} aria-label="Accounts sections">{[["overview", "Overview", "/accounts"], ["purchases", "Purchases & expenses", "/accounts/purchases"], ["advertising", "Meta advertising", "/accounts/advertising"], ["costing", "Product costing", "/accounts/costing"]].map(([key, label, href]) => <Link key={key} href={`${href}?month=${month}`} aria-current={key === active ? "page" : undefined}>{label}</Link>)}</nav>;
}
