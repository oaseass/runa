"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const NAV_ITEMS = [
  { href: "/admin", label: "대시보드" },
  { href: "/admin/users", label: "회원" },
  { href: "/admin/orders", label: "주문" },
  { href: "/admin/void", label: "Void 분석" },
];

export function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <div
      style={{
        background: "#fff",
        borderBottom: "1px solid rgba(0,0,0,0.08)",
        padding: "0 1.25rem",
        display: "flex",
        alignItems: "center",
        gap: "0",
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      <span
        style={{
          fontSize: "0.6rem",
          letterSpacing: "0.14em",
          opacity: 0.35,
          marginRight: "1.5rem",
          fontWeight: 600,
        }}
      >
        LUNA
      </span>

      <div style={{ display: "flex", flex: 1, gap: "0" }}>
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                padding: "0.9rem 0.9rem",
                fontSize: "0.8rem",
                fontWeight: active ? 600 : 400,
                color: active ? "#1a1a1a" : "rgba(0,0,0,0.45)",
                textDecoration: "none",
                borderBottom: active ? "2px solid #1a1a1a" : "2px solid transparent",
                transition: "color 0.15s",
                whiteSpace: "nowrap",
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      <button
        onClick={handleLogout}
        style={{
          fontSize: "0.72rem",
          color: "rgba(0,0,0,0.35)",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "0.5rem 0",
        }}
      >
        로그아웃
      </button>
    </div>
  );
}
