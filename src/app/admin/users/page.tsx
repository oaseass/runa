import { requireAdminAuth } from "@/lib/server/admin-session";
import { getAdminUsersFiltered } from "@/lib/server/admin-data";

/* ── helpers ─────────────────────────────────────────────────── */
function fmtDate(s: string | null) {
  if (!s) return "\u2014";
  return new Date(s).toLocaleDateString("ko-KR", {
    year: "2-digit", month: "2-digit", day: "2-digit",
  });
}

function fmtDateTime(s: string | null) {
  if (!s) return "\u2014";
  return new Date(s).toLocaleDateString("ko-KR", {
    year: "2-digit", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtPhone(p: string) {
  const local = p.startsWith("+82") ? "0" + p.slice(3) : p;
  return local.replace(/(\d{3})(\d{3,4})(\d{4})/, "$1-$2-$3");
}

function fmtKRW(n: number) {
  return n > 0 ? `\u20a9${n.toLocaleString("ko-KR")}` : "\u2014";
}

const PRODUCT_LABEL: Record<string, string> = {
  membership: "\uba64\ubc84\uc2ed",
  yearly:     "\uc5f0\uac04 \uad6c\ub3c5",
};

/* ── VIP diamond icon (inline SVG, server-safe) ───────────────── */
function VipDiamond() {
  return (
    <svg
      width="12" height="12" viewBox="0 0 14 14" fill="none"
      aria-label="VIP" style={{ display: "inline", verticalAlign: "middle", marginRight: "2px" }}
    >
      <path d="M7 1L13 7L7 13L1 7L7 1Z" fill="none" stroke="#818cf8" strokeWidth="1.25" strokeLinejoin="round"/>
      <path d="M7 4L10 7L7 10L4 7L7 4Z" fill="#818cf8" fillOpacity="0.75"/>
    </svg>
  );
}

/* ── page ─────────────────────────────────────────────────────── */
const VALID_VIP = ["", "vip", "normal"] as const;
type VipFilter = "" | "vip" | "normal";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; vip?: string; sort?: string }>;
}) {
  await requireAdminAuth();
  const sp        = await searchParams;
  const search    = sp.q ?? "";
  const vipFilter = (VALID_VIP.includes(sp.vip as VipFilter) ? sp.vip : "") as VipFilter;
  const sortBy    = sp.sort ?? "";

  let users = await getAdminUsersFiltered(search, vipFilter);
  if (sortBy === "vip") {
    users = [...users].sort((a, b) => (b.isVip ? 1 : 0) - (a.isVip ? 1 : 0));
  }

  const vipCount  = users.filter((u) => u.isVip).length;
  const totalCount = users.length;

  /* ── filter URL builder ── */
  function filterHref(params: Partial<{ q: string; vip: string; sort: string }>) {
    const p = new URLSearchParams();
    const q    = params.q    !== undefined ? params.q    : search;
    const vip  = params.vip  !== undefined ? params.vip  : vipFilter;
    const sort = params.sort !== undefined ? params.sort : sortBy;
    if (q)    p.set("q",    q);
    if (vip)  p.set("vip",  vip);
    if (sort) p.set("sort", sort);
    const qs = p.toString();
    return `/admin/users${qs ? "?" + qs : ""}`;
  }

  return (
    <div>
      {/* ── topbar ── */}
      <div className="ac-topbar">
        <h1 className="ac-topbar-title">{"\ud68c\uc6d0 \uad00\ub9ac"}</h1>
        <span className="ac-topbar-sub">
          {"\uc804\uccb4 "}{totalCount.toLocaleString("ko-KR")}{"\uba85"}
          {vipCount > 0 && (
            <> {"\u00b7 VIP "}<span style={{ color: "#818cf8", fontWeight: 600 }}>{vipCount}</span>{"\uba85"}</>
          )}
        </span>
      </div>

      <div className="ac-page">

        {/* ── filter bar ── */}
        <form method="GET" className="ac-filter-bar">
          <input
            name="q"
            defaultValue={search}
            placeholder={"\uc774\ub984 \ub610\ub294 \uc804\ud654\ubc88\ud638 \uac80\uc0c9..."}
            style={{ minWidth: "200px" }}
          />
          {/* VIP 필터 */}
          <div style={{ display: "flex", gap: "0.2rem" }}>
            {([ ["", "\uc804\uccb4"], ["vip", "\u25c6 VIP"], ["normal", "\uc77c\ubc18"] ] as [string, string][]).map(([val, label]) => (
              <a
                key={val}
                href={filterHref({ vip: val })}
                style={{
                  padding: "0.35rem 0.65rem",
                  fontSize: "0.76rem",
                  borderRadius: "0.35rem",
                  textDecoration: "none",
                  background: vipFilter === val ? "#111827" : "#f3f4f6",
                  color:       vipFilter === val ? "#fff"     : "#6b7280",
                  fontWeight:  vipFilter === val ? 600        : 400,
                }}
              >
                {label}
              </a>
            ))}
          </div>
          {/* 정렬 */}
          <a
            href={filterHref({ sort: sortBy === "vip" ? "" : "vip" })}
            style={{
              padding: "0.35rem 0.65rem",
              fontSize: "0.76rem",
              borderRadius: "0.35rem",
              textDecoration: "none",
              background: sortBy === "vip" ? "#6366f1" : "#f3f4f6",
              color:       sortBy === "vip" ? "#fff"    : "#6b7280",
            }}
          >
            {sortBy === "vip" ? "\u25bc VIP \uc21c" : "VIP \uc21c \uc815\ub82c"}
          </a>
          <button
            type="submit"
            style={{ padding: "0.35rem 0.9rem", background: "#111827", color: "#fff", border: "none", borderRadius: "0.375rem", fontSize: "0.8rem", cursor: "pointer" }}
          >
            {"\uac80\uc0c9"}
          </button>
          {(search || vipFilter || sortBy) && (
            <a href="/admin/users" style={{ fontSize: "0.78rem", color: "#6b7280", textDecoration: "none" }}>
              {"\ucd08\uae30\ud654"}
            </a>
          )}
        </form>

        {/* ── table ── */}
        <div className="ac-card" style={{ padding: 0 }}>
          <div className="ac-table-wrap">
            <table className="ac-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{"VIP"}</th>
                  <th>{"\ud68c\uc6d0\uba85"}</th>
                  <th>{"\uc5f0\ub77d\ucc98"}</th>
                  <th>{"\uac00\uc785\uc77c"}</th>
                  <th>{"\uc0dd\ub144\uc6d4\uc77c"}</th>
                  <th>{"\ucd9c\uc0dd\uc9c0"}</th>
                  <th style={{ textAlign: "right" }}>{"\uacb0\uc81c\uac74"}</th>
                  <th style={{ textAlign: "right" }}>{"\uacb0\uc81c\uc561"}</th>
                  <th style={{ textAlign: "right" }}>{"Void"}</th>
                  <th>{"\ud504\ub85c\ud544"}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => (
                  <tr key={u.id} style={u.isVip ? { background: "rgba(99,102,241,0.04)" } : undefined}>
                    <td style={{ color: "#9ca3af", fontSize: "0.72rem" }}>{i + 1}</td>
                    <td>
                      {u.isVip ? (
                        <span
                          title={`${PRODUCT_LABEL[u.vipProductId ?? ""] ?? u.vipProductId ?? ""} \u00b7 ${fmtDateTime(u.vipPaidAt)}`}
                          style={{ display: "inline-flex", alignItems: "center", gap: "0.2rem" }}
                        >
                          <VipDiamond />
                          <span style={{ fontSize: "0.68rem", color: "#818cf8", fontWeight: 600 }}>
                            {PRODUCT_LABEL[u.vipProductId ?? ""] ?? "VIP"}
                          </span>
                        </span>
                      ) : (
                        <span style={{ color: "#e5e7eb", fontSize: "0.72rem" }}>{"\u2014"}</span>
                      )}
                    </td>
                    <td style={{ fontWeight: u.isVip ? 600 : 500, color: "#111827" }}>{u.username}</td>
                    <td style={{ fontFamily: "monospace", fontSize: "0.76rem" }}>{fmtPhone(u.phoneNumber)}</td>
                    <td>{fmtDate(u.createdAt)}</td>
                    <td>{u.birthDate ?? "\u2014"}</td>
                    <td style={{ maxWidth: "130px", overflow: "hidden", textOverflow: "ellipsis", color: "#6b7280" }}>
                      {u.birthPlaceText ?? "\u2014"}
                    </td>
                    <td style={{ textAlign: "right" }}>{u.paidOrderCount > 0 ? u.paidOrderCount : "\u2014"}</td>
                    <td style={{ textAlign: "right" }}>{fmtKRW(u.totalPaid)}</td>
                    <td style={{ textAlign: "right" }}>{u.voidCount > 0 ? u.voidCount : "\u2014"}</td>
                    <td>
                      {u.hasProfile ? (
                        <span className="ac-badge ac-badge-green">{"\uc644\ub8cc"}</span>
                      ) : (
                        <span className="ac-badge ac-badge-gray">{"\ubbf8\uc644"}</span>
                      )}
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={11} style={{ textAlign: "center", color: "#9ca3af", padding: "2rem" }}>
                      {search ? `"${search}" \uac80\uc0c9 \uacb0\uacfc \uc5c6\uc74c` :
                       vipFilter === "vip" ? "VIP \ud68c\uc6d0\uc774 \uc5c6\uc2b5\ub2c8\ub2e4" :
                       "\ud68c\uc6d0 \uc5c6\uc74c"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── VIP 상세 요약 (VIP 탭일 때만) ── */}
        {vipFilter === "vip" && vipCount > 0 && (
          <div style={{ marginTop: "1rem", display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "0.6rem" }}>
            {(["membership", "yearly"] as const).map((pid) => {
              const count = users.filter((u) => u.vipProductId === pid).length;
              if (count === 0) return null;
              return (
                <div key={pid} className="ac-card-sm">
                  <p className="ac-kpi-label">{PRODUCT_LABEL[pid]}</p>
                  <p className="ac-kpi-value" style={{ fontSize: "1.5rem", color: "#6366f1" }}>{count}</p>
                  <p className="ac-kpi-sub">{"\uba85 \ud65c\uc131 VIP"}</p>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}