import { db } from "@/db";
import { projects, versions } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import type { EditorState } from "@/lib/editor-types";

export const dynamic = "force-dynamic";

// قائمة المشاريع (بدون بيانات الصورة الأصلية الثقيلة)
export async function GET() {
  try {
    const rows = await db
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
      .orderBy(desc(projects.updatedAt));
    return Response.json({ projects: rows });
  } catch (error) {
    console.error("فشل جلب المشاريع", error);
    return Response.json({ error: "فشل جلب المشاريع" }, { status: 500 });
  }
}

// إنشاء مشروع جديد من صورة مرفوعة
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      title?: string;
      originalData?: string;
      width?: number;
      height?: number;
      state?: EditorState;
    };

    if (
      typeof body.originalData !== "string" ||
      !body.originalData.startsWith("data:image/")
    ) {
      return Response.json({ error: "صورة غير صالحة" }, { status: 400 });
    }
    if (body.originalData.length > 16_000_000) {
      return Response.json({ error: "حجم الصورة كبير جداً" }, { status: 413 });
    }

    const [row] = await db
      .insert(projects)
      .values({
        title: body.title?.trim() || "مشروع بدون عنوان",
        originalData: body.originalData,
        previewData: body.originalData,
        width: Math.round(body.width ?? 0),
        height: Math.round(body.height ?? 0),
        state: body.state,
      })
      .returning({ id: projects.id });

    return Response.json({ id: row.id }, { status: 201 });
  } catch (error) {
    console.error("فشل إنشاء المشروع", error);
    return Response.json({ error: "فشل إنشاء المشروع" }, { status: 500 });
  }
}
