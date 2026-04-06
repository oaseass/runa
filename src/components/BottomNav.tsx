"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  {
    label: "홈",
    href: "/home",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M3 8.5L10 3l7 5.5V17a1 1 0 01-1 1H4a1 1 0 01-1-1V8.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" fill="none"/>
        <path d="M7.5 18v-5h5v5" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      </svg>
    ),
    match: (p: string) => p === "/home" || p.startsWith("/home/"),
  },
  {
    label: "친구",
    href: "/connections",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <circle cx="7.5" cy="7" r="3" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M1 17c0-3 3-5 6.5-5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        <circle cx="14" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M11 17c0-2.5 1.8-4 4-4s4 1.5 4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      </svg>
    ),
    match: (p: string) => p.startsWith("/connections"),
  },
  {
    label: "VOID",
    href: "/void",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.3"/>
        <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M10 3v2M10 15v2M3 10h2M15 10h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      </svg>
    ),
    match: (p: string) => p.startsWith("/void"),
  },
  {
    label: "스토어",
    href: "/shop",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M3 3h14l-1.5 8H4.5L3 3z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
        <circle cx="7.5" cy="17" r="1.2" fill="currentColor"/>
        <circle cx="13.5" cy="17" r="1.2" fill="currentColor"/>
        <path d="M4.5 11h11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      </svg>
    ),
    match: (p: string) => p.startsWith("/shop"),
  },
  {
    label: "나",
    href: "/me",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <circle cx="10" cy="7" r="3.2" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M3 18c0-3.5 3.1-6 7-6s7 2.5 7 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      </svg>
    ),
    match: (p: string) => p === "/me" || p.startsWith("/profile"),
  },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="lh-nav" aria-label="하단 내비게이션">
      {TABS.map((tab) => {
        const active = tab.match(pathname);
        return (
          <Link
            key={tab.label}
            href={tab.href}
            className={active ? "lh-nav-item lh-nav-item--active" : "lh-nav-item"}
            aria-current={active ? "page" : undefined}
          >
            <span className="lh-nav-icon">{tab.icon}</span>
            <span className="lh-nav-label">{tab.label}</span>
            {active && <span className="lh-nav-dot" aria-hidden="true" />}
          </Link>
        );
      })}
    </nav>
  );
}
