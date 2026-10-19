import type { Metadata } from "next";
import "./globals.css";
import "./library.css";
import "./article.css";

export const metadata: Metadata = {
  title: "Longreads — Engineering, without the noise",
  description: "Engineering stories from the companies building what comes next. Follow companies, shape your own feed, and save something worth reading.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
