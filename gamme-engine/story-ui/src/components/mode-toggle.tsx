import { MoonIcon, SunIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

// Pattern officiel shadcn/ui — Dark Mode (Vite) : https://ui.shadcn.com/docs/dark-mode/vite
export function ModeToggle() {
  const setTheme = (theme: string) => {
    document.documentElement.classList.toggle("dark", theme === "dark")
    localStorage.setItem("vite-ui-theme", theme)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <SunIcon className="size-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
          <MoonIcon className="absolute size-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
          <span className="sr-only">Changer de thème</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>Clair</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>Sombre</DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            const dark = window.matchMedia("(prefers-color-scheme: dark)").matches
            document.documentElement.classList.toggle("dark", dark)
            localStorage.removeItem("vite-ui-theme")
          }}
        >
          Système
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
