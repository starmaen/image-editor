"use client";

import { useEffect, useRef } from "react";
import type { Adjustments } from "@/lib/editor-types";
import { filterCss } from "@/lib/render";

/** معاينة مصغّرة تُظهر تأثير مرشّح على الصورة الحالية. */
export function PresetThumb({
  img,
  adjustments,
}: {
  img: HTMLImageElement;
  adjustments: Adjustments;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const size = 96;
    canvas.width = size;
    canvas.height = size;
    const ratio = Math.min(
      size / img.naturalWidth,
      size / img.naturalHeight,
      1,
    );
    const w = Math.max(1, img.naturalWidth * ratio);
    const h = Math.max(1, img.naturalHeight * ratio);
    ctx.clearRect(0, 0, size, size);
    ctx.filter = filterCss(adjustments, 0);
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    ctx.filter = "none";
  }, [img, adjustments]);

  return (
    <canvas
      ref={ref}
      className="h-14 w-14 shrink-0 rounded-lg bg-zinc-800"
      aria-hidden="true"
    />
  );
}
