"use client";

import type { CropRect } from "@/lib/editor-types";

export type Corner = "nw" | "ne" | "sw" | "se";

// الزوايا بمواضع فيزيائية (أعلى/أسفل + يسار/يمين) بغض النظر عن اتجاه الصفحة
const CORNERS: { corner: Corner; className: string; cursor: string }[] = [
  { corner: "nw", className: "-left-1.5 -top-1.5", cursor: "nwse-resize" },
  { corner: "ne", className: "-right-1.5 -top-1.5", cursor: "nesw-resize" },
  { corner: "sw", className: "-left-1.5 -bottom-1.5", cursor: "nesw-resize" },
  { corner: "se", className: "-right-1.5 -bottom-1.5", cursor: "nwse-resize" },
];

/** طبقة القص: تعتيم خارج المستطيل + مقابض لتغيير الحجم. */
export function CropOverlay({
  crop,
  onStartMove,
  onStartResize,
}: {
  crop: CropRect;
  onStartMove: (event: React.PointerEvent) => void;
  onStartResize: (event: React.PointerEvent, corner: Corner) => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="pointer-events-auto absolute cursor-move outline outline-1 outline-white/80"
        style={{
          left: `${crop.x * 100}%`,
          top: `${crop.y * 100}%`,
          width: `${crop.w * 100}%`,
          height: `${crop.h * 100}%`,
          boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.55)",
        }}
        onPointerDown={(event) => {
          event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          onStartMove(event);
        }}
      >
        {/* خطوط الثلث للمساعدة في التكوين */}
        <div className="absolute inset-x-0 top-1/3 h-px bg-white/25" />
        <div className="absolute inset-x-0 top-2/3 h-px bg-white/25" />
        <div className="absolute inset-y-0 left-1/3 w-px bg-white/25" />
        <div className="absolute inset-y-0 left-2/3 w-px bg-white/25" />
        {CORNERS.map(({ corner, className, cursor }) => (
          <div
            key={corner}
            className={`absolute h-3 w-3 rounded-sm bg-white ${className}`}
            style={{ cursor }}
            onPointerDown={(event) => {
              event.stopPropagation();
              event.currentTarget.setPointerCapture(event.pointerId);
              onStartResize(event, corner);
            }}
          />
        ))}
      </div>
    </div>
  );
}
