"use client"

import { TrendingDownIcon } from "lucide-react"
import { Bar, BarChart, XAxis, YAxis } from "recharts"

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
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { TopNeg } from "@/lib/story"
import { fmtFdj } from "@/lib/story"

export const description = "Top 10 des négatifs par valeur bloquée"

const chartConfig = {
  valeur: {
    label: "Valeur bloquée",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig

export function ChartBarHorizontal({ data }: { data: TopNeg[] }) {
  const chartData = data.map((t) => ({
    code: String(t.code),
    valeur: Math.round(t.valeur),
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top 10 négatifs — valeur bloquée</CardTitle>
        <CardDescription>Stock négatif × prix de revient (FDJ)</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig}>
          <BarChart
            accessibilityLayer
            data={chartData}
            layout="vertical"
            margin={{
              left: -14,
            }}
          >
            <XAxis type="number" dataKey="valeur" hide />
            <YAxis
              dataKey="code"
              type="category"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
              width={56}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  hideLabel
                  formatter={(value) => fmtFdj(value as number)}
                />
              }
            />
            <Bar dataKey="valeur" fill="var(--color-valeur)" radius={5} />
          </BarChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col items-start gap-2 text-sm">
        <div className="flex gap-2 leading-none font-medium">
          Code article le plus bloqué {data[0]?.code ?? "—"}{" "}
          <TrendingDownIcon className="h-4 w-4" />
        </div>
        <div className="leading-none text-muted-foreground">
          Les 10 articles représentant le plus de valeur immobilisée
        </div>
      </CardFooter>
    </Card>
  )
}
