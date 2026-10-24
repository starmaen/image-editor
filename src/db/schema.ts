import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { EditorState } from "@/lib/editor-types";

// المشاريع: كل مشروع يحمل الصورة الأصلية وحالة المحرر (JSON) لاستعادة التعديلات لاحقاً.
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  title: text("title").notNull().default("مشروع بدون عنوان"),
  // الصورة الأصلية بعد تصغيرها (data URL بصيغة JPEG)
  originalData: text("original_data").notNull(),
  // صورة مصغّرة لآخر نتيجة حفظ تُعرض في لوحة التحكم
  previewData: text("preview_data"),
  width: integer("width").notNull().default(0),
  height: integer("height").notNull().default(0),
  // حالة المحرر الكاملة (الفلاتر، القص، النصوص، الفرشاة...)
  state: jsonb("state").$type<EditorState>().notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// سجل الإصدارات: لقطة من حالة التحرير في كل مرة يُحفظ فيها المستخدم.
export const versions = pgTable(
  "versions",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    previewData: text("preview_data"),
    width: integer("width").notNull().default(0),
    height: integer("height").notNull().default(0),
    state: jsonb("state").$type<EditorState>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("versions_project_id_idx").on(table.projectId)],
);
