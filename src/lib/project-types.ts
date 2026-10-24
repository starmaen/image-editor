export type ProjectSummary = {
  id: number;
  title: string;
  previewData: string | null;
  width: number;
  height: number;
  createdAt: Date;
  updatedAt: Date;
  /** تاريخ منسّق مسبقاً على الخادم لتجنب اختلاف الترطيب */
  updatedAtLabel: string;
};

export type ProjectVersion = {
  id: number;
  previewData: string | null;
  width: number;
  height: number;
  state: unknown;
  createdAt: Date;
};

/** تنسيق التاريخ بالعربية. */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}
