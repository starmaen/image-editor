// التحسين الذكي: يحلل إحصاءات الصورة (السطوط والتباين والتشبع)
// ويستنتج تعديلات مناسبة تلقائياً بدون أي خدمة خارجية.

import { type Adjustments, DEFAULT_ADJUSTMENTS, clamp } from "@/lib/editor-types";

type Stats = {
  lumaMean: number;
  lumaStd: number;
  satMean: number;
};

function analyze(img: HTMLImageElement): Stats {
  const size = 160;
  const ratio = Math.min(
    1,
    size / Math.max(img.naturalWidth, img.naturalHeight),
  );
  const w = Math.max(1, Math.round(img.naturalWidth * ratio));
  const h = Math.max(1, Math.round(img.naturalHeight * ratio));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { lumaMean: 0.5, lumaStd: 0.2, satMean: 0.2 };
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  let lumaSum = 0;
  let lumaSqSum = 0;
  let satSum = 0;
  const count = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lumaSum += luma;
    lumaSqSum += luma * luma;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    satSum += max === 0 ? 0 : (max - min) / max;
  }
  const lumaMean = lumaSum / count;
  const variance = Math.max(0, lumaSqSum / count - lumaMean * lumaMean);
  return {
    lumaMean,
    lumaStd: Math.sqrt(variance),
    satMean: satSum / count,
  };
}

/**
 * يستنتج تعديلات تحسّن تلقائي:
 * - يضبط السطوع ليقترب متوسط الإضاءة من الهدف.
 * - يزيد التباين للصور الباهتة ويخفّفه للصور القاسية.
 * - يعزز التشبع إذا كانت الصورة باهتة اللون.
 */
export function autoEnhance(img: HTMLImageElement): Adjustments {
  const { lumaMean, lumaStd, satMean } = analyze(img);
  const target = 0.56;

  const brightness = clamp(105 * (target / Math.max(lumaMean, 0.08)), 75, 165);
  const contrast =
    lumaStd < 0.16
      ? 128
      : lumaStd < 0.22
        ? 116
        : lumaStd > 0.32
          ? 96
          : 108;
  const saturation = clamp(100 + (0.24 - satMean) * 130, 92, 145);

  return {
    ...DEFAULT_ADJUSTMENTS,
    brightness: Math.round(brightness),
    contrast: Math.round(contrast),
    saturation: Math.round(saturation),
  };
}
