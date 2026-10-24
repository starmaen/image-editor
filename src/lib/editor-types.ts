// الأنواع المشتركة لحالة محرر الصور بين العميل والخادم.

export type Adjustments = {
  /** السطوع بالنسبة المئوية (100 = طبيعي) */
  brightness: number;
  /** التباين بالنسبة المئوية (100 = طبيعي) */
  contrast: number;
  /** التشبع بالنسبة المئوية (100 = طبيعي) */
  saturation: number;
  /** تدوير درجة اللون بالدرجات */
  hue: number;
  /** الضبابية كنسبة مئوية من عرض الصورة (0 - 8) */
  blur: number;
  /** السيبيا بالنسبة المئوية (0 - 100) */
  sepia: number;
  /** التدرج الرمادي بالنسبة المئوية (0 - 100) */
  grayscale: number;
  /** العكس بالنسبة المئوية (0 - 100) */
  invert: number;
};

export type TextItem = {
  id: string;
  text: string;
  /** إحداثيات معيارية (0 - 1) بالنسبة للوحة الناتجة */
  x: number;
  y: number;
  /** حجم الخط كنسبة من عرض اللوحة */
  size: number;
  color: string;
  bold: boolean;
};

export type Stroke = {
  id: string;
  color: string;
  /** سماكة الفرشاة كنسبة من عرض اللوحة */
  width: number;
  points: { x: number; y: number }[];
};

export type CropRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type EditorState = {
  adjustments: Adjustments;
  /** الدوران بزوايا قائمة: 0 | 90 | 180 | 270 */
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  /** مستطيل القص بإحداثيات معيارية */
  crop: CropRect;
  /** معامل تكبير/تصغير حجم الإخراج */
  scale: number;
  texts: TextItem[];
  strokes: Stroke[];
};

export const DEFAULT_ADJUSTMENTS: Adjustments = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  hue: 0,
  blur: 0,
  sepia: 0,
  grayscale: 0,
  invert: 0,
};

export const DEFAULT_CROP: CropRect = { x: 0, y: 0, w: 1, h: 1 };

export function createDefaultState(): EditorState {
  return {
    adjustments: { ...DEFAULT_ADJUSTMENTS },
    rotation: 0,
    flipH: false,
    flipV: false,
    crop: { ...DEFAULT_CROP },
    scale: 1,
    texts: [],
    strokes: [],
  };
}

/** يدمج حالة قادمة من قاعدة البيانات مع القيم الافتراضية لحماية ضد الحقول الناقصة. */
export function normalizeState(input: unknown): EditorState {
  const base = createDefaultState();
  if (!input || typeof input !== "object") return base;
  const raw = input as Partial<EditorState>;
  return {
    adjustments: { ...base.adjustments, ...(raw.adjustments ?? {}) },
    rotation: [0, 90, 180, 270].includes(raw.rotation ?? 0)
      ? (raw.rotation as number)
      : 0,
    flipH: raw.flipH ?? false,
    flipV: raw.flipV ?? false,
    crop: {
      x: clamp01(raw.crop?.x ?? 0),
      y: clamp01(raw.crop?.y ?? 0),
      w: clamp01(raw.crop?.w ?? 1) || 1,
      h: clamp01(raw.crop?.h ?? 1) || 1,
    },
    scale: clamp(raw.scale ?? 1, 0.05, 4),
    texts: Array.isArray(raw.texts) ? raw.texts : [],
    strokes: Array.isArray(raw.strokes) ? raw.strokes : [],
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export type Preset = {
  id: string;
  name: string;
  icon: string;
  adjustments: Partial<Adjustments>;
};

/** مرشحات جاهزة تُطبّق بنقرة واحدة. */
export const PRESETS: Preset[] = [
  {
    id: "original",
    name: "أصلي",
    icon: "🖼️",
    adjustments: { ...DEFAULT_ADJUSTMENTS },
  },
  {
    id: "vivid",
    name: "حيوي",
    icon: "🌈",
    adjustments: {
      brightness: 105,
      contrast: 112,
      saturation: 145,
      hue: 0,
      blur: 0,
      sepia: 0,
      grayscale: 0,
      invert: 0,
    },
  },
  {
    id: "bw",
    name: "أبيض وأسود",
    icon: "⚫",
    adjustments: {
      brightness: 102,
      contrast: 118,
      saturation: 100,
      hue: 0,
      blur: 0,
      sepia: 0,
      grayscale: 100,
      invert: 0,
    },
  },
  {
    id: "sepia",
    name: "سيبيا",
    icon: "📜",
    adjustments: {
      brightness: 106,
      contrast: 105,
      saturation: 100,
      hue: 0,
      blur: 0,
      sepia: 85,
      grayscale: 0,
      invert: 0,
    },
  },
  {
    id: "warm",
    name: "دافئ",
    icon: "🌅",
    adjustments: {
      brightness: 106,
      contrast: 104,
      saturation: 118,
      hue: -12,
      blur: 0,
      sepia: 0,
      grayscale: 0,
      invert: 0,
    },
  },
  {
    id: "cool",
    name: "بارد",
    icon: "❄️",
    adjustments: {
      brightness: 103,
      contrast: 106,
      saturation: 112,
      hue: 14,
      blur: 0,
      sepia: 0,
      grayscale: 0,
      invert: 0,
    },
  },
  {
    id: "drama",
    name: "دراما",
    icon: "🎭",
    adjustments: {
      brightness: 94,
      contrast: 142,
      saturation: 88,
      hue: 0,
      blur: 0,
      sepia: 0,
      grayscale: 0,
      invert: 0,
    },
  },
  {
    id: "fade",
    name: "هادي",
    icon: "🌫️",
    adjustments: {
      brightness: 110,
      contrast: 88,
      saturation: 82,
      hue: 0,
      blur: 0,
      sepia: 0,
      grayscale: 0,
      invert: 0,
    },
  },
  {
    id: "noir",
    name: "نوار",
    icon: "🎬",
    adjustments: {
      brightness: 92,
      contrast: 155,
      saturation: 100,
      hue: 0,
      blur: 0,
      sepia: 0,
      grayscale: 100,
      invert: 0,
    },
  },
  {
    id: "dream",
    name: "حالم",
    icon: "💭",
    adjustments: {
      brightness: 108,
      contrast: 92,
      saturation: 115,
      hue: 8,
      blur: 0.012,
      sepia: 0,
      grayscale: 0,
      invert: 0,
    },
  },
];
