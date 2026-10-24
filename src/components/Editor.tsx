"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type Adjustments,
  type CropRect,
  type EditorState,
  type TextItem,
  DEFAULT_ADJUSTMENTS,
  PRESETS,
  clamp,
  clamp01,
  createDefaultState,
  normalizeState,
} from "@/lib/editor-types";
import { autoEnhance } from "@/lib/auto-enhance";
import {
  downscaleToDataUrl,
  exportPngBlob,
  getOutputSize,
  getTransformedSize,
  loadImage,
  renderToCanvas,
} from "@/lib/render";
import { formatDate, type ProjectVersion } from "@/lib/project-types";
import { CropOverlay, type Corner } from "@/components/CropOverlay";
import { ToolSlider } from "@/components/ToolSlider";
import { PresetThumb } from "@/components/PresetThumb";

type Project = {
  id: number;
  title: string;
  originalData: string;
  previewData: string | null;
  width: number;
  height: number;
  state: EditorState;
};

type Tool =
  | "adjust"
  | "presets"
  | "transform"
  | "crop"
  | "resize"
  | "text"
  | "brush";

const TOOLS: { id: Tool; label: string; icon: string }[] = [
  { id: "adjust", label: "تعديلات", icon: "🎛️" },
  { id: "presets", label: "مرشحات", icon: "🎨" },
  { id: "transform", label: "تحويل", icon: "🔄" },
  { id: "crop", label: "قص", icon: "✂️" },
  { id: "resize", label: "الحجم", icon: "📐" },
  { id: "text", label: "نص", icon: "🔤" },
  { id: "brush", label: "فرشاة", icon: "🖌️" },
];

const ASPECTS: { label: string; value: number | null }[] = [
  { label: "حر", value: null },
  { label: "1:1", value: 1 },
  { label: "4:3", value: 4 / 3 },
  { label: "3:4", value: 3 / 4 },
  { label: "16:9", value: 16 / 9 },
  { label: "9:16", value: 9 / 16 },
];

const ADJUST_SLIDERS: {
  key: keyof Adjustments;
  label: string;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
}[] = [
  { key: "brightness", label: "السطوع", min: 20, max: 200, suffix: "%" },
  { key: "contrast", label: "التباين", min: 20, max: 200, suffix: "%" },
  { key: "saturation", label: "التشبع", min: 0, max: 200, suffix: "%" },
  { key: "hue", label: "درجة اللون", min: -180, max: 180, suffix: "°" },
  { key: "blur", label: "الضبابية", min: 0, max: 8, step: 0.1, suffix: "%" },
  { key: "sepia", label: "سيبيا", min: 0, max: 100, suffix: "%" },
  { key: "grayscale", label: "تدرج رمادي", min: 0, max: 100, suffix: "%" },
  { key: "invert", label: "عكس الألوان", min: 0, max: 100, suffix: "%" },
];

type Interaction =
  | { kind: "brush" }
  | { kind: "crop-new" }
  | { kind: "crop-move" }
  | { kind: "crop-corner"; corner: Corner }
  | { kind: "text-move"; id: string }
  | null;

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function cloneState(state: EditorState): EditorState {
  return JSON.parse(JSON.stringify(state)) as EditorState;
}

function replaceState(draft: EditorState, next: EditorState): void {
  draft.adjustments = next.adjustments;
  draft.rotation = next.rotation;
  draft.flipH = next.flipH;
  draft.flipV = next.flipV;
  draft.crop = next.crop;
  draft.scale = next.scale;
  draft.texts = next.texts;
  draft.strokes = next.strokes;
}

/** يحسب مستطيل قص جديد عند السحب من زاوية معيّنة مع الحفاظ على النسبة. */
function resizeCropRect(
  orig: CropRect,
  corner: Corner,
  pointer: { x: number; y: number },
  aspect: number | null,
  outputAspect: number,
): CropRect {
  const fromLeft = corner === "nw" || corner === "sw";
  const fromTop = corner === "nw" || corner === "ne";
  const anchorX = fromLeft ? orig.x + orig.w : orig.x;
  const anchorY = fromTop ? orig.y + orig.h : orig.y;

  let w = Math.abs(pointer.x - anchorX);
  let h = Math.abs(pointer.y - anchorY);
  if (aspect) {
    if (w / Math.max(h, 1e-6) > aspect / outputAspect) {
      h = (w * outputAspect) / aspect;
    } else {
      w = (h * aspect) / outputAspect;
    }
  }
  const maxW = fromLeft ? anchorX : 1 - anchorX;
  const maxH = fromTop ? anchorY : 1 - anchorY;
  w = Math.min(w, maxW);
  h = Math.min(h, maxH);
  if (aspect) {
    if ((w * outputAspect) / aspect <= maxH) h = (w * outputAspect) / aspect;
    else w = (h * aspect) / outputAspect;
  }
  w = Math.max(0.04, w);
  h = Math.max(0.04, h);

  const rect: CropRect = {
    x: fromLeft ? anchorX - w : anchorX,
    y: fromTop ? anchorY - h : anchorY,
    w,
    h,
  };
  rect.x = clamp01(rect.x);
  rect.y = clamp01(rect.y);
  if (rect.x + rect.w > 1) rect.w = 1 - rect.x;
  if (rect.y + rect.h > 1) rect.h = 1 - rect.y;
  return rect;
}

