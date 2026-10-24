import { db } from "@/db";
import { versions } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// سجل إصدارات مشروع معيّن (الأحدث أولاً)
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const projectId = Number.parseInt(id, 10);
  if (!Number.isFinite(projectId)) {
    return Response.json({ error: "معرّف غير صالح" }, { status: 400 });
  }
  try {
    const rows = await db
      .select({
        id: versions.id,
        previewData: versions.previewData,
        width: versions.width,
        height: versions.height,
        state: versions.state,
        createdAt: versions.createdAt,
      })
      .from(versions)
      .where(eq(versions.projectId, projectId))
      .orderBy(desc(versions.createdAt))
      .limit(40);
    return Response.json({ versions: rows });
  } catch (error) {
    console.error("فشل جلب الإصدارات", error);
    return Response.json({ error: "فشل جلب الإصدارات" }, { status: 500 });
  }
}
