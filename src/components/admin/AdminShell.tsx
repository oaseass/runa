"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";

/* ── Constants ─────────────────────────────────────────── */
const BREAK_DESKTOP  = 1200;
const LS_KEY         = "luna_admin_sidebar_collapsed";

/* ── Nav items ─────────────────────────────────────────── */
const NAV_ITEMS = [
  { href: "/admin",               label: "\ub300\uc2dc\ubcf4\ub4dc",  icon: "dashboard"     },
  { href: "/admin/analytics",     label: "\ubd84\uc11d",              icon: "chart"         },
  { href: "/admin/users",         label: "\ud68c\uc6d0 \uad00\ub9ac", icon: "users"         },
  { href: "/admin/orders",        label: "\uc8fc\ubb38",              icon: "orders"        },
  { href: "/admin/subscriptions", label: "\uad6c\ub3c5",              icon: "subscriptions" },
  { href: "/admin/void",          label: "Void \ubd84\uc11d",         icon: "void"          },
  { href: "/admin/system",        label: "\uc2dc\uc2a4\ud15c",        icon: "system"        },
];

/* ── SVG icon set ──────────────────────────────────────── */
function NavIcon({ name }: { name: string }) {
  const shapes: Record<string, React.ReactNode> = {
    chart: (
      <>
        <polyline points="3,14 7,8 11,11 15,4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <path d="M3 17h14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      </>
    ),
    dashboard: (
      <>
        <rect x="2"  y="2"  width="7" height="7" rx="1.5" fill="currentColor" fillOpacity="0.9"/>
        <rect x="11" y="2"  width="7" height="7" rx="1.5" fill="currentColor" fillOpacity="0.45"/>
        <rect x="2"  y="11" width="7" height="7" rx="1.5" fill="currentColor" fillOpacity="0.45"/>
        <rect x="11" y="11" width="7" height="7" rx="1.5" fill="currentColor" fillOpacity="0.9"/>
      </>
    ),
    users: (
      <>
        <circle cx="10" cy="6" r="3" fill="currentColor"/>
        <path d="M3 19c0-3.87 3.13-7 7-7s7 3.13 7 7"
          stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" fill="none"/>
      </>
    ),
    orders: (
      <>
        <rect x="3" y="2" width="14" height="17" rx="2"
          stroke="currentColor" strokeWidth="1.6" fill="none"/>
        <path d="M7 8h6M7 12h4"
          stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      </>
    ),
    subscriptions: (
      <>
        <path d="M10 2.5l2.1 4.3 4.7.68-3.4 3.32.8 4.7L10 13.1l-4.2 2.4.8-4.7-3.4-3.32 4.7-.68L10 2.5z"
          stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="none"/>
      </>
    ),
    void: (
      <>
        <circle cx="10" cy="10" r="7"
          stroke="currentColor" strokeWidth="1.6" fill="none"/>
        <circle cx="10" cy="10" r="2.8" fill="currentColor"/>
        <circle cx="10" cy="10" r="1.1" fill="#111827"/>
      </>
    ),
    system: (
      <>
        <circle cx="10" cy="10" r="2.8"
          stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </>
    ),
  };
  return (
    <svg
      width="20" height="20" viewBox="0 0 20 20"
      fill="none" aria-hidden="true" focusable="false"
    >
      {shapes[name] ?? null}
    </svg>
  );
}

/* ── Hamburger icon ─────────────────────────────────────── */
function HamburgerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M3 5h14M3 10h14M3 15h14"
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  );
}

/* ── Close icon ─────────────────────────────────────────── */
function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 3l10 10M13 3L3 13"
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  );
}

/* ── Chevron icon ───────────────────────────────────────── */
function ChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <path
        d={collapsed ? "M5.5 2.5l5 5-5 5" : "M9.5 2.5l-5 5 5 5"}
        stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

/* ── Logout button ──────────────────────────────────────── */
function LogoutButton() {
  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.assign("/admin/login");
  }
  return (
    <button
      onClick={handleLogout}
      aria-label="\ub85c\uadf8\uc544\uc6c3"
      title="\ub85c\uadf8\uc544\uc6c3"
      style={{
        background: "transparent",
        border: "none",
        color: "#6b7280",
        fontSize: "0.75rem",
        cursor: "pointer",
        padding: 0,
        display: "flex",
        alignItems: "center",
        gap: "0.2rem",
      }}
    >
      {"\ub85c\uadf8\uc544\uc6c3"}
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
        <path d="M9 6.5H3M7 4.5l2 2-2 2"
          stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M11 1v11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      </svg>
    </button>
  );
}

