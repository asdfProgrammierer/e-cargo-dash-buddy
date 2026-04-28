import { useEffect, useRef, useImperativeHandle, forwardRef } from "react";

export interface SignaturePadHandle {
  clear: () => void;
  isEmpty: () => boolean;
  toDataURL: () => string | null;
}

export const SignaturePad = forwardRef<SignaturePadHandle, { className?: string }>(
  ({ className }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawingRef = useRef(false);
    const emptyRef = useRef(true);
    const lastRef = useRef<{ x: number; y: number } | null>(null);

    const resize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.scale(dpr, dpr);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#000";
      }
    };

    useEffect(() => {
      resize();
      const onResize = () => resize();
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }, []);

    const getPos = (e: PointerEvent | React.PointerEvent) => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      return { x: (e as PointerEvent).clientX - rect.left, y: (e as PointerEvent).clientY - rect.top };
    };

    const start = (e: React.PointerEvent) => {
      e.preventDefault();
      drawingRef.current = true;
      lastRef.current = getPos(e);
      (e.target as Element).setPointerCapture?.(e.pointerId);
    };
    const move = (e: React.PointerEvent) => {
      if (!drawingRef.current) return;
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx || !lastRef.current) return;
      const p = getPos(e);
      ctx.beginPath();
      ctx.moveTo(lastRef.current.x, lastRef.current.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      lastRef.current = p;
      emptyRef.current = false;
    };
    const end = () => {
      drawingRef.current = false;
      lastRef.current = null;
    };

    useImperativeHandle(ref, () => ({
      clear: () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
        emptyRef.current = true;
      },
      isEmpty: () => emptyRef.current,
      toDataURL: () => {
        if (emptyRef.current) return null;
        // flatten to white background for better print
        const src = canvasRef.current;
        if (!src) return null;
        const out = document.createElement("canvas");
        out.width = src.width;
        out.height = src.height;
        const ctx = out.getContext("2d")!;
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, out.width, out.height);
        ctx.drawImage(src, 0, 0);
        return out.toDataURL("image/png");
      },
    }));

    return (
      <canvas
        ref={canvasRef}
        className={className ?? "w-full h-40 bg-white border rounded-md touch-none"}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerLeave={end}
      />
    );
  },
);
SignaturePad.displayName = "SignaturePad";