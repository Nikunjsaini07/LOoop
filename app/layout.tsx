import type { Metadata } from "next";
import "./globals.css";
import "./library.css";
import "./article.css";
import "./community.css";
import "./auth.css";
import AuthProvider from "@/components/AuthProvider";
import ThemeProvider from "@/components/ThemeProvider";
import "./theme.css";
import "./product.css";

export const metadata: Metadata = {
  title: "Readwell — Engineering, without the noise",
  description: "Engineering blogs from the companies building what comes next. Follow companies, shape your own feed, and save something worth reading.",
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
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        {/* One decorative asset across routes, with no additional client component. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="site-sky" src="/reference/sky.jpg" alt="" aria-hidden="true" width={1920} height={1280} fetchPriority="high" decoding="async" />
        <ThemeProvider><AuthProvider>{children}</AuthProvider></ThemeProvider>
      </body>
    </html>
  );
}
