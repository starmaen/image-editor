// منطق الرسم على Canvas: تحويل حالة المحرر إلى صورة نهائية.
// يُستخدم من جانب العميل فقط (يعتمد على document و canvas).

import { type Adjustments, type EditorState, clamp } from "@/lib/editor-types";

/** يبني نص filter الخاص بـ CSS من قيم التعديلات. */
export function filterCss(a: Adjustments, blurPx: number): string {
  const parts = [
    `brightness(${a.brightness}%)`,
    `contrast(${a.contrast}%)`,
    `saturate(${a.saturation}%)`,
  ];
  if (a.hue !== 0) parts.push(`hue-rotate(${a.hue}deg)`);
  if (a.blur > 0) parts.push(`blur(${Math.max(0.1, blurPx).toFixed(2)}px)`);
  if (a.sepia > 0) parts.push(`sepia(${a.sepia}%)`);
  if (a.grayscale > 0) parts.push(`grayscale(${a.grayscale}%)`);
  if (a.invert > 0) parts.push(`invert(${a.invert}%)`);
  return parts.join(" ");
}

/** أبعاد الصورة بعد تطبيق الدوران والقلب (قبل القص). */
export function getTransformedSize(
  img: { naturalWidth: number; naturalHeight: number },
  rotation: number,
): { width: number; height: number } {
  const rotated = rotation % 180 !== 0;
  return {
    width: rotated ? img.naturalHeight : img.naturalWidth,
    height: rotated ? img.naturalWidth : img.naturalHeight,
  };
}

/** أبعاد لوحة الرسم النهائية بعد القص ومعامل التكبير. */
export function getOutputSize(
  img: { naturalWidth: number; naturalHeight: number },
  state: EditorState,
): { width: number; height: number } {
  const t = getTransformedSize(img, state.rotation);
  return {
    width: Math.max(1, Math.round(t.width * state.crop.w * state.scale)),
    height: Math.max(1, Math.round(t.height * state.crop.h * state.scale)),
  };
}

/**
 * يرسم الصورة النهائية على لوحة canvas جديدة وفقاً للحالة:
 * 1) تطبيق الفلاتر والدوران والقلب على لوحة مؤقتة.
 * 2) قص المنطقة المحددة إلى لوحة الإخراج.
 * 3) رسم ضربات الفرشاة والنصوص.
 */
