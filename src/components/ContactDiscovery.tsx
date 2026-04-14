"use client";

/**
 * ContactDiscovery
 * ─────────────────────────────────────────────────────────────────────────────
 * Native Android/iOS contact-based friend/eros discovery.
 *
 * Contact access uses the Capacitor bridge (window.Capacitor.Plugins.Contacts)
 * exactly like /permissions/page.tsx — no npm import, pure JS bridge.
 * On web builds the button is visible but shows a "native only" message.
 *
 * Flow:
 *  1. User taps "연락처에서 친구 찾기"
 *  2. Permission check / request via Capacitor bridge
 *  3. getContacts() → normalize phones → POST /api/contacts/match
 *  4. Show results: LUNA users (add/already), unregistered (invite)
 */

import { useCallback, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { normalizePhone } from "@/lib/phone-normalize";

// ── Types ─────────────────────────────────────────────────────────────────────

type FriendStatus = "not_connected" | "accepted" | "pending_sent" | "pending_received";

type MatchedUser = {
  userId:           string;
  username:         string;
  contactName:      string;
  friendshipStatus: FriendStatus;
  friendshipId:     string | null;
};

type UnregisteredContact = { name: string; phone: string };

type MatchResult = {
  matched:      MatchedUser[];
  unregistered: UnregisteredContact[];
};

type Step =
  | "idle"
  | "requesting_permission"
  | "permission_denied"
  | "reading_contacts"
  | "matching"
  | "results"
  | "error";

type SearchResult = {
  id: string;
  username: string;
  friendshipStatus: string;
};

const CONTACT_MATCH_BATCH_SIZE = 100;

// ── Capacitor bridge types ─────────────────────────────────────────────────────

interface CapContactPhone { number: string }
interface CapContactName  { display?: string }
interface CapContact      { name?: CapContactName; phones?: CapContactPhone[] }
interface CapContactsPlugin {
  requestPermissions?: () => Promise<{ contacts: string }>;
  getContacts?: (opts: { projection: { name: boolean; phones: boolean } }) => Promise<{ contacts: CapContact[] }>;
}
interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: Record<string, unknown>;
}

function getCapacitorRuntime(): CapacitorGlobal | null {
  if (typeof window === "undefined") {
    return null;
  }

  const globalCapacitor = (window as typeof window & { Capacitor?: CapacitorGlobal }).Capacitor;
  return globalCapacitor ?? (Capacitor as CapacitorGlobal);
}

function hasNativeContactsBridge(cap?: CapacitorGlobal | null) {
  if (!cap) return false;

  if (cap.isNativePlatform?.()) return true;

  const platform = cap.getPlatform?.();
  if (platform === "ios" || platform === "android") return true;

  return Boolean(cap.Plugins?.Contacts);
}

function getContactsPlugin(): CapContactsPlugin | null {
  if (typeof window === "undefined") return null;
  const cap = getCapacitorRuntime();
  if (!hasNativeContactsBridge(cap)) return null;
  const p = cap?.Plugins?.Contacts;
  return (p as CapContactsPlugin) ?? null;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: 14,
        height: 14,
        border: "2px solid rgba(255,255,255,0.18)",
        borderTopColor: "#e2e8f0",
        borderRadius: "50%",
        animation: "luna-spin 0.7s linear infinite",
        marginRight: 6,
        verticalAlign: "middle",
        flexShrink: 0,
      }}
    />
  );
}

