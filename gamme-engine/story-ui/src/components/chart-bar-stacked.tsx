"use client"

import { ShieldAlertIcon } from "lucide-react"
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { SerieAnomalies } from "@/lib/story"
import { fmtDateShort } from "@/lib/story"

export const description = "Anomalies par type et par jour"

const LABELS: Record<string, string> = {
  chute_forte: "Chute forte",
  hausse_forte: "Hausse forte",
  marge_negative: "Marge négative",
  promo_active: "Promo active",
}

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"]

export function ChartBarStacked({ serie }: { serie: SerieAnomalies }) {
  const types = serie.types
  const chartConfig = Object.fromEntries(
    types.map((t, i) => [t, { label: LABELS[t] ?? t.replace(/_/g, " "), color: COLORS[i % COLORS.length] }])
  ) satisfies ChartConfig

  return (
    <Card>
      <CardHeader>
        <CardTitle>Anomalies par type</CardTitle>
        <CardDescription>Répartition quotidienne, empilée par type</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[250px] w-full">
          <BarChart accessibilityLayer data={serie.jours}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="jour"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
              tickFormatter={(value) => fmtDateShort(value as string)}
            />
            <ChartTooltip content={<ChartTooltipContent hideLabel />} />
            <ChartLegend content={<ChartLegendContent />} />
            {types.map((t, i) => (
              <Bar
                key={t}
                dataKey={t}
                stackId="a"
                fill={COLORS[i % COLORS.length]}
                radius={i === types.length - 1 ? [4, 4, 0, 0] : undefined}
              />
            ))}
          </BarChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col items-start gap-2 text-sm">
        <div className="flex gap-2 leading-none font-medium">
          Anomalies détectées à chaque import <ShieldAlertIcon className="h-4 w-4" />
        </div>
        <div className="leading-none text-muted-foreground">
          Marges négatives, chutes/hausses de stock, prix promo
        </div>
      </CardFooter>
    </Card>
  )
}
