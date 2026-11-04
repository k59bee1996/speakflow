"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AppProvider, useApp } from "./AppContext";
const NAV = [
  { href: "/", label: "Hôm nay", icon: "M3 10l9-7 9 7v11h-6v-7H9v7H3z" },
  { href: "/cards", label: "Thẻ", badge: true, icon: "M7 3h14v14M3 7h14v14H3z" },
  { href: "/notes", label: "Sổ câu bí", icon: "M4 3h16v18H4zM8 7h8M8 11h8M8 15h5" },
  { href: "/history", label: "Lịch sử", icon: "M12 8v5l3 2M21 12a9 9 0 1 1-9-9 9 9 0 0 1 9 9" },
];
function Shell({ children }: { children: ReactNode }) {
  const { dueCount, error, setError } = useApp();
  const pathname = usePathname();
  return <div className="flex min-h-dvh flex-col bg-token-bg font-token-ui text-token-text">
    <header className="flex items-center justify-between gap-space-3 border-b border-solid border-token-border px-screen py-space-4">
      <Link href="/" className="focus-visible:[outline:var(--focus-ring)] focus-visible:[outline-offset:var(--focus-offset)] flex min-h-touch items-center font-token-display text-token-lead font-bold text-token-primary no-underline">Speakflow</Link>
      <Link href="/settings" className="focus-visible:[outline:var(--focus-ring)] focus-visible:[outline-offset:var(--focus-offset)] flex min-h-touch items-center text-token-primary" aria-current={pathname === "/settings" ? "page" : undefined}>Cài đặt</Link>
    </header>
    <main className="mx-auto box-border w-full flex-1 p-screen pb-nav [overflow-wrap:anywhere] sm:w-2/3 lg:w-1/2">
      {error ? <div role="alert" className="mb-space-4 flex items-center justify-between gap-space-3 rounded-token-card border border-solid border-token-danger p-space-3 text-token-danger">
        <span>{error}</span><button type="button" onClick={() => setError(null)} aria-label="Đóng thông báo" className="min-h-touch border-0 bg-transparent px-space-3 text-token-danger">Đóng</button>
      </div> : null}
      {children}
    </main>
    <nav className="sticky bottom-0 flex min-h-nav justify-around gap-space-1 border-t border-solid border-token-border bg-token-surface p-space-2" aria-label="Các màn">
      {NAV.map(n => <Link key={n.href} href={n.href} aria-current={pathname === n.href ? "page" : undefined}
        className="focus-visible:[outline:var(--focus-ring)] focus-visible:[outline-offset:var(--focus-offset)] flex min-h-touch flex-col items-center justify-center gap-space-1 px-space-2 text-token-caption no-underline aria-[current=page]:font-bold aria-[current=page]:text-token-primary">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-(--icon-size) w-(--icon-size) [stroke-width:var(--icon-stroke)]"><path d={n.icon} /></svg>
        <span>{n.label}{n.badge && dueCount > 0 ? ` (${dueCount})` : ""}</span>
      </Link>)}
    </nav>
  </div>;
}
export default function AppShell({ children }: { children: ReactNode }) {
  return <AppProvider><Shell>{children}</Shell></AppProvider>;
}