function StatusBadge({ status }: { status: FriendStatus }) {
  const cfg: Record<FriendStatus, { label: string; bg: string; color: string }> = {
    accepted:          { label: "친구", bg: "#1c2a1c", color: "#4ade80" },
    pending_sent:      { label: "요청 보냄", bg: "#1a1a2e", color: "#a78bfa" },
    pending_received:  { label: "수락 대기", bg: "#1a1a2e", color: "#fbbf24" },
    not_connected:     { label: "", bg: "", color: "" },
  };
  const c = cfg[status];
  if (!c.label) return null;
  return (
    <span
      style={{
        fontSize: "0.66rem",
        padding: "0.18rem 0.55rem",
        borderRadius: 99,
        background: c.bg,
        color: c.color,
        fontWeight: 500,
        letterSpacing: "0.04em",
        flexShrink: 0,
      }}
    >
      {c.label}
    </span>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export type ContactDiscoveryProps = {
  /** "friend" for 친구 탭, "eros" for 에로스 파트너 선택 */
  type?: "friend" | "eros";
  /** Callback when user successfully adds someone (for parent to refresh) */
  onAdd?: (userId: string) => void;
};

export default function ContactDiscovery({
  type = "friend",
  onAdd,
}: ContactDiscoveryProps) {
  const [step,    setStep]    = useState<Step>("idle");
  const [result,  setResult]  = useState<MatchResult | null>(null);
  const [error,   setError]   = useState<string | null>(null);
  // Per-user add/invite state: userId → 'adding'|'added'|'error'
  const [addState, setAddState] = useState<Record<string, string>>({});

  // Phone/username search fallback
  const [searchQuery,   setSearchQuery]   = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Contact reading via Capacitor bridge ─────────────────────────────────

  const readContacts = useCallback(async (): Promise<
    Array<{ name: string; phones: string[] }> | null
  > => {
    const plugin = getContactsPlugin();

    if (!plugin) {
      // Web build — feature not available
      return null;
    }

    // 1. Request permission
    setStep("requesting_permission");
    let permResult: string;
    try {
      const res = await plugin.requestPermissions?.();
      permResult = res?.contacts ?? "blocked";
    } catch {
      permResult = "blocked";
    }

    if (permResult !== "granted") {
      setStep("permission_denied");
      return null;
    }

    // 2. Read contacts
    setStep("reading_contacts");
    let rawContacts: CapContact[] = [];
    try {
      const res = await plugin.getContacts?.({
        projection: { name: true, phones: true },
      });
      rawContacts = res?.contacts ?? [];
    } catch {
      setStep("error");
      setError("연락처를 읽는 중 오류가 발생했어요.");
      return null;
    }

    // 3. Map to normalized structure
    const out: Array<{ name: string; phones: string[] }> = [];
    for (const c of rawContacts) {
      const displayName = c.name?.display?.trim();
      if (!displayName) continue;
      const rawPhones = (c.phones ?? []).map((p) => p.number).filter(Boolean);
      const normalized = rawPhones.reduce<string[]>((acc, p) => {
        const n = normalizePhone(p);
        if (n && !acc.includes(n)) acc.push(n);
        return acc;
      }, []);
      if (normalized.length > 0) {
        out.push({ name: displayName, phones: normalized });
      }
    }

    return out;
  }, []);

  // ── Discovery flow ────────────────────────────────────────────────────────

  const handleDiscover = useCallback(async () => {
    setError(null);
    setResult(null);
    setAddState({});

    const contacts = await readContacts();

    // Web fallback
    if (contacts === null && step !== "permission_denied" && step !== "error") {
      setStep("error");
      setError("연락처 접근은 LUNA 앱(iOS/Android)에서만 사용할 수 있어요.");
      return;
    }
    if (contacts === null) return; // permission_denied handled above

    if (contacts.length === 0) {
      setStep("results");
      setResult({ matched: [], unregistered: [] });
      return;
    }

    // 4. Match against LUNA users
    setStep("matching");
    // Keep batches small to avoid large body failures in remote runtimes.
    const batches: typeof contacts[] = [];
    for (let i = 0; i < contacts.length; i += CONTACT_MATCH_BATCH_SIZE) {
      batches.push(contacts.slice(i, i + CONTACT_MATCH_BATCH_SIZE));
    }

    const allMatched: MatchedUser[] = [];
    const allUnregistered: UnregisteredContact[] = [];

    for (const batch of batches) {
      try {
        const res = await fetch("/api/contacts/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contacts: batch }),
        });

        if (!res.ok) {
          if (res.status === 401) {
            throw new Error("AUTH_REQUIRED");
          }

          if (res.status === 413) {
            throw new Error("CONTACT_BATCH_TOO_LARGE");
          }

          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json() as MatchResult;
        allMatched.push(...data.matched);
        allUnregistered.push(...data.unregistered);
      } catch (matchError) {
        setStep("error");

        if (matchError instanceof Error && matchError.message === "AUTH_REQUIRED") {
          setError("로그인이 끊어졌어요. 다시 로그인한 뒤 시도해 주세요.");
          return;
        }

        if (matchError instanceof Error && matchError.message === "CONTACT_BATCH_TOO_LARGE") {
          setError("연락처가 너무 많아 한 번에 읽지 못했어요. 다시 시도해 주세요.");
          return;
        }

        setError("서버 요청 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }
    }

    setResult({ matched: allMatched, unregistered: allUnregistered.slice(0, 200) });
    setStep("results");
  }, [readContacts, step]);

  // ── Add friend / eros ─────────────────────────────────────────────────────

  const handleAdd = useCallback(async (userId: string) => {
    setAddState((prev) => ({ ...prev, [userId]: "adding" }));
    try {
      const res = await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addresseeId: userId, type }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setAddState((prev) => ({ ...prev, [userId]: "added" }));
      // Update local result state
      setResult((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          matched: prev.matched.map((m) =>
            m.userId === userId
              ? { ...m, friendshipStatus: "accepted" as FriendStatus }
              : m
          ),
        };
      });
      onAdd?.(userId);
    } catch {
      setAddState((prev) => ({ ...prev, [userId]: "error" }));
    }
  }, [type, onAdd]);

  // ── Invite (native share) ─────────────────────────────────────────────────

  const handleInvite = useCallback(async (contact: UnregisteredContact) => {
    // Log invite analytics (fire-and-forget)
    void fetch("/api/friends/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: contact.phone }),
    });

    const text =
      type === "eros"
        ? `LUNA에서 연결되자. 별자리 기반 관계 앱이야. ${getInviteUrl()}`
        : `LUNA 같이 써보자. 별자리로 관계를 읽는 앱이야. ${getInviteUrl()}`;

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "LUNA 초대", text, url: getInviteUrl() });
      } catch {
        // User cancelled or not supported — fallback to clipboard
        await copyInvite(text);
      }
    } else {
      await copyInvite(text);
    }
  }, [type]);

  // ── Manual search (phone / username) ─────────────────────────────────────

  const handleSearch = useCallback(async (q: string) => {
    if (!q || q.length < 2) { setSearchResults(null); return; }
    setSearchLoading(true);
    try {
      const res = await fetch(`/api/friends/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { users: SearchResult[] };
      setSearchResults(data.users);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  const handleSearchChange = useCallback((q: string) => {
    setSearchQuery(q);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => handleSearch(q), 350);
  }, [handleSearch]);

  const handleSearchAdd = useCallback(async (userId: string) => {
    setAddState((prev) => ({ ...prev, [userId]: "adding" }));
    try {
      const res = await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addresseeId: userId, type }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setAddState((prev) => ({ ...prev, [userId]: "added" }));
      setSearchResults((prev) =>
        prev ? prev.map((u) =>
          u.id === userId ? { ...u, friendshipStatus: "accepted" } : u
        ) : prev
      );
      onAdd?.(userId);
    } catch {
      setAddState((prev) => ({ ...prev, [userId]: "error" }));
    }
  }, [type, onAdd]);

  // ── Invite link share (no contacts needed) ───────────────────────────────

  const handleShareInvite = useCallback(async () => {
    const url = getInviteUrl();
    const text =
      type === "eros"
        ? `LUNA에서 연결되자. 별자리 기반 관계 앱이야.`
        : `LUNA 같이 써보자. 별자리로 관계를 읽는 앱이야.`;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "LUNA 초대", text, url });
      } catch { /* cancelled */ }
    } else {
      await copyInvite(`${text} ${url}`);
    }
  }, [type]);

  // ── Settings deep link ────────────────────────────────────────────────────

  const openSettings = useCallback(() => {
    const cap = (window as typeof window & { Capacitor?: CapacitorGlobal }).Capacitor;
    const appPlugin = cap?.Plugins?.App as {
      openUrl?: (opts: { url: string }) => void;
    } | undefined;
    appPlugin?.openUrl?.({ url: "app-settings:" });
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  const label = type === "eros" ? "에로스 파트너" : "친구";

  // ── Search fallback section (reusable in idle + denied) ─────────────────

  function SearchFallback({ compact }: { compact?: boolean }) {
    return (
      <div style={{ marginTop: compact ? "0.75rem" : 0 }}>
        {!compact && (
          <p style={{ color: "#9ca3af", fontSize: "0.76rem", margin: "0 0 0.5rem", letterSpacing: "0.04em", textTransform: "uppercase" }}>
            전화번호·유저명으로 검색
          </p>
        )}
        <div style={{ position: "relative" }}>
          <input
            type="search"
            placeholder="@유저명 또는 010-0000-0000"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            style={{
              width: "100%",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              padding: "0.5rem 2.2rem 0.5rem 0.75rem",
              color: "#e2e8f0",
              fontSize: "0.82rem",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          {searchLoading && (
            <div style={{ position: "absolute", right: "0.6rem", top: "50%", transform: "translateY(-50%)" }}>
              <Spinner />
            </div>
          )}
        </div>
        {searchResults !== null && (
          <div style={{ marginTop: "0.4rem", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, overflow: "hidden" }}>
            {searchResults.length === 0 ? (
              <p style={{ color: "#4b5563", fontSize: "0.78rem", padding: "0.65rem 0.85rem", margin: 0 }}>검색 결과가 없어요.</p>
            ) : searchResults.map((u) => {
              const aState = addState[u.id];
              const isAdded   = aState === "added" || u.friendshipStatus === "accepted";
              const isAdding  = aState === "adding";
              const isPending = u.friendshipStatus === "pending_sent";
              return (
                <div key={u.id} style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.6rem 0.85rem", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                  <div style={{ width: 30, height: 30, borderRadius: "50%", background: `hsl(${hashStr(u.id) % 360},30%,22%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.78rem", color: "#9ca3af", flexShrink: 0 }}>
                    {u.username.slice(0, 1).toUpperCase()}
                  </div>
                  <p style={{ margin: 0, flex: 1, fontSize: "0.82rem", color: "#e2e8f0" }}>@{u.username}</p>
                  {isAdded ? (
                    <StatusBadge status="accepted" />
                  ) : isPending ? (
                    <StatusBadge status="pending_sent" />
                  ) : (
                    <button onClick={() => handleSearchAdd(u.id)} disabled={isAdding} style={primaryBtnStyle(isAdding)}>
                      {isAdding ? <><Spinner />추가 중</> : `${label} 추가`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Idle button
  if (step === "idle") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
        <button
          onClick={handleDiscover}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            width: "100%",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.09)",
            borderRadius: 10,
            padding: "0.85rem 1rem",
            color: "#e2e8f0",
            fontSize: "0.85rem",
            fontWeight: 500,
            cursor: "pointer",
            textAlign: "left",
            letterSpacing: "-0.01em",
          }}
        >
          <ContactsIcon />
          <span>연락처에서 {label} 찾기</span>
          <span style={{ marginLeft: "auto", color: "#4b5563", fontSize: "0.75rem" }}>→</span>
        </button>
        <SearchFallback compact />
      </div>
    );
  }

  // Permission denied
  if (step === "permission_denied") {
    return (
      <div
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 10,
          padding: "1rem",
        }}
      >
        <p style={{ color: "#f87171", fontSize: "0.82rem", margin: "0 0 0.5rem" }}>
          연락처 권한이 거부되었어요.
        </p>
        <p style={{ color: "#6b7280", fontSize: "0.76rem", margin: "0 0 0.35rem", lineHeight: 1.6 }}>
          연락처 권한은 LUNA 회원 중 아는 사람을 자동으로 찾기 위해 필요해요.
        </p>
        <p style={{ color: "#4b5563", fontSize: "0.73rem", margin: "0 0 0.85rem", lineHeight: 1.5 }}>
          전화번호는 해시 처리 후 비교하며 서버에 저장되지 않아요.
        </p>

        {/* Settings + Back */}
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
          <button onClick={openSettings} style={ghostBtnStyle}>
            설정에서 권한 허용
          </button>
          <button onClick={() => setStep("idle")} style={ghostBtnStyle}>
            돌아가기
          </button>
        </div>

        {/* Divider */}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: "0.85rem" }}>
          <p style={{ color: "#6b7280", fontSize: "0.74rem", margin: "0 0 0.6rem" }}>
            권한 없이도 직접 검색하거나 초대 링크를 공유할 수 있어요.
          </p>
          <SearchFallback />
          <button
            onClick={handleShareInvite}
            style={{ ...ghostBtnStyle, marginTop: "0.6rem", width: "100%", justifyContent: "center", display: "flex", gap: "0.4rem" }}
          >
            <ShareIcon /> 초대 링크 공유
          </button>
        </div>
      </div>
    );
  }

  // Loading states
  if (step === "requesting_permission" || step === "reading_contacts" || step === "matching") {
    const msg =
      step === "requesting_permission" ? "권한 요청 중..." :
      step === "reading_contacts"      ? "연락처 읽는 중..." :
                                         "LUNA 회원 매칭 중...";
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "0.85rem 1rem",
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 10,
          color: "#9ca3af",
          fontSize: "0.82rem",
        }}
      >
        <Spinner />{msg}
      </div>
    );
  }

  // Error
  if (step === "error") {
    return (
      <div
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(248,113,113,0.2)",
          borderRadius: 10,
          padding: "0.85rem 1rem",
        }}
      >
        <p style={{ color: "#f87171", fontSize: "0.8rem", margin: "0 0 0.6rem" }}>
          {error ?? "오류가 발생했어요."}
        </p>
        <button onClick={() => setStep("idle")} style={ghostBtnStyle}>
          다시 시도
        </button>
      </div>
    );
  }

  // Results
  if (step === "results" && result) {
    const { matched, unregistered } = result;
    const hasAny = matched.length > 0 || unregistered.length > 0;

    return (
      <>
        <style>{`@keyframes luna-spin { to { transform: rotate(360deg); } }`}</style>
        <div
          style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0.75rem 1rem",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <span style={{ fontSize: "0.75rem", color: "#6b7280", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              연락처 매칭 결과
            </span>
            <button
              onClick={() => { setStep("idle"); setResult(null); setAddState({}); }}
              style={{ background: "none", border: "none", color: "#4b5563", cursor: "pointer", fontSize: "0.75rem" }}
            >
              닫기
            </button>
          </div>

          {!hasAny && (
            <div style={{ padding: "1.5rem 1rem", textAlign: "center" }}>
              <p style={{ color: "#4b5563", fontSize: "0.82rem", margin: 0 }}>
                연락처에 LUNA 가입자가 없어요.
              </p>
              <p style={{ color: "#374151", fontSize: "0.76rem", marginTop: "0.3rem" }}>
                친구를 초대해서 함께 시작해 보세요.
              </p>
            </div>
          )}

          {/* Matched LUNA users */}
          {matched.length > 0 && (
            <div>
              <p
                style={{
                  fontSize: "0.68rem",
                  color: "#6b7280",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  padding: "0.6rem 1rem 0.4rem",
                  margin: 0,
                }}
              >
                LUNA 회원 ({matched.length}명)
              </p>
              {matched.map((u) => {
                const aState = addState[u.userId];
                const isAdded = aState === "added" || u.friendshipStatus === "accepted";
                const isAdding = aState === "adding";
                return (
                  <div
                    key={u.userId}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.65rem",
                      padding: "0.7rem 1rem",
                      borderTop: "1px solid rgba(255,255,255,0.04)",
                    }}
                  >
                    {/* Avatar placeholder */}
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: "50%",
                        background: `hsl(${hashStr(u.userId) % 360},30%,22%)`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "0.8rem",
                        color: "#9ca3af",
                        flexShrink: 0,
                      }}
                    >
                      {u.username.slice(0, 1).toUpperCase()}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: "0.84rem", color: "#e2e8f0", fontWeight: 500 }}>
                        {u.contactName}
                      </p>
                      <p style={{ margin: 0, fontSize: "0.72rem", color: "#4b5563" }}>
                        @{u.username}
                      </p>
                    </div>

                    {isAdded ? (
                      <StatusBadge status="accepted" />
                    ) : u.friendshipStatus === "pending_sent" ? (
                      <StatusBadge status="pending_sent" />
                    ) : u.friendshipStatus === "pending_received" ? (
                      <button
                        onClick={() => handleAdd(u.userId)}
                        disabled={isAdding}
                        style={primaryBtnStyle(isAdding)}
                      >
                        {isAdding ? <Spinner /> : null}수락
                      </button>
                    ) : (
                      <button
                        onClick={() => handleAdd(u.userId)}
                        disabled={isAdding}
                        style={primaryBtnStyle(isAdding)}
                      >
                        {isAdding ? <><Spinner />추가 중</> : `${label} 추가`}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Unregistered contacts */}
          {unregistered.length > 0 && (
            <div>
              <p
                style={{
                  fontSize: "0.68rem",
                  color: "#6b7280",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  padding: "0.6rem 1rem 0.4rem",
                  margin: 0,
                  borderTop: matched.length > 0 ? "1px solid rgba(255,255,255,0.06)" : undefined,
                }}
              >
                미가입 연락처 ({unregistered.length}명)
              </p>
              {unregistered.slice(0, 30).map((c, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.65rem",
                    padding: "0.6rem 1rem",
                    borderTop: "1px solid rgba(255,255,255,0.04)",
                  }}
                >
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: "50%",
                      background: "rgba(255,255,255,0.04)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "0.8rem",
                      color: "#6b7280",
                      flexShrink: 0,
                    }}
                  >
                    {c.name.slice(0, 1)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: "0.84rem", color: "#6b7280", fontWeight: 500 }}>{c.name}</p>
                    <p style={{ margin: 0, fontSize: "0.7rem", color: "#374151" }}>미가입</p>
                  </div>
                  <button
                    onClick={() => handleInvite(c)}
                    style={{
                      background: "none",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 6,
                      padding: "0.3rem 0.65rem",
                      color: "#9ca3af",
                      fontSize: "0.73rem",
                      cursor: "pointer",
                      flexShrink: 0,
                      letterSpacing: "0.02em",
                    }}
                  >
                    초대
                  </button>
                </div>
              ))}
              {unregistered.length > 30 && (
                <p style={{ textAlign: "center", color: "#374151", fontSize: "0.72rem", padding: "0.5rem" }}>
                  외 {unregistered.length - 30}명
                </p>
              )}
            </div>
          )}

          {/* Re-scan footer */}
          <div
            style={{
              borderTop: "1px solid rgba(255,255,255,0.06)",
              padding: "0.6rem 1rem",
              display: "flex",
              justifyContent: "center",
            }}
          >
            <button
              onClick={handleDiscover}
              style={{ background: "none", border: "none", color: "#4b5563", fontSize: "0.73rem", cursor: "pointer" }}
            >
              다시 검색
            </button>
          </div>
        </div>
      </>
    );
  }

  return null;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function getInviteUrl(): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/start`;
  }
  return "https://luna.app/start";
}

async function copyInvite(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    alert("초대 문자가 클립보드에 복사되었어요.");
  } catch {
    // silently ignore
  }
}

/** Deterministic short hash of a string — used for avatar color */
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

// ── Style helpers ─────────────────────────────────────────────────────────────

const ghostBtnStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 6,
  padding: "0.38rem 0.8rem",
  color: "#9ca3af",
  fontSize: "0.76rem",
  cursor: "pointer",
};

function primaryBtnStyle(loading: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    background: loading ? "rgba(99,102,241,0.4)" : "#4f46e5",
    border: "none",
    borderRadius: 6,
    padding: "0.32rem 0.7rem",
    color: "#fff",
    fontSize: "0.73rem",
    fontWeight: 500,
    cursor: loading ? "not-allowed" : "pointer",
    flexShrink: 0,
    letterSpacing: "0.02em",
    opacity: loading ? 0.7 : 1,
  };
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function ShareIcon() {
  return (
    <svg
      width="15" height="15" viewBox="0 0 20 20" fill="none"
      aria-hidden="true" style={{ flexShrink: 0 }}
    >
      <circle cx="15" cy="4"  r="2" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="15" cy="16" r="2" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="5"  cy="10" r="2" stroke="currentColor" strokeWidth="1.6" />
      <line x1="7" y1="11" x2="13" y2="15" stroke="currentColor" strokeWidth="1.5" />
      <line x1="7" y1="9"  x2="13" y2="5"  stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function ContactsIcon() {
  return (
    <svg
      width="17" height="17" viewBox="0 0 20 20" fill="none"
      aria-hidden="true" style={{ flexShrink: 0, color: "#6366f1" }}
    >
      <circle cx="10" cy="7" r="3" fill="currentColor" fillOpacity="0.8" />
      <path d="M4 17c0-3.31 2.69-6 6-6s6 2.69 6 6"
        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M16 3v3M17.5 4.5h-3"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
