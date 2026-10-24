import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "استوديو الصور — تحرير الصور بالذكاء الاصطناعي",
  description:
    "خدمة تعديل الصور: فلاتر، قص، تدوير، نصوص، فرشاة، وتحسين ذكي تلقائي للصور.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
        {children}
      </body>
    </html>
  );
}
