import { CalendarIcon, StoreIcon } from "lucide-react"

import { ModeToggle } from "@/components/mode-toggle"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import type { Resume } from "@/lib/story"
import { fmtDate } from "@/lib/story"

export function SiteHeader({ resume }: { resume: Resume }) {
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <StoreIcon className="size-4 text-muted-foreground" />
        <h1 className="text-base font-medium">
          {resume.libelle_rayon}
          <span className="text-muted-foreground"> · Story mode</span>
        </h1>
        <Badge variant="outline" className="ml-2 gap-1">
          <CalendarIcon />
          {fmtDate(resume.jour)}
        </Badge>
        {resume.baseline ? (
          <Badge className="bg-violet-500/15 text-violet-600 border border-violet-500/40 dark:text-violet-300">
            Baseline — import de référence
          </Badge>
        ) : (
          <Badge className="bg-emerald-500/15 text-emerald-600 border border-emerald-500/40 dark:text-emerald-300">
            Import n°{resume.nb_import} traité
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="secondary" className="tabular-nums">
            {resume.nb_articles.toLocaleString("fr-FR")} articles
          </Badge>
          <ModeToggle />
        </div>
      </div>
    </header>
  )
}
