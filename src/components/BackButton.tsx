"use client";

import { useRouter } from "next/navigation";

interface BackButtonProps {
  className?: string;
  label?: string;
}

export default function BackButton({ className = "luna-back-btn", label = "←" }: BackButtonProps) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={className}
      onClick={() => router.back()}
      aria-label="뒤로"
    >
      {label}
    </button>
  );
}
