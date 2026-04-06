"use client";

import { usePathname, useRouter } from "next/navigation";

const NAV_ITEMS = [
  { href: "/admin",               label: "대시보드" },
  { href: "/admin/users",         label: "회원 관리" },
  { href: "/admin/orders",        label: "주문" },
  { href: "/admin/subscriptions", label: "구독" },
  { href: "/admin/void",          label: "Void 분석" },
  { href: "/admin/system",        label: "시스템" },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <aside
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        bottom: 0,
        width: "220px",
        background: "#111827",
        display: "flex",
        flexDirection: "column",
        zIndex: 100,
        overflowY: "auto",
      }}
    >
      {/* Logo */}
      <div
        style={{
          height: "52px",
          display: "flex",
          alignItems: "center",
          padding: "0 1.25rem",
          borderBottom: "1px solid #1f2937",
          flexShrink: 0,
          gap: "0.4rem",
        }}
      >
        <span
          style={{
            fontSize: "1.05rem",
            fontWeight: 700,
            color: "#fff",
            letterSpacing: "-0.02em",
          }}
        >
          ☽ LUNA
        </span>
        <span
          style={{
            fontSize: "0.58rem",
            color: "#4b5563",
            letterSpacing: "0.12em",
            marginTop: "2px",
          }}
        >
          ADMIN
        </span>
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, padding: "0.625rem 0" }}>
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(item.href);
          return (
            <a
              key={item.href}
              href={item.href}
              style={{
                display: "block",
                padding: "0.5rem 1.25rem",
                fontSize: "0.82rem",
                color: isActive ? "#f9fafb" : "#9ca3af",
                background: isActive ? "#1f2937" : "transparent",
                borderLeft: isActive ? "2px solid #6366f1" : "2px solid transparent",
                textDecoration: "none",
                letterSpacing: "-0.01em",
                transition: "color 0.1s, background 0.1s",
              }}
            >
              {item.label}
            </a>
          );
        })}
      </nav>

      {/* Bottom */}
      <div
        style={{
          borderTop: "1px solid #1f2937",
          padding: "0.875rem 1.25rem",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontSize: "0.7rem",
            color: "#4b5563",
            marginBottom: "0.5rem",
            letterSpacing: "0.04em",
          }}
        >
          admin
        </div>
        <button
          onClick={handleLogout}
          style={{
            background: "transparent",
            border: "none",
            color: "#6b7280",
            fontSize: "0.78rem",
            cursor: "pointer",
            padding: 0,
          }}
        >
          로그아웃 →
        </button>
      </div>
    </aside>
  );
}