/** يحسب مستطيل قص جديد عند السحب على المنطقة الفارغة. */
function newCropRect(
  origin: { x: number; y: number },
  pointer: { x: number; y: number },
  aspect: number | null,
  outputAspect: number,
): CropRect {
  const x = Math.min(origin.x, pointer.x);
  const y = Math.min(origin.y, pointer.y);
  let w = Math.abs(pointer.x - origin.x);
  let h = Math.abs(pointer.y - origin.y);
  if (aspect) {
    h = (w * outputAspect) / aspect;
    if (y + h > 1) {
      h = 1 - y;
      w = (h * aspect) / outputAspect;
    }
    if (x + w > 1) {
      w = 1 - x;
      h = (w * outputAspect) / aspect;
    }
  }
  return { x, y, w: clamp01(w), h: clamp01(h) };
}

export function Editor({ project }: { project: Project }) {
  const router = useRouter();

  // --- حالة المحرر والسجل ---
  const stateRef = useRef<EditorState>(normalizeState(project.state));
  const [state, setState] = useState<EditorState>(stateRef.current);
  const undoRef = useRef<EditorState[]>([]);
  const redoRef = useRef<EditorState[]>([]);
  const [, setHistoryTick] = useState(0);

  const update = useCallback(
    (mutate: (draft: EditorState) => void, record = true) => {
      const prev = stateRef.current;
      const next = cloneState(prev);
      mutate(next);
      if (record) {
        // دمج التغييرات المتقاربة زمنياً (سحب شريط مثلاً) في مدخل تراجع واحد
        const now = Date.now();
        if (now - lastPushRef.current > 600) {
          undoRef.current.push(prev);
          if (undoRef.current.length > 60) undoRef.current.shift();
        }
        lastPushRef.current = now;
        redoRef.current = [];
      }
      stateRef.current = next;
      setState(next);
      setDirty(true);
      setHistoryTick((tick) => tick + 1);
    },
    [],
  );

  const pushHistory = useCallback(() => {
    lastPushRef.current = Date.now();
    undoRef.current.push(stateRef.current);
    if (undoRef.current.length > 60) undoRef.current.shift();
    redoRef.current = [];
    setHistoryTick((tick) => tick + 1);
  }, []);

  const undo = useCallback(() => {
    const prev = undoRef.current.pop();
    if (!prev) return;
    redoRef.current.push(stateRef.current);
    stateRef.current = prev;
    setState(prev);
    setHistoryTick((tick) => tick + 1);
  }, []);

  const redo = useCallback(() => {
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current.push(stateRef.current);
    stateRef.current = next;
    setState(next);
    setHistoryTick((tick) => tick + 1);
  }, []);

  // --- الصورة ---
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    let alive = true;
    setImg(null);
    setImgError(false);
    loadImage(project.originalData)
      .then((loaded) => {
        if (alive) setImg(loaded);
      })
      .catch(() => {
        if (alive) setImgError(true);
      });
    return () => {
      alive = false;
    };
  }, [project.originalData]);

  // --- واجهة ---
  const [tool, setTool] = useState<Tool>("adjust");
  const [title, setTitle] = useState(project.title);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [saveError, setSaveError] = useState(false);

  // --- أدوات ---
  const [brushColor, setBrushColor] = useState("#ef4444");
  const [brushWidth, setBrushWidth] = useState(1.2);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [cropAspect, setCropAspect] = useState<number | null>(null);
  const [cropDraft, setCropDraft] = useState<CropRect | null>(null);
  const [widthDraft, setWidthDraft] = useState<string | null>(null);

  // --- الإصدارات ---
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versions, setVersions] = useState<ProjectVersion[] | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<Interaction>(null);
  const dragOriginRef = useRef({
    x: 0,
    y: 0,
    crop: { x: 0, y: 0, w: 1, h: 1 } as CropRect,
  });
  const currentStrokeRef = useRef<string | null>(null);
  const lastPushRef = useRef(0);

  const outputSize = useMemo(
    () =>
      img
        ? getOutputSize(img, state)
        : { width: project.width, height: project.height },
    [img, state, project.width, project.height],
  );
  const outputAspect = outputSize.width / Math.max(1, outputSize.height);
  const baseSize = useMemo(() => {
    if (!img) return { width: 1, height: 1 };
    const t = getTransformedSize(img, state.rotation);
    return {
      width: Math.max(1, t.width * state.crop.w),
      height: Math.max(1, t.height * state.crop.h),
    };
  }, [img, state.rotation, state.crop.w, state.crop.h]);

  // --- الرسم على اللوحة ---
  useEffect(() => {
    if (!img) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const frame = requestAnimationFrame(() => {
      const rendered = renderToCanvas(img, stateRef.current);
      canvas.width = rendered.width;
      canvas.height = rendered.height;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.drawImage(rendered, 0, 0);
    });
    return () => cancelAnimationFrame(frame);
  }, [img, state]);

  const displayCrop = cropDraft ?? state.crop;

  // --- الحفظ والتنزيل ---
  const handleSave = useCallback(async () => {
    if (!img) return;
    setSaving(true);
    setSaveError(false);
    try {
      const canvas = renderToCanvas(img, stateRef.current);
      const preview = downscaleToDataUrl(canvas, 480, 0.8);
      const size = getOutputSize(img, stateRef.current);
      const response = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || project.title,
          previewData: preview,
          width: size.width,
          height: size.height,
          state: stateRef.current,
        }),
      });
      if (!response.ok) throw new Error("failed");
      setDirty(false);
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 2200);
      router.refresh();
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  }, [img, project.id, project.title, router, title]);

  const handleDownload = useCallback(async () => {
    if (!img) return;
    const canvas = renderToCanvas(img, stateRef.current);
    const blob = await exportPngBlob(canvas);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(title.trim() || "image").replace(/[\\/:*?"<>|]/g, "_")}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [img, title]);

  // --- اختصارات لوحة المفاتيح ---
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const mod = event.ctrlKey || event.metaKey;
      if (!mod) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        redo();
      } else if (key === "s") {
        event.preventDefault();
        void handleSave();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo, handleSave]);

  // --- تحذير عند المغادرة بتغييرات غير محفوظة ---
  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // --- تفاعل المؤشر على اللوحة ---
  const getNorm = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: clamp01((clientX - rect.left) / Math.max(1, rect.width)),
      y: clamp01((clientY - rect.top) / Math.max(1, rect.height)),
    };
  }, []);

  const findTextAt = useCallback(
    (point: { x: number; y: number }): TextItem | null => {
      for (let i = state.texts.length - 1; i >= 0; i -= 1) {
        const item = state.texts[i];
        const halfW = Math.max(0.05, item.size * 1.6);
        const halfH = Math.max(0.04, item.size);
        if (
          Math.abs(point.x - item.x) <= halfW &&
          Math.abs(point.y - item.y) <= halfH
        ) {
          return item;
        }
      }
      return null;
    },
    [state.texts],
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!img) return;
      const point = getNorm(event.clientX, event.clientY);
      event.currentTarget.setPointerCapture(event.pointerId);
      const origin = {
        x: point.x,
        y: point.y,
        crop: { ...stateRef.current.crop },
      };

      if (tool === "brush") {
        const id = uid();
        currentStrokeRef.current = id;
        update((draft) => {
          draft.strokes = [
            ...draft.strokes,
            {
              id,
              color: brushColor,
              width: brushWidth / 100,
              points: [point],
            },
          ];
        });
        interactionRef.current = { kind: "brush" };
        return;
      }

      if (tool === "crop") {
        interactionRef.current = { kind: "crop-new" };
        dragOriginRef.current = origin;
        return;
      }

      if (tool === "text") {
        const hit = findTextAt(point);
        if (hit) {
          pushHistory();
          setSelectedTextId(hit.id);
          interactionRef.current = { kind: "text-move", id: hit.id };
          dragOriginRef.current = origin;
        } else {
          const id = uid();
          update((draft) => {
            draft.texts = [
              ...draft.texts,
              {
                id,
                text: "نص جديد",
                x: point.x,
                y: point.y,
                size: 0.08,
                color: "#ffffff",
                bold: true,
              },
            ];
          });
          setSelectedTextId(id);
        }
      }
    },
    [brushColor, brushWidth, findTextAt, getNorm, img, pushHistory, tool, update],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const interaction = interactionRef.current;
      if (!interaction || !img) return;
      const point = getNorm(event.clientX, event.clientY);
      const origin = dragOriginRef.current;

      if (interaction.kind === "brush") {
        const id = currentStrokeRef.current;
        update(
          (draft) => {
            const index = draft.strokes.findIndex((s) => s.id === id);
            if (index < 0) return;
            const stroke = draft.strokes[index];
            const last = stroke.points[stroke.points.length - 1];
            if (last && Math.hypot(point.x - last.x, point.y - last.y) < 0.004) {
              return;
            }
            draft.strokes = [
              ...draft.strokes.slice(0, index),
              { ...stroke, points: [...stroke.points, point] },
              ...draft.strokes.slice(index + 1),
            ];
          },
          false,
        );
        return;
      }

      if (interaction.kind === "crop-new") {
        setCropDraft(
          newCropRect(origin, point, cropAspect, outputAspect),
        );
        return;
      }

      if (interaction.kind === "crop-move") {
        const dx = point.x - origin.x;
        const dy = point.y - origin.y;
        const o = origin.crop;
        update(
          (draft) => {
            draft.crop = {
              x: clamp(o.x + dx, 0, 1 - o.w),
              y: clamp(o.y + dy, 0, 1 - o.h),
              w: o.w,
              h: o.h,
            };
          },
          false,
        );
        return;
      }

      if (interaction.kind === "crop-corner") {
        update(
          (draft) => {
            draft.crop = resizeCropRect(
              origin.crop,
              interaction.corner,
              point,
              cropAspect,
              outputAspect,
            );
          },
          false,
        );
        return;
      }

      if (interaction.kind === "text-move") {
        const id = interaction.id;
        update(
          (draft) => {
            draft.texts = draft.texts.map((item) =>
              item.id === id
                ? {
                    ...item,
                    x: clamp(point.x, 0.02, 0.98),
                    y: clamp(point.y, 0.02, 0.98),
                  }
                : item,
            );
          },
          false,
        );
      }
    },
    [cropAspect, getNorm, img, outputAspect, update],
  );

  const onPointerUp = useCallback(() => {
    const interaction = interactionRef.current;
    interactionRef.current = null;
    currentStrokeRef.current = null;
    if (interaction?.kind === "crop-new") {
      const draft = cropDraft;
      setCropDraft(null);
      if (draft && draft.w >= 0.04 && draft.h >= 0.04) {
        update((d) => {
          d.crop = draft;
        });
      }
    }
  }, [cropDraft, update]);

  // --- الإصدارات ---
  const openVersions = useCallback(async () => {
    setVersionsOpen(true);
    setVersions(null);
    try {
      const response = await fetch(`/api/projects/${project.id}/versions`);
      const data = (await response.json()) as { versions?: ProjectVersion[] };
      setVersions(data.versions ?? []);
    } catch {
      setVersions([]);
    }
  }, [project.id]);

  const restoreVersion = useCallback(
    (version: ProjectVersion) => {
      update((draft) => {
        replaceState(draft, normalizeState(version.state));
      });
      setVersionsOpen(false);
    },
    [update],
  );

  // --- أدوات التحويل ---
  const rotate = useCallback(
    (delta: number) => {
      update((draft) => {
        draft.rotation = (draft.rotation + delta + 360) % 360;
      });
    },
    [update],
  );

  const selectedText =
    state.texts.find((item) => item.id === selectedTextId) ?? null;

  const cursorClass =
    tool === "brush"
      ? "cursor-crosshair"
      : tool === "crop"
        ? "cursor-copy"
        : tool === "text"
          ? "cursor-text"
          : "cursor-default";

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-zinc-950">
      {/* الشريط العلوي */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-zinc-800 bg-zinc-900 px-3">
        <Link
          href="/"
          className="rounded-lg px-2 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
        >
          → لوحة التحكم
        </Link>
        <div className="h-6 w-px bg-zinc-800" />
        <input
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            setDirty(true);
          }}
          className="min-w-0 max-w-[14rem] flex-1 rounded-lg bg-transparent px-2 py-1 text-sm font-semibold text-white outline-none hover:bg-zinc-800 focus:bg-zinc-800 sm:max-w-xs"
          aria-label="عنوان المشروع"
        />
        {dirty ? (
          <span
            className="h-2 w-2 shrink-0 rounded-full bg-amber-400"
            title="تغييرات غير محفوظة"
          />
        ) : null}
        <div className="flex-1" />
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={undo}
            disabled={undoRef.current.length === 0}
            title="تراجع (Ctrl+Z)"
            className="rounded-lg px-2.5 py-1.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-800 disabled:opacity-30"
          >
            ↩️
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={redoRef.current.length === 0}
            title="إعادة (Ctrl+Shift+Z)"
            className="rounded-lg px-2.5 py-1.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-800 disabled:opacity-30"
          >
            ↪️
          </button>
          <button
            type="button"
            onClick={() => {
              if (
                !window.confirm("سيتم إلغاء كل التعديلات. هل تريد المتابعة؟")
              ) {
                return;
              }
              update((draft) => {
                replaceState(draft, createDefaultState());
              });
            }}
            title="إعادة تعيين"
            className="rounded-lg px-2.5 py-1.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
          >
            🔄
          </button>
          <button
            type="button"
            onClick={() => void openVersions()}
            title="سجل الإصدارات"
            className="rounded-lg px-2.5 py-1.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
          >
            🕘
          </button>
          <button
            type="button"
            onClick={() => void handleDownload()}
            disabled={!img}
            title="تنزيل PNG"
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 transition-colors hover:border-zinc-500 hover:text-white disabled:opacity-40"
          >
            ⬇️ تنزيل
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!img || saving}
            title="حفظ (Ctrl+S)"
            className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
          >
            {saving
              ? "جاري الحفظ..."
              : savedFlash
                ? "✓ تم الحفظ"
                : saveError
                  ? "أعد المحاولة"
                  : "حفظ"}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* شريط الأدوات (يمين في RTL) */}
        <aside className="flex w-20 shrink-0 flex-col gap-1 overflow-y-auto border-e border-zinc-800 bg-zinc-900/60 p-2 scrollbar-thin">
          {TOOLS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTool(item.id)}
              className={`flex flex-col items-center gap-1 rounded-xl px-1 py-2.5 text-[11px] transition-colors ${
                tool === item.id
                  ? "bg-indigo-600/20 text-indigo-300"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </aside>

        {/* منطقة اللوحة */}
        <main className="checkerboard relative flex-1 overflow-hidden">
          <div className="flex h-full w-full items-center justify-center p-4 sm:p-8">
            <div
              ref={wrapRef}
              className="relative max-h-full max-w-full shadow-2xl shadow-black/50"
              style={{ lineHeight: 0 }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <canvas
                ref={canvasRef}
                className={`block max-h-[calc(100vh-12rem)] max-w-[calc(100vw-27rem)] ${cursorClass}`}
              />
              {tool === "crop" && img ? (
                <CropOverlay
                  crop={displayCrop}
                  onStartMove={(event) => {
                    const point = getNorm(event.clientX, event.clientY);
                    pushHistory();
                    interactionRef.current = { kind: "crop-move" };
                    dragOriginRef.current = {
                      x: point.x,
                      y: point.y,
                      crop: { ...stateRef.current.crop },
                    };
                  }}
                  onStartResize={(event, corner) => {
                    const point = getNorm(event.clientX, event.clientY);
                    pushHistory();
                    interactionRef.current = { kind: "crop-corner", corner };
                    dragOriginRef.current = {
                      x: point.x,
                      y: point.y,
                      crop: { ...stateRef.current.crop },
                    };
                  }}
                />
              ) : null}
              {!img ? (
                <div className="absolute inset-0 grid place-items-center bg-zinc-900/80 text-sm text-zinc-400">
                  {imgError ? "فشل تحميل الصورة" : "جاري تحميل الصورة..."}
                </div>
              ) : null}
            </div>
          </div>
          <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-zinc-900/90 px-3 py-1 text-xs text-zinc-400 ring-1 ring-zinc-800">
            {outputSize.width} × {outputSize.height} بكسل ·{" "}
            {Math.round(state.scale * 100)}%
          </div>
        </main>

        {/* لوحة الخيارات (يسار في RTL) */}
        <aside className="scrollbar-thin w-72 shrink-0 overflow-y-auto border-s border-zinc-800 bg-zinc-900/40 p-4">
          {tool === "adjust" ? (
            <AdjustPanel
              state={state}
              update={update}
              pushHistory={pushHistory}
              onSmartEnhance={() => {
                if (!img) return;
                update((draft) => {
                  draft.adjustments = autoEnhance(img);
                });
              }}
            />
          ) : null}

          {tool === "presets" ? (
            <PresetsPanel
              img={img}
              state={state}
              update={update}
              onApply={(presetId) => {
                const preset = PRESETS.find((p) => p.id === presetId);
                if (!preset) return;
                update((draft) => {
                  draft.adjustments = {
                    ...DEFAULT_ADJUSTMENTS,
                    ...preset.adjustments,
                  };
                });
              }}
            />
          ) : null}

          {tool === "transform" ? (
            <TransformPanel
              state={state}
              update={update}
              onRotate={rotate}
            />
          ) : null}

          {tool === "crop" ? (
            <CropPanel
              state={state}
              cropAspect={cropAspect}
              setCropAspect={setCropAspect}
              update={update}
            />
          ) : null}

          {tool === "resize" ? (
            <ResizePanel
              outputSize={outputSize}
              baseSize={baseSize}
              state={state}
              update={update}
              widthDraft={widthDraft}
              setWidthDraft={setWidthDraft}
            />
          ) : null}

          {tool === "text" ? (
            <TextPanel
              state={state}
              selectedText={selectedText}
              update={update}
              onSelect={setSelectedTextId}
              onAdd={() => {
                const id = uid();
                update((draft) => {
                  draft.texts = [
                    ...draft.texts,
                    {
                      id,
                      text: "نص جديد",
                      x: 0.5,
                      y: 0.5,
                      size: 0.08,
                      color: "#ffffff",
                      bold: true,
                    },
                  ];
                });
                setSelectedTextId(id);
              }}
            />
          ) : null}

          {tool === "brush" ? (
            <BrushPanel
              brushColor={brushColor}
              setBrushColor={setBrushColor}
              brushWidth={brushWidth}
              setBrushWidth={setBrushWidth}
              state={state}
              update={update}
            />
          ) : null}
        </aside>
      </div>

      {/* درج سجل الإصدارات */}
      {versionsOpen ? (
        <div className="fixed inset-0 z-50 flex">
          <button
            type="button"
            aria-label="إغلاق"
            className="flex-1 bg-black/60"
            onClick={() => setVersionsOpen(false)}
          />
          <div className="flex w-80 flex-col border-r border-zinc-800 bg-zinc-900">
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
              <h2 className="font-bold text-white">سجل الإصدارات</h2>
              <button
                type="button"
                onClick={() => setVersionsOpen(false)}
                className="rounded-lg px-2 py-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="scrollbar-thin flex-1 overflow-y-auto p-4">
              {versions === null ? (
                <p className="text-sm text-zinc-500">جاري التحميل...</p>
              ) : versions.length === 0 ? (
                <p className="text-sm text-zinc-500">
                  لا توجد إصدارات محفوظة بعد. اضغط «حفظ» لإنشاء أول إصدار.
                </p>
              ) : (
                <ul className="space-y-3">
                  {versions.map((version) => (
                    <li
                      key={version.id}
                      className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3"
                    >
                      <div className="checkerboard mb-2 aspect-video w-full overflow-hidden rounded-lg">
                        {version.previewData ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={version.previewData}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </div>
                      <p className="text-xs text-zinc-500">
                        {formatDate(version.createdAt)} · {version.width} ×{" "}
                        {version.height}
                      </p>
                      <button
                        type="button"
                        onClick={() => restoreVersion(version)}
                        className="mt-2 w-full rounded-lg border border-zinc-700 py-1.5 text-xs text-zinc-200 transition-colors hover:border-indigo-500 hover:text-white"
                      >
                        استعادة هذا الإصدار
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------- لوحات الأدوات ------------------------- */

function PanelShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-bold text-white">{title}</h2>
        {description ? (
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function AdjustPanel({
  state,
  update,
  pushHistory,
  onSmartEnhance,
}: {
  state: EditorState;
  update: (mutate: (draft: EditorState) => void, record?: boolean) => void;
  pushHistory: () => void;
  onSmartEnhance: () => void;
}) {
  return (
    <PanelShell
      title="تعديلات الصورة"
      description="اسحب الشرائح لتعديل الصورة مباشرة، وسيتم تطبيقها فوراً على اللوحة."
    >
      <button
        type="button"
        onClick={onSmartEnhance}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-indigo-600 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
      >
        ✨ تحسين ذكي تلقائي
      </button>
      {/* pushHistory */}
      <div className="space-y-3.5">
        {ADJUST_SLIDERS.map((slider) => (
          <ToolSlider
            key={slider.key}
            label={slider.label}
            value={state.adjustments[slider.key]}
            min={slider.min}
            max={slider.max}
            step={slider.step}
            suffix={slider.suffix}
            onInput={pushHistory}
            onChange={(value) =>
              update((draft) => {
                draft.adjustments = {
                  ...draft.adjustments,
                  [slider.key]: value,
                };
              }, false)
            }
          />
        ))}
      </div>
      <button
        type="button"
        onClick={() =>
          update((draft) => {
            draft.adjustments = { ...DEFAULT_ADJUSTMENTS };
          })
        }
        className="w-full rounded-xl border border-zinc-700 py-2 text-sm text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
      >
        إعادة تعيين التعديلات
      </button>
    </PanelShell>
  );
}

function PresetsPanel({
  img,
  state,
  update,
  onApply,
}: {
  img: HTMLImageElement | null;
  state: EditorState;
  update: (mutate: (draft: EditorState) => void, record?: boolean) => void;
  onApply: (presetId: string) => void;
}) {
  return (
    <PanelShell
      title="مرشحات جاهزة"
      description="اختر مرشحاً يُطبّق بنقرة واحدة على الصورة."
    >
      <div className="grid grid-cols-2 gap-2">
        {PRESETS.map((preset) => {
          const active =
            (Object.keys(preset.adjustments) as (keyof Adjustments)[]).every(
              (key) =>
                Math.abs(
                  state.adjustments[key] -
                    (DEFAULT_ADJUSTMENTS[key] +
                      ((preset.adjustments[key] ?? DEFAULT_ADJUSTMENTS[key]) -
                        DEFAULT_ADJUSTMENTS[key])),
                ) < 0.001,
            );
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onApply(preset.id)}
              className={`flex items-center gap-2 rounded-xl border p-2 text-right transition-colors ${
                active
                  ? "border-indigo-500 bg-indigo-500/10"
                  : "border-zinc-800 hover:border-zinc-600"
              }`}
            >
              {img ? (
                <PresetThumb
                  img={img}
                  adjustments={{
                    ...DEFAULT_ADJUSTMENTS,
                    ...preset.adjustments,
                  }}
                />
              ) : (
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-zinc-800 text-xl">
                  {preset.icon}
                </span>
              )}
              <span className="text-xs font-medium text-zinc-200">
                {preset.name}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] leading-relaxed text-zinc-500">
        يمكنك دائماً تعديل أي مرشّح بعد تطبيقه من تبويب «تعديلات».
      </p>
      <button
        type="button"
        onClick={() =>
          update((draft) => {
            draft.adjustments = { ...DEFAULT_ADJUSTMENTS };
          })
        }
        className="w-full rounded-xl border border-zinc-700 py-2 text-sm text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
      >
        إزالة المرشّح
      </button>
    </PanelShell>
  );
}

function TransformPanel({
  state,
  update,
  onRotate,
}: {
  state: EditorState;
  update: (mutate: (draft: EditorState) => void, record?: boolean) => void;
  onRotate: (delta: number) => void;
}) {
  return (
    <PanelShell
      title="التحويل"
      description="تدوير الصورة بزوايا قائمة أو قلبها أفقياً وعمودياً."
    >
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onRotate(-90)}
          className="rounded-xl border border-zinc-700 py-3 text-sm text-zinc-200 transition-colors hover:border-indigo-500 hover:text-white"
        >
          ↺ تدوير يساراً
        </button>
        <button
          type="button"
          onClick={() => onRotate(90)}
          className="rounded-xl border border-zinc-700 py-3 text-sm text-zinc-200 transition-colors hover:border-indigo-500 hover:text-white"
        >
          ↻ تدوير يميناً
        </button>
        <button
          type="button"
          onClick={() =>
            update((draft) => {
              draft.flipH = !draft.flipH;
            })
          }
          className={`rounded-xl border py-3 text-sm transition-colors ${
            state.flipH
              ? "border-indigo-500 bg-indigo-500/10 text-white"
              : "border-zinc-700 text-zinc-200 hover:border-indigo-500 hover:text-white"
          }`}
        >
          ⇋ قلب أفقي
        </button>
        <button
          type="button"
          onClick={() =>
            update((draft) => {
              draft.flipV = !draft.flipV;
            })
          }
          className={`rounded-xl border py-3 text-sm transition-colors ${
            state.flipV
              ? "border-indigo-500 bg-indigo-500/10 text-white"
              : "border-zinc-700 text-zinc-200 hover:border-indigo-500 hover:text-white"
          }`}
        >
          ⇅ قلب رأسي
        </button>
      </div>
      <p className="rounded-lg bg-zinc-800/60 px-3 py-2 text-xs text-zinc-400">
        زاوية الدوران الحالية: <span className="font-mono">{state.rotation}°</span>
      </p>
    </PanelShell>
  );
}

function CropPanel({
  state,
  cropAspect,
  setCropAspect,
  update,
}: {
  state: EditorState;
  cropAspect: number | null;
  setCropAspect: (value: number | null) => void;
  update: (mutate: (draft: EditorState) => void, record?: boolean) => void;
}) {
  return (
    <PanelShell
      title="القص"
      description="اسحب على الصورة لتحديد منطقة القص، أو استخدم المقابض لتعديلها. القص يُطبّق مباشرة."
    >
      <div>
        <p className="mb-2 text-xs text-zinc-400">نسبة القص</p>
        <div className="flex flex-wrap gap-2">
          {ASPECTS.map((aspect) => (
            <button
              key={aspect.label}
              type="button"
              onClick={() => setCropAspect(aspect.value)}
              className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                cropAspect === aspect.value
                  ? "border-indigo-500 bg-indigo-500/10 text-white"
                  : "border-zinc-700 text-zinc-300 hover:border-zinc-500"
              }`}
            >
              {aspect.label}
            </button>
          ))}
        </div>
      </div>
      <dl className="space-y-1 rounded-lg bg-zinc-800/60 px-3 py-2 text-xs text-zinc-400">
        <div className="flex justify-between">
          <dt>الموضع</dt>
          <dd className="font-mono" dir="ltr">
            {Math.round(state.crop.x * 100)}% , {Math.round(state.crop.y * 100)}%
          </dd>
        </div>
        <div className="flex justify-between">
          <dt>الحجم</dt>
          <dd className="font-mono" dir="ltr">
            {Math.round(state.crop.w * 100)}% × {Math.round(state.crop.h * 100)}%
          </dd>
        </div>
      </dl>
      <button
        type="button"
        onClick={() =>
          update((draft) => {
            draft.crop = { x: 0, y: 0, w: 1, h: 1 };
          })
        }
        className="w-full rounded-xl border border-zinc-700 py-2 text-sm text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
      >
        إعادة تعيين القص
      </button>
    </PanelShell>
  );
}

