import { useEffect, useRef } from "react";

export function Sparkline({ values }: { values: number[] }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const draw = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = parent.clientWidth || 280;
      const h = 64;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const line =
        getComputedStyle(document.documentElement).getPropertyValue("--color-signal").trim() ||
        "#7a9e90";
      const muted =
        getComputedStyle(document.documentElement).getPropertyValue("--color-line").trim() ||
        "#26262b";

      ctx.strokeStyle = muted;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      if (values.length < 2) return;
      const max = Math.max(0.05, ...values);
      ctx.beginPath();
      values.forEach((v, i) => {
        const x = (i / (values.length - 1)) * w;
        const y = h - 4 - (v / max) * (h - 8);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = line;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [values]);

  return <canvas ref={ref} className="block h-16 w-full" aria-hidden />;
}