export function renderToCanvas(
  img: HTMLImageElement,
  state: EditorState,
): HTMLCanvasElement {
  const { naturalWidth: iw, naturalHeight: ih } = img;
  const rotated = state.rotation % 180 !== 0;
  const tempW = rotated ? ih : iw;
  const tempH = rotated ? iw : ih;

  // اللوحة المؤقتة: الصورة بالفلاتر والتحويلات
  const temp = document.createElement("canvas");
  temp.width = Math.max(1, tempW);
  temp.height = Math.max(1, tempH);
  const tctx = temp.getContext("2d");
  if (!tctx) return temp;

  tctx.save();
  tctx.translate(temp.width / 2, temp.height / 2);
  tctx.rotate((state.rotation * Math.PI) / 180);
  tctx.scale(state.flipH ? -1 : 1, state.flipV ? -1 : 1);
  // الطبقة الأساسية: كل الفلاتر ما عدا الضبابية
  tctx.filter = filterCss({ ...state.adjustments, blur: 0 }, 0);
  tctx.drawImage(img, -iw / 2, -ih / 2, iw, ih);
  if (state.adjustments.blur > 0) {
    // طبقة مموّهة فوقها تمنع ظهور حواف شفافة عند الأطراف
    tctx.filter = filterCss(
      state.adjustments,
      (state.adjustments.blur * temp.width) / 100,
    );
    tctx.drawImage(img, -iw / 2, -ih / 2, iw, ih);
  }
  tctx.filter = "none";
  tctx.restore();

  // لوحة الإخراج بعد القص
  const out = getOutputSize(img, state);
  const canvas = document.createElement("canvas");
  canvas.width = out.width;
  canvas.height = out.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const c = state.crop;
  ctx.drawImage(
    temp,
    c.x * temp.width,
    c.y * temp.height,
    c.w * temp.width,
    c.h * temp.height,
    0,
    0,
    out.width,
    out.height,
  );

  // ضربات الفرشاة
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const stroke of state.strokes) {
    if (stroke.points.length === 0) continue;
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = Math.max(1, stroke.width * out.width);
    ctx.beginPath();
    const first = stroke.points[0];
    ctx.moveTo(first.x * out.width, first.y * out.height);
    if (stroke.points.length === 1) {
      // نقطة واحدة: دائرة صغيرة
      ctx.lineTo(first.x * out.width + 0.01, first.y * out.height);
    }
    for (const p of stroke.points.slice(1)) {
      ctx.lineTo(p.x * out.width, p.y * out.height);
    }
    ctx.stroke();
  }

  // النصوص
  for (const t of state.texts) {
    const fontSize = Math.max(8, t.size * out.width);
    ctx.font = `${t.bold ? "700 " : "400 "}${fontSize}px system-ui, -apple-system, "Segoe UI", "Noto Sans Arabic", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = fontSize * 0.12;
    ctx.shadowOffsetY = fontSize * 0.04;
    ctx.fillStyle = t.color;
    const lines = t.text.split("\n");
    const lineHeight = fontSize * 1.25;
    const startY = t.y * out.height - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, i) => {
      ctx.fillText(line, t.x * out.width, startY + i * lineHeight);
    });
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }

  return canvas;
}

/** يصغّر لوحة رسم إلى أبعاد قصوى مع الحفاظ على النسبة ويصدرها كـ data URL. */
export function downscaleToDataUrl(
  source: HTMLCanvasElement,
  maxSize: number,
  quality = 0.82,
): string {
  const ratio = Math.min(1, maxSize / Math.max(source.width, source.height));
  const w = Math.max(1, Math.round(source.width * ratio));
  const h = Math.max(1, Math.round(source.height * ratio));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return source.toDataURL("image/jpeg", quality);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

/** يحمّل صورة من مصدر data URL أو رابط. */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("فشل تحميل الصورة"));
    img.src = src;
  });
}

/**
 * يجهّز صورة مرفوعة للتخزين: يصغّرها إلى أقصى بُعد ويحوّلها إلى JPEG
 * لتقليل الحجم قبل إرسالها إلى قاعدة البيانات.
 */
export async function prepareUpload(
  file: File,
  maxSize = 2048,
  quality = 0.92,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const rawUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("فشل قراءة الملف"));
    reader.readAsDataURL(file);
  });
  const img = await loadImage(rawUrl);
  const ratio = Math.min(
    1,
    maxSize / Math.max(img.naturalWidth, img.naturalHeight),
  );
  const width = Math.max(1, Math.round(img.naturalWidth * ratio));
  const height = Math.max(1, Math.round(img.naturalHeight * ratio));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("تعذّر تجهيز الصورة");
  ctx.imageSmoothingQuality = "high";
  // خلفية بيضاء لتفادي تحويل الشفاف إلى أسود في صيغة JPEG
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return { dataUrl: canvas.toDataURL("image/jpeg", quality), width, height };
}

/** يحوّل اللوحة إلى ملف PNG. */
export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("فشل تصدير الصورة"));
    }, "image/png");
  });
}

/** يصدر اللوحة كصورة PNG مع خلفية بيضاء. */
export function exportPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const flat = document.createElement("canvas");
  flat.width = canvas.width;
  flat.height = canvas.height;
  const ctx = flat.getContext("2d");
  if (!ctx) return canvasToBlob(canvas);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, flat.width, flat.height);
  ctx.drawImage(canvas, 0, 0);
  return canvasToBlob(flat);
}

/** يحصر قيمة بين حدين. */
export function normalizeRatio(
  value: number,
  min: number,
  max: number,
): number {
  if (max === min) return 0;
  return clamp((value - min) / (max - min), 0, 1);
}
