"use client";

import { useEffect, useRef } from "react";

type Star = {
  x: number;
  y: number;
  r: number;
  opacity: number;
  phase: number;
  speed: number;
};

export default function StarField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    // Three layers: small faint, medium, a few bright
    const stars: Star[] = [
      ...Array.from({ length: 140 }, () => ({
        x: Math.random(),
        y: Math.random(),
        r: Math.random() * 0.6 + 0.3,
        opacity: Math.random() * 0.35 + 0.12,
        phase: Math.random() * Math.PI * 2,
        speed: Math.random() * 0.6 + 0.3,
      })),
      ...Array.from({ length: 50 }, () => ({
        x: Math.random(),
        y: Math.random(),
        r: Math.random() * 0.8 + 0.7,
        opacity: Math.random() * 0.4 + 0.25,
        phase: Math.random() * Math.PI * 2,
        speed: Math.random() * 0.4 + 0.2,
      })),
      ...Array.from({ length: 12 }, () => ({
        x: Math.random(),
        y: Math.random(),
        r: Math.random() * 0.6 + 1.3,
        opacity: Math.random() * 0.3 + 0.45,
        phase: Math.random() * Math.PI * 2,
        speed: Math.random() * 0.25 + 0.1,
      })),
    ];

    let animId: number;
    let t = 0;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      t += 0.012;

      for (const s of stars) {
        const twinkle = Math.sin(t * s.speed + s.phase) * 0.28 + 0.72;
        ctx.globalAlpha = s.opacity * twinkle;
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(s.x * canvas.width, s.y * canvas.height, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      animId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    />
  );
}
