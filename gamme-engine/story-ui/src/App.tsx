import * as React from "react"
import { CircleAlertIcon, ShieldAlertIcon } from "lucide-react"

import { AppSidebar } from "@/components/app-sidebar"
import { ChartAreaInteractive } from "@/components/chart-area-interactive"
import { ChartBarHorizontal } from "@/components/chart-bar-horizontal"
import { ChartBarNegative } from "@/components/chart-bar-negative"
import { ChartBarStacked } from "@/components/chart-bar-stacked"
import { ChartMixedPRMP } from "@/components/chart-mixed-prmp"
import { ChartPieDonutText } from "@/components/chart-pie-donut-text"
import { ChartTreemap } from "@/components/chart-treemap"
import { DataTable } from "@/components/data-table"
import { SectionCards } from "@/components/section-cards"
import { SiteHeader } from "@/components/site-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import {
  fetchJours,
  fetchStory,
  type JoursData,
  type StoryData,
} from "@/lib/story"

const TYPE_LABELS: Record<string, string> = {
  chute_forte: "Chute forte",
  hausse_forte: "Hausse forte",
  marge_negative: "Marge négative",
  promo_active: "Promo active",
}

function useQuery() {
  const params = new URLSearchParams(window.location.search)
  return {
    jour: params.get("jour"),
    rayon: params.get("rayon") ?? "epicerie-salee",
  }
}

