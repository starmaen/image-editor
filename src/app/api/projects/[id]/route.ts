import { db } from "@/db";
import { projects, versions } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { EditorState } from "@/lib/editor-types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

async function parseId(params: Params["params"]): Promise<number | null> {
  const { id } = await params;
  const parsed = Number.parseInt(id, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

// جلب مشروع واحد كامل (بما في ذلك الصورة الأصلية) لفتحه في المحرر
export async function GET(_request: Request, { params }: Params) {
  const id = await parseId(params);
  if (id === null) {
    return Response.json({ error: "معرّف غير صالح" }, { status: 400 });
  }
  try {
    const [row] = await db.select().from(projects).where(eq(projects.id, id));
    if (!row) {
      return Response.json({ error: "المشروع غير موجود" }, { status: 404 });
    }
    return Response.json({ project: row });
  } catch (error) {
    console.error("فشل جلب المشروع", error);
    return Response.json({ error: "فشل جلب المشروع" }, { status: 500 });
  }
}

// حفظ حالة المحرر + إنشاء إصدار جديد في السجل
export async function PATCH(request: Request, { params }: Params) {
  const id = await parseId(params);
  if (id === null) {
    return Response.json({ error: "معرّف غير صالح" }, { status: 400 });
  }
  try {
    const body = (await request.json()) as {
      title?: string;
      previewData?: string | null;
      width?: number;
      height?: number;
      state?: EditorState;
    };

    const [row] = await db
      .update(projects)
      .set({
        title: body.title?.trim() || undefined,
        previewData: body.previewData ?? undefined,
        width: body.width !== undefined ? Math.round(body.width) : undefined,
        height: body.height !== undefined ? Math.round(body.height) : undefined,
        state: body.state ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, id))
      .returning({ id: projects.id });

    if (!row) {
      return Response.json({ error: "المشروع غير موجود" }, { status: 404 });
    }

    // لقطة إصدار جديدة في كل حفظ
    await db.insert(versions).values({
      projectId: id,
      previewData: body.previewData ?? null,
      width: body.width !== undefined ? Math.round(body.width) : 0,
      height: body.height !== undefined ? Math.round(body.height) : 0,
      state: body.state,
    });

    return Response.json({ ok: true });
  } catch (error) {
    console.error("فشل حفظ المشروع", error);
    return Response.json({ error: "فشل حفظ المشروع" }, { status: 500 });
  }
}

// حذف مشروع (يحذف إصداراته تلقائياً عبر ON DELETE CASCADE)
export async function DELETE(_request: Request, { params }: Params) {
  const id = await parseId(params);
  if (id === null) {
    return Response.json({ error: "معرّف غير صالح" }, { status: 400 });
  }
  try {
    await db.delete(projects).where(eq(projects.id, id));
    return Response.json({ ok: true });
  } catch (error) {
    console.error("فشل حذف المشروع", error);
    return Response.json({ error: "فشل حذف المشروع" }, { status: 500 });
  }
}
