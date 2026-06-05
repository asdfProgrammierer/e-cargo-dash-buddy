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
    const snapshotRef = useRef<ImageData | null>(null);

    const resize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const dpr = window.devicePixelRatio || 1;
      const targetW = Math.round(rect.width * dpr);
      const targetH = Math.round(rect.height * dpr);
      if (canvas.width === targetW && canvas.height === targetH) return;
      // preserve previous drawing
      const prevCtx = canvas.getContext("2d");
      let prev: ImageData | null = null;
      try {
        if (prevCtx && canvas.width > 0 && canvas.height > 0 && !emptyRef.current) {
          prev = prevCtx.getImageData(0, 0, canvas.width, canvas.height);
        }
      } catch {
        /* ignore */
      }
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.scale(dpr, dpr);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.lineWidth = 2.4;
        ctx.strokeStyle = "#000";
        if (prev) {
          // Replay snapshot at native pixels
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          try {
            const tmp = document.createElement("canvas");
            tmp.width = prev.width;
            tmp.height = prev.height;
            tmp.getContext("2d")?.putImageData(prev, 0, 0);
            ctx.drawImage(tmp, 0, 0, targetW, targetH);
          } catch {
            /* ignore */
          }
          ctx.restore();
        }
      }
    };

    useEffect(() => {
      resize();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ro = new ResizeObserver(() => resize());
      ro.observe(canvas);
      const onResize = () => resize();
      window.addEventListener("resize", onResize);
      window.addEventListener("orientationchange", onResize);
      return () => {
        ro.disconnect();
        window.removeEventListener("resize", onResize);
        window.removeEventListener("orientationchange", onResize);
      };
    }, []);

    const getPos = (e: PointerEvent | React.PointerEvent) => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      return { x: (e as PointerEvent).clientX - rect.left, y: (e as PointerEvent).clientY - rect.top };
    };

    const start = (e: React.PointerEvent) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (canvas && (canvas.width === 0 || canvas.height === 0)) resize();
      drawingRef.current = true;
      const p = getPos(e);
      lastRef.current = p;
      // Draw a starting dot so taps register
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.2, 0, Math.PI * 2);
        ctx.fillStyle = "#000";
        ctx.fill();
        emptyRef.current = false;
      }
      (e.target as Element).setPointerCapture?.(e.pointerId);
    };
    const move = (e: React.PointerEvent) => {
      if (!drawingRef.current) return;
      e.preventDefault();
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
        className={className ?? "w-full h-40 bg-white border rounded-md touch-none select-none"}
        style={{ touchAction: "none", userSelect: "none" }}
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