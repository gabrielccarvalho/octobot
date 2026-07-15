"use client"

import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import { Icon } from "@/components/icon"
import { useMounted } from "@/lib/use-mounted"

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const mounted = useMounted()

  const isDark = resolvedTheme === "dark"

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={mounted ? (isDark ? "Switch to light mode" : "Switch to dark mode") : "Toggle theme"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {mounted ? (
        <Icon name={isDark ? "Sun03Icon" : "Moon02Icon"} className="size-4" />
      ) : (
        <span className="size-4" />
      )}
    </Button>
  )
}
