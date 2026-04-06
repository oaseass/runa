/**
 * VipBadge — 작은 프리미엄 다이아몬드 배지.
 * "use client" 없음 → 서버·클라이언트 양쪽에서 사용 가능.
 */
export default function VipBadge({ size = 14 }: { size?: number }) {
  return (
    <span
      aria-label="VIP 멤버"
      title="VIP 멤버"
      style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 14 14"
        fill="none"
        aria-hidden="true"
        focusable="false"
      >
        {/* 바깥 다이아몬드 */}
        <path
          d="M7 1L13 7L7 13L1 7L7 1Z"
          fill="none"
          stroke="#818cf8"
          strokeWidth="1.25"
          strokeLinejoin="round"
        />
        {/* 안쪽 채운 다이아몬드 */}
        <path
          d="M7 4L10 7L7 10L4 7L7 4Z"
          fill="#818cf8"
          fillOpacity="0.75"
        />
      </svg>
    </span>
  );
}
