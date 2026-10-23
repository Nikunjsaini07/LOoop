"use client";

import { ThemeProvider as NextThemeProvider } from "next-themes";
import type { ReactNode } from "react";

export default function ThemeProvider({ children }: { children: ReactNode }) {
  return <NextThemeProvider attribute="class" defaultTheme="light" storageKey="readwell-theme" enableSystem={false} disableTransitionOnChange>
    {children}
  </NextThemeProvider>;
}
