import { db } from "@/db";
import { projects } from "@/db/schema";
import { desc } from "drizzle-orm";
import { ProjectCard } from "@/components/ProjectCard";
import { UploadZone } from "@/components/UploadZone";
import { formatDate, type ProjectSummary } from "@/lib/project-types";

export const dynamic = "force-dynamic";

const FEATURES = [
  { icon: "🎛️", title: "فلاتر ومرشحات", desc: "سطوح وتباين وتشبع وضبابية بلمسة" },
  { icon: "✂️", title: "قص وتحويل", desc: "قص بالنسب وتدوير وقلب دقيق" },
  { icon: "🔤", title: "نصوص وفرشاة", desc: "أضف نصوصاً وارسم بحرية على الصورة" },
  { icon: "✨", title: "تحسين ذكي", desc: "تحليل تلقائي للصورة وتحسين إعداداتها" },
];

export default async function HomePage() {
  const rows = (await db
    .select({
      id: projects.id,
      title: projects.title,
      previewData: projects.previewData,
      width: projects.width,
      height: projects.height,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .orderBy(desc(projects.updatedAt))).map((row) => ({
      ...row,
      updatedAtLabel: formatDate(row.updatedAt),
    })) as ProjectSummary[];

  const lastUpdate = rows[0]?.updatedAt;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
      <header className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-xl shadow-lg shadow-indigo-950/40">
              🎨
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                استوديو الصور
              </h1>
              <p className="text-sm text-zinc-400">خدمة تعديل الصور بالذكاء الاصطناعي</p>
            </div>
          </div>
          <span className="hidden rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300 sm:inline-block">
            ✨ تحسين ذكي تلقائي
          </span>
        </div>

        <section className="rounded-3xl border border-zinc-800 bg-gradient-to-l from-zinc-900 via-zinc-900 to-indigo-950/40 p-6 sm:p-8">
          <h2 className="text-[clamp(1.5rem,4vw,2.25rem)] font-bold leading-tight text-white">
            حرّر صورك باحترافية
            <br />
            <span className="bg-gradient-to-l from-indigo-400 to-violet-400 bg-clip-text text-transparent">
              مباشرة من المتصفح
            </span>
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-zinc-400 sm:text-base">
            ارفع صورة وابدأ التحرير فوراً: فلاتر، قص، تدوير، نصوص، فرشاة، وتحسين
            ذكي يحلل الصورة ويعدّل إعداداتها تلقائياً. كل تعديل يُحفظ في سجل
            الإصدارات لتعود إليه وقتما تشاء.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-zinc-400">
            <span className="rounded-lg bg-zinc-800/80 px-3 py-1.5">
              📁 {rows.length} مشروع
            </span>
            {lastUpdate ? (
              <span className="rounded-lg bg-zinc-800/80 px-3 py-1.5">
                🕒 آخر تحديث: {formatDate(lastUpdate)}
              </span>
            ) : null}
          </div>
        </section>
      </header>

      <section className="mt-8">
        <UploadZone />
      </section>

      <section className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((feature) => (
          <div
            key={feature.title}
            className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4"
          >
            <div className="text-2xl">{feature.icon}</div>
            <h3 className="mt-2 font-semibold text-zinc-100">{feature.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">
              {feature.desc}
            </p>
          </div>
        ))}
      </section>

      <section className="mt-12">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">مشاريعي</h2>
          {rows.length > 0 ? (
            <span className="text-sm text-zinc-500">{rows.length} عنصر</span>
          ) : null}
        </div>
        {rows.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-zinc-800 p-12 text-center">
            <p className="text-4xl">📷</p>
            <p className="mt-3 font-medium text-zinc-300">لا توجد مشاريع بعد</p>
            <p className="mt-1 text-sm text-zinc-500">
              ارفع أول صورة من الأعلى لتبدأ التحرير
            </p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </section>

      <footer className="mt-16 border-t border-zinc-800 pt-6 text-center text-xs text-zinc-600">
        استوديو الصور — محرر صور كامل يعمل داخل المتصفح مع حفظ سحابي للمشاريع.
      </footer>
    </main>
  );
}
