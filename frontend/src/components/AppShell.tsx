"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AppProvider, useApp } from "./AppContext";
import { PHASES, clampWeek, phaseIndex } from "@/lib/content";

const NAV = [
  { href: "/", label: "Hôm nay" },
  { href: "/cards", label: "Ôn thẻ", badge: true },
  { href: "/notes", label: "Sổ câu bí" },
  { href: "/settings", label: "Cài đặt" },
];

function Shell({ children }: { children: ReactNode }) {
  const { week, streak, dueCount, error, setError } = useApp();
  const pathname = usePathname();
  const color = PHASES[phaseIndex(clampWeek(week))].color;

  return (
    <div style={{ ["--c" as string]: `var(--${color})` }}>
      <header className="top">
        <div className="wrap">
          <div className="brand">
            <b>Speakflow</b>
            <span>{streak ? `Chuỗi ${streak} ngày` : ""}</span>
          </div>
          <nav className="tabs" aria-label="Các màn">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} aria-current={pathname === n.href ? "page" : undefined}>
                {n.label}
                {n.badge && dueCount > 0 ? <span className="badge">{dueCount}</span> : null}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="wrap">
        {error ? (
          <div className="banner" role="alert">
            <span>{error}</span>
            <button type="button" className="x" onClick={() => setError(null)}>
              Đóng
            </button>
          </div>
        ) : null}
        {children}
      </main>
    </div>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <AppProvider>
      <Shell>{children}</Shell>
    </AppProvider>
  );
}
