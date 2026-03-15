import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "レシート管理",
  description: "領収書・請求書の自動仕分け管理",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="bg-gray-50 min-h-screen antialiased">{children}</body>
    </html>
  );
}
