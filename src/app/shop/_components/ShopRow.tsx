import Link from "next/link";

// ── Data types ────────────────────────────────────────────────────────────────
// Extend price / paid / badge when real purchase status is wired in.

export type ShopItemData = {
  id: string;
  /** Unicode glyph used as the row icon */
  icon: string;
  title: string;
  desc: string;
  href: string;
  /** Short label shown on the right (e.g. "무료", "곧 출시") */
  tag?: string;
  /** Formatted price string — shown when set and no tag (e.g. "₩9,900") */
  price?: string;
  /** Future: render "구매완료" badge and disable press */
  paid?: boolean;
};

export type ShopItemVariant = "premium" | "free" | "guide";

type Props = {
  item: ShopItemData;
  variant?: ShopItemVariant;
};

// ── Component ─────────────────────────────────────────────────────────────────

export function ShopRow({ item, variant = "guide" }: Props) {
  return (
    <Link
      href={item.href}
      className={`lsp-row lsp-row--${variant}`}
      role="listitem"
    >
      {/* Left — icon */}
      <span className="lsp-row-icon" aria-hidden="true">
        {item.icon}
      </span>

      {/* Center — text block */}
      <span className="lsp-row-body">
        <span className="lsp-row-title">{item.title}</span>
        <span className="lsp-row-desc">{item.desc}</span>
      </span>

      {/* Right — price / tag + arrow */}
      <span className="lsp-row-right">
        {item.paid ? (
          <span className="lsp-row-badge">구매완료</span>
        ) : item.tag ? (
          <span className="lsp-row-tag">{item.tag}</span>
        ) : item.price ? (
          <span className="lsp-row-price">{item.price}</span>
        ) : null}
        <span className="lsp-row-arrow" aria-hidden="true">›</span>
      </span>
    </Link>
  );
}
