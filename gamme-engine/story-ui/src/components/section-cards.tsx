"use client"

import {
  ArrowDownRightIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  MinusIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { Resume, SerieJour } from "@/lib/story"

function Trend({ value, invert = false }: { value: number | null; invert?: boolean }) {
  if (value === null || value === 0) {
    return (
      <Badge variant="outline">
        <MinusIcon />
        stable
      </Badge>
    )
  }
  const up = value > 0
  const good = invert ? !up : up
  const Icon = up ? (good ? TrendingUpIcon : ArrowUpRightIcon) : good ? TrendingDownIcon : ArrowDownRightIcon
  return (
    <Badge variant="outline">
      <Icon />
      {up ? "+" : ""}
      {value}
    </Badge>
  )
}

export function SectionCards({
  resume,
  serie,
}: {
  resume: Resume
  serie: SerieJour[]
}) {
  const prev =
    serie.length >= 2
      ? serie[serie.length - 2]
      : null
  const d = (key: "nouveaux" | "persistants" | "corriges") =>
    prev ? (resume[key] ?? 0) - (prev[key] ?? 0) : null

  const cards: {
    label: string
    value: string
    trend: React.ReactNode
    trendLabel: string
    footer: string
  }[] = [
    {
      label: "Nouveaux négatifs",
      value: resume.nouveaux.toLocaleString("fr-FR"),
      trend: <Trend value={d("nouveaux")} invert />,
      trendLabel: "vs veille",
      footer: "Articles passés en stock négatif aujourd'hui",
    },
    {
      label: "Négatifs persistants",
      value: resume.persistants.toLocaleString("fr-FR"),
      trend: <Trend value={d("persistants")} invert />,
      trendLabel: "vs veille",
      footer: `${resume.critiques.toLocaleString("fr-FR")} critiques · ${resume.importants.toLocaleString("fr-FR")} importants`,
    },
    {
      label: "Corrigés aujourd'hui",
      value: resume.corriges.toLocaleString("fr-FR"),
      trend: <Trend value={d("corriges")} />,
      trendLabel: "vs veille",
      footer: "Stocks redevenus positifs",
    },
    {
      label: "Anomalies détectées",
      value: resume.anomalies.toLocaleString("fr-FR"),
      trend: <ArrowRightIcon className="size-4 text-muted-foreground" />,
      trendLabel: "détail plus bas",
      footer: "Marges négatives, chutes/hausses, promos",
    },
    {
      label: "Avec compensateur",
      value: resume.avec_compensateur.toLocaleString("fr-FR"),
      trend: <ArrowRightIcon className="size-4 text-muted-foreground" />,
      trendLabel: "proposés par le LLM",
      footer: "Alternatives trouvées dans la gamme",
    },
    {
      label: "Sans compensateur",
      value: resume.sans_compensateur.toLocaleString("fr-FR"),
      trend: <ArrowRightIcon className="size-4 text-muted-foreground" />,
      trendLabel: "à traiter",
      footer: "Aucun équivalent identifié",
    },
  ]

  return (
    <div
      id="vue-jour"
      className="grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-3 @7xl/main:grid-cols-6 dark:*:data-[slot=card]:bg-card"
    >
      {cards.map((c) => (
        <Card key={c.label} className="@container/card">
          <CardHeader>
            <CardDescription>{c.label}</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {c.value}
            </CardTitle>
            <CardAction>
              {c.trend}
            </CardAction>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 text-sm">
            <div className="line-clamp-1 flex gap-2 font-medium">
              {c.trendLabel}
            </div>
            <div className="text-muted-foreground">{c.footer}</div>
          </CardFooter>
        </Card>
      ))}
    </div>
  )
}
