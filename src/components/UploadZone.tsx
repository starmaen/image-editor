"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { prepareUpload } from "@/lib/render";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 ميجابايت قبل المعالجة

export function UploadZone() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      if (!file.type.startsWith("image/")) {
        setError("الملف المختار ليس صورة");
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        setError("حجم الصورة يجب أن يكون أقل من 20 ميجابايت");
        return;
      }
      setBusy(true);
      try {
        const prepared = await prepareUpload(file);
        const response = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: file.name.replace(/\.[^.]+$/, "") || "مشروع جديد",
            originalData: prepared.dataUrl,
            width: prepared.width,
            height: prepared.height,
          }),
        });
        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(data?.error ?? "فشل رفع الصورة");
        }
        const { id } = (await response.json()) as { id: number };
        router.push(`/editor/${id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "حدث خطأ غير متوقع");
        setBusy(false);
      }
    },
    [router],
  );

  // لصق صورة من الحافظة
  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const file = Array.from(event.clipboardData?.files ?? [])[0];
      if (file) {
        event.preventDefault();
        void handleFile(file);
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [handleFile]);

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files?.[0];
        if (file) void handleFile(file);
      }}
      className={`relative rounded-3xl border-2 border-dashed p-8 text-center transition-colors sm:p-12 ${
        dragging
          ? "border-indigo-400 bg-indigo-500/10"
          : "border-zinc-700 bg-zinc-900/60 hover:border-zinc-500"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void handleFile(file);
        }}
      />
      <div className="flex flex-col items-center gap-4">
        <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-3xl shadow-lg shadow-indigo-950/40">
          {busy ? (
            <span className="animate-spin text-2xl">⏳</span>
          ) : (
            <span>🖼️</span>
          )}
        </div>
        <div>
          <p className="text-lg font-semibold text-zinc-100">
            {busy ? "جاري تجهيز الصورة..." : "اسحب صورة وأفلتها هنا"}
          </p>
          <p className="mt-1 text-sm text-zinc-400">
            أو الصق من الحافظة (Ctrl+V) — PNG، JPG، WEBP حتى 20 ميجابايت
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          اختيار صورة
        </button>
        {error ? (
          <p className="rounded-lg bg-rose-500/10 px-3 py-1.5 text-sm text-rose-300">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
