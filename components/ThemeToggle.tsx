"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export default function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  const dark = mounted && resolvedTheme === "dark";
  return <button type="button" className="theme-toggle" aria-label="Toggle dark mode" aria-pressed={dark}
    title={dark ? "Switch to light mode" : "Switch to dark mode"}
    onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
    <Moon className="theme-moon" size={16} aria-hidden="true" />
    <Sun className="theme-sun" size={16} aria-hidden="true" />
  </button>;
}
