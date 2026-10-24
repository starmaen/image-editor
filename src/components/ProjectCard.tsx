"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { type ProjectSummary } from "@/lib/project-types";

export function ProjectCard({ project }: { project: ProjectSummary }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!window.confirm(`هل تريد حذف "${project.title}" نهائياً؟`)) return;
    setDeleting(true);
    try {
      await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
      router.refresh();
    } catch {
      setDeleting(false);
      window.alert("فشل حذف المشروع");
    }
  }

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/70 transition-colors hover:border-zinc-600">
      <div className="checkerboard relative aspect-[4/3] w-full overflow-hidden border-b border-zinc-800">
        {project.previewData ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={project.previewData}
            alt={project.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="grid h-full place-items-center text-4xl">🖼️</div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="truncate font-semibold text-zinc-100" title={project.title}>
            {project.title}
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            {project.width} × {project.height} بكسل ·{" "}
            {project.updatedAtLabel}
          </p>
        </div>
        <div className="mt-auto flex items-center gap-2">
          <Link
            href={`/editor/${project.id}`}
            className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 text-center text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
          >
            تحرير
          </Link>
          {project.previewData ? (
            <a
              href={project.previewData}
              download={`${project.title}.jpg`}
              className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
              title="تنزيل"
            >
              ⬇️
            </a>
          ) : null}
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-rose-300 transition-colors hover:border-rose-500/60 hover:bg-rose-500/10 disabled:opacity-50"
            title="حذف"
          >
            {deleting ? "..." : "🗑️"}
          </button>
        </div>
      </div>
    </article>
  );
}
