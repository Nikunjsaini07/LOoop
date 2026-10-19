import type { Metadata } from "next";
import "./globals.css";
import "./library.css";
import "./article.css";

export const metadata: Metadata = {
  title: "readzz — Engineering, without the noise",
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
      <body className="antialiased">
        {/* One decorative asset across routes, with no additional client component. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="site-sky" src="/reference/sky.jpg" alt="" aria-hidden="true" width={1920} height={1280} fetchPriority="high" decoding="async" />
        {children}
      </body>
    </html>
  );
}
