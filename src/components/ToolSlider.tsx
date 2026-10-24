"use client";

import type { ReactNode } from "react";

type Props = {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  hint?: ReactNode;
  onInput: () => void;
  onChange: (value: number) => void;
};

/** شريط تمرير مُعنون يستخدم في لوحات أدوات المحرر. */
export function ToolSlider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  hint,
  onInput,
  onChange,
}: Props) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-zinc-400">{label}</span>
        <span className="font-mono text-zinc-300">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={onInput}
        onKeyDown={onInput}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full"
      />
      {hint ? <p className="mt-0.5 text-[11px] text-zinc-500">{hint}</p> : null}
    </div>
  );
}