/* ── Main Shell ─────────────────────────────────────────── */
export default function AdminShell({ children }: { children: React.ReactNode }) {
  const [collapsed,  setCollapsed]  = useState(false);
  const [drawerPath, setDrawerPath] = useState<string | null>(null);
  const [isDesktop,  setIsDesktop]  = useState(true);
  const pathname    = usePathname();
  const firstNavRef = useRef<HTMLAnchorElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const drawerOpen = drawerPath === pathname;

  /* ── Init: localStorage + MediaQuery ── */
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${BREAK_DESKTOP}px)`);

    queueMicrotask(() => {
      if (localStorage.getItem(LS_KEY) === "true") {
        setCollapsed(true);
      }
      setIsDesktop(mq.matches);
    });

    const onChange = () => {
      setIsDesktop(mq.matches);
      if (mq.matches) setDrawerPath(null);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  /* ── Reset drawer on bfcache restore (browser back) ── */
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) setDrawerPath(null);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  /* ── Focus first nav item on drawer open ── */
  useEffect(() => {
    if (drawerOpen && firstNavRef.current) {
      firstNavRef.current.focus();
    }
  }, [drawerOpen]);

  /* ── ESC closes drawer ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && drawerOpen) {
        setDrawerPath(null);
        hamburgerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  /* ── Persist collapse ── */
  const toggleCollapse = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(LS_KEY, String(next));
      return next;
    });
  }, []);

  const openDrawer  = useCallback(() => setDrawerPath(pathname), [pathname]);
  const closeDrawer = useCallback(() => setDrawerPath(null), []);

  /* ── Derived class names ── */
  const isCollapsedDesktop = isDesktop && collapsed;

  const sidebarClass =
    "ac-sidebar" +
    (isCollapsedDesktop          ? " ac-sidebar--collapsed"    : "") +
    (!isDesktop && drawerOpen    ? " ac-sidebar--drawer-open"  : "");

  const backdropClass =
    "ac-backdrop" + (!isDesktop && drawerOpen ? " ac-backdrop--visible" : "");

  const bodyClass =
    "ac-body" + (isCollapsedDesktop ? " ac-body--collapsed" : "");

  return (
    <>
      {/* ── Backdrop (mobile) ─────────────────────────── */}
      <div
        aria-hidden="true"
        className={backdropClass}
        onClick={closeDrawer}
      />

      {/* ── Sidebar ──────────────────────────────────── */}
      <aside
        id="admin-sidebar"
        className={sidebarClass}
        aria-label="\uad00\ub9ac\uc790 \uba54\ub274"
      >
        {/* Header */}
        <div
          style={{
            height: "56px",
            display: "flex",
            alignItems: "center",
            padding: "0 1rem",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            gap: "0.5rem",
            flexShrink: 0,
          }}
        >
          {/* Logo */}
          <Link
            href="/admin"
            aria-label="LUNA \uad00\ub9ac\uc790 \ub300\uc2dc\ubcf4\ub4dc"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.45rem",
              textDecoration: "none",
              flex: 1,
              overflow: "hidden",
              minWidth: 0,
            }}
          >
            <span style={{ fontSize: "1.15rem", flexShrink: 0 }}>{"\u263d"}</span>
            {!isCollapsedDesktop && (
              <span
                style={{
                  fontSize: "0.9rem",
                  fontWeight: 700,
                  color: "#f9fafb",
                  letterSpacing: "-0.02em",
                  whiteSpace: "nowrap",
                  display: "flex",
                  alignItems: "baseline",
                  gap: "0.4rem",
                }}
              >
                LUNA
                <span style={{ fontSize: "0.52rem", color: "#4b5563", fontWeight: 400, letterSpacing: "0.12em" }}>
                  ADMIN
                </span>
              </span>
            )}
          </Link>

          {/* Desktop: collapse toggle */}
          {isDesktop && (
            <button
              onClick={toggleCollapse}
              aria-label={collapsed ? "\uba54\ub274 \ud3bc\uce58\uae30" : "\uba54\ub274 \uc811\uae30"}
              title={collapsed ? "\uba54\ub274 \ud3bc\uce58\uae30" : "\uba54\ub274 \uc811\uae30"}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "28px",
                height: "28px",
                flexShrink: 0,
                background: "rgba(255,255,255,0.06)",
                border: "none",
                borderRadius: "0.3rem",
                cursor: "pointer",
                color: "#9ca3af",
              }}
            >
              <ChevronIcon collapsed={collapsed} />
            </button>
          )}

          {/* Mobile: close drawer */}
          {!isDesktop && (
            <button
              onClick={closeDrawer}
              aria-label="\uba54\ub274 \ub2eb\uae30"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "28px",
                height: "28px",
                flexShrink: 0,
                background: "rgba(255,255,255,0.06)",
                border: "none",
                borderRadius: "0.3rem",
                cursor: "pointer",
                color: "#9ca3af",
              }}
            >
              <CloseIcon />
            </button>
          )}
        </div>

        {/* Nav */}
        <nav
          aria-label="\uad00\ub9ac\uc790 \ub0b4\ube44\uac8c\uc774\uc158"
          style={{ flex: 1, padding: "0.5rem 0 0.5rem", overflowY: "auto" }}
        >
          {NAV_ITEMS.map((item, idx) => {
            const isActive =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(item.href);

            return (
              <div key={item.href} className="ac-nav-item">
                <Link
                  ref={idx === 0 ? firstNavRef : undefined}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: isCollapsedDesktop ? 0 : "0.7rem",
                    padding: isCollapsedDesktop
                      ? "0.6rem 0"
                      : "0.6rem 1.125rem",
                    justifyContent: isCollapsedDesktop ? "center" : "flex-start",
                    color: isActive ? "#e0e7ff" : "#9ca3af",
                    background: isActive
                      ? isCollapsedDesktop
                        ? "rgba(99,102,241,0.18)"
                        : "#1f2937"
                      : "transparent",
                    borderLeft: !isCollapsedDesktop
                      ? isActive
                        ? "3px solid #6366f1"
                        : "3px solid transparent"
                      : "none",
                    textDecoration: "none",
                    fontSize: "0.83rem",
                    fontWeight: isActive ? 500 : 400,
                    letterSpacing: "-0.01em",
                    outline: "none",
                    borderRadius: isCollapsedDesktop ? "0.4rem" : undefined,
                    margin: isCollapsedDesktop ? "0.1rem 0.5rem" : undefined,
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive)
                      (e.currentTarget as HTMLElement).style.background = isCollapsedDesktop
                        ? "rgba(255,255,255,0.06)"
                        : "rgba(255,255,255,0.04)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive)
                      (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                  onFocus={(e) => {
                    if (!isActive)
                      (e.currentTarget as HTMLElement).style.background = isCollapsedDesktop
                        ? "rgba(255,255,255,0.06)"
                        : "rgba(255,255,255,0.04)";
                  }}
                  onBlur={(e) => {
                    if (!isActive)
                      (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                  onClick={() => setDrawerPath(null)}
                >
                  <span
                    style={{
                      flexShrink: 0,
                      display: "flex",
                      color: isActive ? "#818cf8" : "currentColor",
                      opacity: isActive ? 1 : 0.75,
                    }}
                  >
                    <NavIcon name={item.icon} />
                  </span>
                  {!isCollapsedDesktop && <span>{item.label}</span>}
                </Link>

                {/* Tooltip shown only in collapsed-desktop mode */}
                {isCollapsedDesktop && (
                  <span className="ac-nav-tooltip">{item.label}</span>
                )}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div
          style={{
            borderTop: "1px solid rgba(255,255,255,0.06)",
            padding: isCollapsedDesktop ? "0.875rem 0" : "0.875rem 1.125rem",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: isCollapsedDesktop ? "center" : "flex-start",
            gap: "0.5rem",
          }}
        >
          <svg
            width="16" height="16" viewBox="0 0 16 16" fill="none"
            style={{ color: "#4b5563", flexShrink: 0 }}
          >
            <circle cx="8" cy="5.5" r="2.5" fill="currentColor"/>
            <path d="M2 14.5c0-3.31 2.69-6 6-6s6 2.69 6 6"
              stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          {!isCollapsedDesktop && (
            <>
              <span style={{ fontSize: "0.72rem", color: "#4b5563", flex: 1 }}>
                admin
              </span>
              <LogoutButton />
            </>
          )}
        </div>
      </aside>

      {/* ── Hamburger (CSS-visible on mobile) ──────────── */}
      <button
        ref={hamburgerRef}
        onClick={openDrawer}
        aria-label="\uba54\ub274 \uc5f4\uae30"
        aria-expanded={drawerOpen}
        aria-controls="admin-sidebar"
        className="ac-hamburger"
      >
        <HamburgerIcon />
      </button>

      {/* ── Main content ─────────────────────────────── */}
      <div className={bodyClass}>
        {children}
      </div>
    </>
  );
}