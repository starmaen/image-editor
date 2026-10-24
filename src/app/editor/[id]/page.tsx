import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Editor } from "@/components/Editor";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const projectId = Number.parseInt(id, 10);
  if (!Number.isFinite(projectId)) return { title: "المشروع غير موجود" };
  const [row] = await db
    .select({ title: projects.title })
    .from(projects)
    .where(eq(projects.id, projectId));
  return {
    title: row ? `تحرير: ${row.title} — استوديو الصور` : "المشروع غير موجود",
  };
}

export default async function EditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const projectId = Number.parseInt(id, 10);
  if (!Number.isFinite(projectId)) notFound();

  const [row] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId));
  if (!row) notFound();

  return (
    <Editor
      project={{
        id: row.id,
        title: row.title,
        originalData: row.originalData,
        previewData: row.previewData,
        width: row.width,
        height: row.height,
        state: row.state,
      }}
    />
  );
}