export default function App() {
  const { jour: jourParam, rayon } = useQuery()
  const [jours, setJours] = React.useState<JoursData | null>(null)
  const [story, setStory] = React.useState<StoryData | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [reload, setReload] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    fetchJours(rayon)
      .then((d) => {
        if (!cancelled) setJours(d)
      })
      .catch(() => {
        if (!cancelled) setJours({ ok: false, rayon, libelle_rayon: rayon, jours: [] })
      })
    return () => {
      cancelled = true
    }
  }, [rayon, reload])

  const jour = jourParam ?? jours?.jours[0]?.jour ?? null

  React.useEffect(() => {
    if (!jour) return
    let cancelled = false
    setStory(null)
    setError(null)
    fetchStory(jour, rayon)
      .then((d) => {
        if (!cancelled) setStory(d)
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [jour, rayon, reload])

  const refresh = () => setReload((r) => r + 1)
  const [palette, setPalette] = React.useState("default")
  React.useEffect(() => {
    const root = document.documentElement
    if (palette === "tangerine") {
      root.style.setProperty("--chart-1", "#ff6b35")
      root.style.setProperty("--chart-2", "#004e89")
      root.style.setProperty("--chart-3", "#00a896")
      root.style.setProperty("--chart-4", "#ffb703")
      root.style.setProperty("--chart-5", "#6a4c93")
    } else if (palette === "brutalist") {
      root.style.setProperty("--chart-1", "#000000")
      root.style.setProperty("--chart-2", "#ff3b30")
      root.style.setProperty("--chart-3", "#ffcc02")
      root.style.setProperty("--chart-4", "#5856d6")
      root.style.setProperty("--chart-5", "#4cd964")
    } else if (palette === "soft-pop") {
      root.style.setProperty("--chart-1", "#6366f1")
      root.style.setProperty("--chart-2", "#ec4899")
      root.style.setProperty("--chart-3", "#14b8a6")
      root.style.setProperty("--chart-4", "#f59e0b")
      root.style.setProperty("--chart-5", "#8b5cf6")
    } else {
      root.style.removeProperty("--chart-1")
      root.style.removeProperty("--chart-2")
      root.style.removeProperty("--chart-3")
      root.style.removeProperty("--chart-4")
      root.style.removeProperty("--chart-5")
    }
  }, [palette])

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar jours={jours} rayon={rayon} jour={jour ?? ""} variant="inset" />
      <SidebarInset>
        {story ? (
          <div className="flex flex-col">
            <SiteHeader resume={story.resume} />
            <div className="flex items-center gap-2 px-4 py-2 lg:px-6 border-b bg-muted/20">
              <span className="text-sm text-muted-foreground">Palette:</span>
              <select
                value={palette}
                onChange={(e) => setPalette(e.target.value)}
                className="h-8 rounded-md border bg-background px-2 text-sm"
              >
                <option value="default">Défaut sim</option>
                <option value="tangerine">Tangerine</option>
                <option value="brutalist">Brutalist</option>
                <option value="soft-pop">Soft-pop</option>
              </select>
            </div>
          </div>
        ) : (
          <div className="flex h-12 items-center gap-2 border-b px-4 lg:px-6">
            <Skeleton className="h-6 w-64" />
          </div>
        )}
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            {error ? (
              <div className="flex flex-col items-center gap-4 px-4 py-16 lg:px-6">
                <Alert variant="destructive" className="max-w-lg">
                  <CircleAlertIcon />
                  <AlertTitle>Rapport indisponible</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
                <Button variant="outline" size="sm" onClick={refresh}>
                  Réessayer
                </Button>
              </div>
            ) : !story ? (
              <div className="flex flex-col gap-6 px-4 py-6 lg:px-6">
                <div className="grid grid-cols-2 gap-4 @xl/main:grid-cols-3 @7xl/main:grid-cols-6">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-32 rounded-xl" />
                  ))}
                </div>
                <Skeleton className="h-72 rounded-xl" />
                <div className="grid gap-4 md:grid-cols-2">
                  <Skeleton className="h-72 rounded-xl" />
                  <Skeleton className="h-72 rounded-xl" />
                </div>
                <Skeleton className="h-96 rounded-xl" />
              </div>
            ) : (
              <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
                <SectionCards resume={story.resume} serie={story.serie_jours} />
                <div className="px-4 lg:px-6">
                  <ChartAreaInteractive serie={story.serie_jours} />
                </div>
                <div className="grid grid-cols-1 gap-4 px-4 md:grid-cols-2 lg:px-6">
                  <ChartPieDonutText resume={story.resume} />
                  <ChartBarNegative data={story.top_neg} />
                </div>
                {(story as any).serie_prmp && (
                  <div className="px-4 lg:px-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>Trajectoire PRMP & Négatifs (90j)</CardTitle>
                        <CardDescription>
                          Capital bloqué (FDJ) vs nombre de négatifs — mix area + line animé 400ms
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ChartMixedPRMP serie={story.serie_prmp as any} />
                      </CardContent>
                    </Card>
                  </div>
                )}
                {(story as any).treemap_fournisseurs && (
                  <div className="px-4 lg:px-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>Valeur stock par fournisseur (Top 10)</CardTitle>
                        <CardDescription>Treemap — taille = PRMP</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ChartTreemap data={(story as any).treemap_fournisseurs} />
                      </CardContent>
                    </Card>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-4 px-4 md:grid-cols-2 lg:px-6">
                  <ChartBarHorizontal data={story.top_neg} />
                  <ChartBarStacked serie={story.serie_anomalies} />
                </div>
                <div id="anomalies" className="px-4 lg:px-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <ShieldAlertIcon className="size-4" />
                        Anomalies du jour — détail
                      </CardTitle>
                      <CardDescription>
                        {story.resume.anomalies.toLocaleString("fr-FR")} anomalie(s)
                        détectée(s) lors de l'import
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {story.anomalies.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Aucune anomalie ce jour.
                        </p>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {story.anomalies.slice(0, 20).map((a, i) => (
                            <div
                              key={i}
                              className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm"
                            >
                              <Badge variant="outline">
                                {TYPE_LABELS[a.type] ?? a.type}
                              </Badge>
                              {a.code ? (
                                <span className="font-mono text-xs text-muted-foreground">
                                  #{a.code}
                                </span>
                              ) : null}
                              <span className="text-muted-foreground">
                                {a.description}
                              </span>
                            </div>
                          ))}
                          {story.anomalies.length > 20 && (
                            <p className="text-sm text-muted-foreground">
                              + {story.anomalies.length - 20} autres…
                            </p>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
                <div id="negatifs">
                  <DataTable
                    data={[...story.negatifs, ...story.corriges] as never[]}
                  />
                </div>
                <Separator />
                <p className="pb-8 text-center text-xs text-muted-foreground">
                  Généré par gamme-engine · Rayon « {story.resume.libelle_rayon} » ·
                  Import n°{story.resume.nb_import}
                </p>
              </div>
            )}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