function ResizePanel({
  outputSize,
  baseSize,
  state,
  update,
  widthDraft,
  setWidthDraft,
}: {
  outputSize: { width: number; height: number };
  baseSize: { width: number; height: number };
  state: EditorState;
  update: (mutate: (draft: EditorState) => void, record?: boolean) => void;
  widthDraft: string | null;
  setWidthDraft: (value: string | null) => void;
}) {
  const widthValue = widthDraft ?? String(outputSize.width);
  return (
    <PanelShell
      title="حجم الصورة"
      description="غيّر أبعاد الصورة النهائية. النسبة بين الأبعاد محفوظة تلقائياً."
    >
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-xs text-zinc-400">العرض (بكسل)</span>
          <input
            type="number"
            min={1}
            value={widthValue}
            onChange={(event) => {
              setWidthDraft(event.target.value);
              const value = Number.parseInt(event.target.value, 10);
              if (!Number.isFinite(value) || value < 1) return;
              update((draft) => {
                draft.scale = clamp(value / baseSize.width, 0.05, 4);
              });
            }}
            onBlur={() => setWidthDraft(null)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-zinc-400">الارتفاع (بكسل)</span>
          <input
            type="number"
            readOnly
            value={outputSize.height}
            className="w-full cursor-not-allowed rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-400 outline-none"
          />
        </label>
      </div>
      <ToolSlider
        label="نسبة التكبير"
        value={Math.round(state.scale * 100)}
        min={10}
        max={300}
        suffix="%"
        onInput={() => undefined}
        onChange={(value) =>
          update((draft) => {
            draft.scale = value / 100;
          })
        }
      />
      <div className="flex flex-wrap gap-2">
        {[50, 100, 150, 200].map((percent) => (
          <button
            key={percent}
            type="button"
            onClick={() =>
              update((draft) => {
                draft.scale = percent / 100;
              })
            }
            className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
              Math.round(state.scale * 100) === percent
                ? "border-indigo-500 bg-indigo-500/10 text-white"
                : "border-zinc-700 text-zinc-300 hover:border-zinc-500"
            }`}
          >
            {percent}%
          </button>
        ))}
      </div>
    </PanelShell>
  );
}

function TextPanel({
  state,
  selectedText,
  update,
  onSelect,
  onAdd,
}: {
  state: EditorState;
  selectedText: TextItem | null;
  update: (mutate: (draft: EditorState) => void, record?: boolean) => void;
  onSelect: (id: string | null) => void;
  onAdd: () => void;
}) {
  function mutateSelected(mutate: (item: TextItem) => TextItem) {
    if (!selectedText) return;
    const id = selectedText.id;
    update((draft) => {
      draft.texts = draft.texts.map((item) =>
        item.id === id ? mutate(item) : item,
      );
    });
  }

  return (
    <PanelShell
      title="النصوص"
      description="أضف نصاً بالسحب على اللوحة، ثم اسحبه لتحريكه. عدّل المحتوى واللون والحجم من هنا."
    >
      <button
        type="button"
        onClick={onAdd}
        className="w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
      >
        + إضافة نص
      </button>

      {state.texts.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {state.texts.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={`max-w-full truncate rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                selectedText?.id === item.id
                  ? "border-indigo-500 bg-indigo-500/10 text-white"
                  : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
              }`}
            >
              {item.text || "نص فارغ"}
            </button>
          ))}
        </div>
      ) : null}

      {selectedText ? (
        <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
          <label className="block">
            <span className="mb-1 block text-xs text-zinc-400">المحتوى</span>
            <textarea
              value={selectedText.text}
              rows={2}
              onChange={(event) =>
                mutateSelected((item) => ({ ...item, text: event.target.value }))
              }
              className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
            />
          </label>
          <ToolSlider
            label="حجم الخط"
            value={Math.round(selectedText.size * 1000) / 10}
            min={2}
            max={25}
            step={0.5}
            suffix="%"
            onInput={() => undefined}
            onChange={(value) =>
              mutateSelected((item) => ({ ...item, size: value / 100 }))
            }
          />
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-xs text-zinc-400">
              اللون
              <input
                type="color"
                value={selectedText.color}
                onChange={(event) =>
                  mutateSelected((item) => ({ ...item, color: event.target.value }))
                }
                className="h-8 w-12 rounded border border-zinc-700 bg-zinc-950"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-zinc-400">
              <input
                type="checkbox"
                checked={selectedText.bold}
                onChange={(event) =>
                  mutateSelected((item) => ({ ...item, bold: event.target.checked }))
                }
                className="accent-indigo-500"
              />
              عريض
            </label>
            <button
              type="button"
              onClick={() => {
                const id = selectedText.id;
                update((draft) => {
                  draft.texts = draft.texts.filter((item) => item.id !== id);
                });
                onSelect(null);
              }}
              className="rounded-lg border border-rose-500/40 px-2.5 py-1 text-xs text-rose-300 transition-colors hover:bg-rose-500/10"
            >
              حذف
            </button>
          </div>
        </div>
      ) : state.texts.length > 0 ? (
        <p className="text-xs text-zinc-500">اختر نصاً من القائمة أعلاه لتعديله.</p>
      ) : null}
    </PanelShell>
  );
}

function BrushPanel({
  brushColor,
  setBrushColor,
  brushWidth,
  setBrushWidth,
  state,
  update,
}: {
  brushColor: string;
  setBrushColor: (value: string) => void;
  brushWidth: number;
  setBrushWidth: (value: number) => void;
  state: EditorState;
  update: (mutate: (draft: EditorState) => void, record?: boolean) => void;
}) {
  return (
    <PanelShell
      title="الفرشاة الحرة"
      description="ارسم على الصورة بحرية. يمكنك التراجع عن أي ضربة من الشريط العلوي."
    >
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          اللون
          <input
            type="color"
            value={brushColor}
            onChange={(event) => setBrushColor(event.target.value)}
            className="h-9 w-14 rounded border border-zinc-700 bg-zinc-950"
          />
        </label>
        <div className="grid h-9 w-9 place-items-center rounded-lg border border-zinc-700 bg-zinc-950">
          <span
            className="block rounded-full"
            style={{
              backgroundColor: brushColor,
              width: `${Math.max(3, brushWidth * 2.2)}px`,
              height: `${Math.max(3, brushWidth * 2.2)}px`,
            }}
          />
        </div>
      </div>
      <ToolSlider
        label="سماكة الفرشاة"
        value={brushWidth}
        min={0.3}
        max={6}
        step={0.1}
        suffix="%"
        onInput={() => undefined}
        onChange={setBrushWidth}
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() =>
            update((draft) => {
              draft.strokes = draft.strokes.slice(0, -1);
            })
          }
          disabled={state.strokes.length === 0}
          className="flex-1 rounded-xl border border-zinc-700 py-2 text-sm text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white disabled:opacity-40"
        >
          تراجع عن آخر ضربة
        </button>
        <button
          type="button"
          onClick={() =>
            update((draft) => {
              draft.strokes = [];
            })
          }
          disabled={state.strokes.length === 0}
          className="flex-1 rounded-xl border border-rose-500/40 py-2 text-sm text-rose-300 transition-colors hover:bg-rose-500/10 disabled:opacity-40"
        >
          مسح الكل
        </button>
      </div>
      <p className="text-xs text-zinc-500">
        عدد الضغطات المرسومة: {state.strokes.length}
      </p>
    </PanelShell>
  );
}
