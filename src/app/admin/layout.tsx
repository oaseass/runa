import { cookies } from "next/headers";
import { verifyAdminToken, ADMIN_COOKIE_NAME } from "@/lib/server/admin-session";
import AdminShell from "@/components/admin/AdminShell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  const isAuth = verifyAdminToken(token);

  if (!isAuth) {
    return <>{children}</>;
  }

  return (
    <>
      <style>{`
        /* ── Sidebar layout ───────────────────────────────── */
        .ac-sidebar {
          position: fixed; left: 0; top: 0; bottom: 0; width: 240px;
          background: #111827; display: flex; flex-direction: column;
          z-index: 100; overflow-y: auto; overflow-x: hidden;
          transition: width 210ms ease, transform 220ms cubic-bezier(0.4,0,0.2,1);
          will-change: width, transform;
        }
        .ac-sidebar--collapsed { width: 72px; }
        .ac-body {
          margin-left: 240px; flex: 1; display: flex; flex-direction: column;
          min-width: 0; min-height: 100dvh;
          transition: margin-left 210ms ease;
          background: #f3f4f6;
          font-family: var(--font-geist-sans, system-ui, sans-serif);
        }
        .ac-body--collapsed { margin-left: 72px; }

        /* ── Mobile (< 1200px) ────────────────────────────── */
        @media (max-width: 1199px) {
          .ac-sidebar { transform: translateX(-100%); width: 240px !important; }
          .ac-sidebar--drawer-open { transform: translateX(0); }
          .ac-body, .ac-body--collapsed { margin-left: 0 !important; }
          .ac-topbar { padding-left: 3.25rem !important; }
          .ac-kpi-grid { grid-template-columns: repeat(2, 1fr); }
        }

        /* ── Backdrop ─────────────────────────────────────── */
        .ac-backdrop {
          position: fixed; inset: 0; z-index: 98;
          background: rgba(0,0,0,0.45);
          opacity: 0; pointer-events: none;
          transition: opacity 220ms ease;
        }
        .ac-backdrop--visible { opacity: 1; pointer-events: auto; }

        /* ── Hamburger ────────────────────────────────────── */
        .ac-hamburger {
          display: none;
          position: fixed; top: 12px; left: 12px;
          z-index: 99;
          align-items: center; justify-content: center;
          width: 36px; height: 36px;
          background: #111827;
          border: none;
          border-radius: 0.4rem;
          cursor: pointer;
          color: #d1d5db;
        }
        @media (max-width: 1199px) { .ac-hamburger { display: flex; } }

        /* ── Nav tooltip (collapsed desktop) ─────────────── */
        .ac-nav-item { position: relative; }
        .ac-nav-tooltip {
          position: absolute; left: calc(100% + 10px); top: 50%;
          transform: translateY(-50%);
          background: #0f172a; color: #f1f5f9;
          font-size: 0.73rem; padding: 0.3rem 0.65rem;
          border-radius: 0.3rem; white-space: nowrap;
          pointer-events: none; opacity: 0;
          transition: opacity 150ms ease;
          z-index: 200; box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        }
        .ac-nav-item:hover .ac-nav-tooltip,
        .ac-nav-item:focus-within .ac-nav-tooltip { opacity: 1; }

        /* ── Content classes ──────────────────────────────── */
        .ac-topbar { position: sticky; top: 0; z-index: 50; background: #fff; border-bottom: 1px solid #e5e7eb; height: 52px; display: flex; align-items: center; padding: 0 1.75rem; gap: 0.75rem; }
        .ac-topbar-title { font-size: 0.9rem; font-weight: 600; color: #111827; margin: 0; }
        .ac-topbar-sub { font-size: 0.75rem; color: #9ca3af; margin-left: auto; }
        .ac-page { padding: 1.5rem 1.75rem 4rem; }
        .ac-section-title { font-size: 0.65rem; letter-spacing: 0.1em; color: #9ca3af; text-transform: uppercase; margin: 0 0 0.75rem; }
        .ac-kpi-grid   { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.75rem; margin-bottom: 1.25rem; }
        .ac-kpi-grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem; margin-bottom: 1.25rem; }
        .ac-kpi-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; margin-bottom: 1.25rem; }
        .ac-card    { background: #fff; border-radius: 0.5rem; border: 1px solid #e5e7eb; padding: 1rem 1.25rem; }
        .ac-card-sm { background: #fff; border-radius: 0.5rem; border: 1px solid #e5e7eb; padding: 0.875rem 1rem; }
        .ac-kpi-panel { min-height: 112px; display: flex; flex-direction: column; justify-content: space-between; }
        .ac-kpi-label { font-size: 0.7rem; color: #6b7280; margin: 0 0 0.25rem; }
        .ac-kpi-value { font-size: 1.6rem; font-weight: 700; color: #111827; letter-spacing: -0.03em; margin: 0; line-height: 1.1; }
        .ac-kpi-sub   { font-size: 0.72rem; color: #6b7280; margin-top: 0.3rem; }
        .ac-trend-up   { color: #16a34a; }
        .ac-trend-down { color: #dc2626; }
        .ac-trend-flat { color: #9ca3af; }
        .ac-table-wrap { overflow-x: auto; }
        .ac-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
        .ac-table th { padding: 0.5rem 0.75rem; text-align: left; font-size: 0.65rem; letter-spacing: 0.06em; color: #9ca3af; text-transform: uppercase; border-bottom: 1px solid #e5e7eb; white-space: nowrap; }
        .ac-table td { padding: 0.5rem 0.75rem; border-bottom: 1px solid #f3f4f6; color: #374151; white-space: nowrap; vertical-align: middle; }
        .ac-table tr:hover td { background: #f9fafb; }
        .ac-table tr:last-child td { border-bottom: none; }
        .ac-badge        { display: inline-block; padding: 0.15em 0.5em; border-radius: 9999px; font-size: 0.65rem; font-weight: 600; letter-spacing: 0.04em; }
        .ac-badge-green  { background: #dcfce7; color: #15803d; }
        .ac-badge-red    { background: #fee2e2; color: #dc2626; }
        .ac-badge-yellow { background: #fef9c3; color: #a16207; }
        .ac-badge-blue   { background: #dbeafe; color: #2563eb; }
        .ac-badge-gray   { background: #f3f4f6; color: #6b7280; }
        .ac-badge-purple { background: #ede9fe; color: #7c3aed; }
        .ac-alert { background: #fff; border-radius: 0.5rem; border: 1px solid #fca5a5; padding: 0.875rem 1.25rem; display: flex; align-items: center; gap: 0.75rem; }
        .ac-filter-bar { display: flex; gap: 0.5rem; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; }
        .ac-filter-bar input, .ac-filter-bar select { padding: 0.4rem 0.7rem; border: 1px solid #e5e7eb; border-radius: 0.375rem; font-size: 0.8rem; background: #fff; color: #111827; outline: none; }
        .ac-filter-bar input:focus, .ac-filter-bar select:focus { border-color: #6366f1; }
        .ac-divider { border: none; border-top: 1px solid #e5e7eb; margin: 1.25rem 0; }
        .ac-shell-grid { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 0.75rem; align-items: start; }
        .ac-rail-stack { position: sticky; top: 64px; display: grid; gap: 0.75rem; }
        .ac-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.75rem; margin-bottom: 0.75rem; }
        .ac-card-title { margin: 0; font-size: 0.8rem; font-weight: 600; color: #374151; }
        .ac-card-copy { margin: 0.22rem 0 0; font-size: 0.72rem; line-height: 1.45; color: #9ca3af; }
        .ac-card-actions { display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap; }
        .ac-checklist { display: grid; gap: 0; }
        .ac-checkitem { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.75rem; padding: 0.6rem 0; border-bottom: 1px solid #f3f4f6; }
        .ac-checkitem:last-child { border-bottom: none; padding-bottom: 0; }
        .ac-checkitem:first-child { padding-top: 0; }
        .ac-checklabel { margin: 0; font-size: 0.76rem; font-weight: 600; color: #374151; }
        .ac-checkcopy { margin: 0.18rem 0 0; font-size: 0.7rem; line-height: 1.45; color: #9ca3af; }
        .ac-search-form { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0.5rem; }
        .ac-input { width: 100%; padding: 0.55rem 0.7rem; border: 1px solid #e5e7eb; border-radius: 0.45rem; font-size: 0.8rem; background: #fff; color: #111827; outline: none; }
        .ac-input:focus { border-color: #111827; }
        .ac-btn { display: inline-flex; align-items: center; justify-content: center; min-height: 2.25rem; padding: 0 0.8rem; border-radius: 0.45rem; border: 1px solid #111827; background: #111827; color: #fff; font-size: 0.76rem; font-weight: 600; text-decoration: none; cursor: pointer; }
        .ac-btn-secondary { background: #fff; color: #374151; border-color: #d1d5db; }
        .ac-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; }
        @media (max-width: 1399px) {
          .ac-shell-grid { grid-template-columns: 1fr; }
          .ac-rail-stack { position: static; }
        }
      `}</style>
      <AdminShell>{children}</AdminShell>
    </>
  );
}
