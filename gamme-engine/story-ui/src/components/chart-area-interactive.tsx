"use client"

import * as React from "react"
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts"

import { useIsMobile } from "@/hooks/use-mobile"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group"
import type { SerieJour } from "@/lib/story"
import { fmtDateShort } from "@/lib/story"

export const description = "Évolution quotidienne des stocks négatifs"

const chartConfig = {
  total: {
    label: "Négatifs (hors corrigés)",
    color: "var(--chart-1)",
  },
  nouveaux: {
    label: "Nouveaux",
    color: "var(--chart-2)",
  },
  persistants: {
    label: "Persistants",
    color: "var(--chart-4)",
  },
  critiques: {
    label: "Critiques",
    color: "var(--chart-5)",
  },
  corriges: {
    label: "Corrigés",
    color: "var(--chart-3)",
  },
} satisfies ChartConfig

export function ChartAreaInteractive({ serie }: { serie: SerieJour[] }) {
  const isMobile = useIsMobile()
  const [timeRange, setTimeRange] = React.useState("90d")

  React.useEffect(() => {
    if (isMobile) {
      setTimeRange("7d")
    }
  }, [isMobile])

  const lastJour = serie.length ? serie[serie.length - 1].jour : "2026-01-01"
  const filteredData = serie.filter((item) => {
    const date = new Date(item.jour + "T00:00:00")
    const referenceDate = new Date(lastJour + "T00:00:00")
    let daysToSubtract = 90
    if (timeRange === "30d") {
      daysToSubtract = 30
    } else if (timeRange === "7d") {
      daysToSubtract = 7
    }
    const startDate = new Date(referenceDate)
    startDate.setDate(startDate.getDate() - daysToSubtract)
    return date >= startDate
  })

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Articles en stock négatif — évolution quotidienne</CardTitle>
        <CardDescription>
          <span className="hidden @[540px]/card:block">
            Nombre d'articles négatifs par jour, par statut
          </span>
          <span className="@[540px]/card:hidden">Par jour et par statut</span>
        </CardDescription>
        <CardAction>
          <ToggleGroup
            type="single"
            value={timeRange}
            onValueChange={setTimeRange}
            variant="outline"
            className="hidden *:data-[slot=toggle-group-item]:px-4! @[767px]/card:flex"
          >
            <ToggleGroupItem value="90d">3 mois</ToggleGroupItem>
            <ToggleGroupItem value="30d">30 jours</ToggleGroupItem>
            <ToggleGroupItem value="7d">7 jours</ToggleGroupItem>
          </ToggleGroup>
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger
              className="flex w-40 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate @[767px]/card:hidden"
              size="sm"
              aria-label="Sélectionner une période"
            >
              <SelectValue placeholder="3 mois" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="90d" className="rounded-lg">
                3 mois
              </SelectItem>
              <SelectItem value="30d" className="rounded-lg">
                30 jours
              </SelectItem>
              <SelectItem value="7d" className="rounded-lg">
                7 jours
              </SelectItem>
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-[250px] w-full"
        >
          <AreaChart data={filteredData}>
            <defs>
              {(["total", "nouveaux", "persistants", "critiques", "corriges"] as const).map(
                (k) => (
                  <linearGradient key={k} id={`fill-${k}`} x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor={`var(--color-${k})`}
                      stopOpacity={k === "total" ? 0.8 : 0.5}
                    />
                    <stop
                      offset="95%"
                      stopColor={`var(--color-${k})`}
                      stopOpacity={0.1}
                    />
                  </linearGradient>
                )
              )}
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="jour"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(value) => fmtDateShort(value as string)}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(value) => fmtDateShort(value as string)}
                  indicator="dot"
                />
              }
            />
            <Area
              dataKey="total"
              type="natural"
              fill="url(#fill-total)"
              stroke="var(--color-total)"
              stackId="a"
            />
            <Area
              dataKey="nouveaux"
              type="natural"
              fill="url(#fill-nouveaux)"
              stroke="var(--color-nouveaux)"
              stackId="a"
            />
            <Area
              dataKey="persistants"
              type="natural"
              fill="url(#fill-persistants)"
              stroke="var(--color-persistants)"
              stackId="a"
            />
            <Area
              dataKey="critiques"
              type="natural"
              fill="url(#fill-critiques)"
              stroke="var(--color-critiques)"
              stackId="a"
            />
            <Area
              dataKey="corriges"
              type="natural"
              fill="url(#fill-corriges)"
              stroke="var(--color-corriges)"
              stackId="a"
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
