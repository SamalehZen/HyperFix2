"use client"

import { TrendingDownIcon } from "lucide-react"
import { Bar, BarChart, CartesianGrid, Cell, LabelList } from "recharts"

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
import { fmtNum } from "@/lib/story"

export const description = "Stocks négatifs des 10 pires articles"

const chartConfig = {
  stock: {
    label: "Stock",
  },
} satisfies ChartConfig

export function ChartBarNegative({ data }: { data: TopNeg[] }) {
  const chartData = data
    .slice()
    .sort((a, b) => (a.stock ?? 0) - (b.stock ?? 0))
    .map((t) => ({ code: String(t.code), stock: t.stock ?? 0 }))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top 10 négatifs — profondeur du stock</CardTitle>
        <CardDescription>Stock le plus négatif (unités)</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig}>
          <BarChart accessibilityLayer data={chartData}>
            <CartesianGrid vertical={false} />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel hideIndicator />}
            />
            <Bar dataKey="stock">
              <LabelList position="top" dataKey="code" fillOpacity={1} />
              {chartData.map((item) => (
                <Cell
                  key={item.code}
                  fill={item.stock >= 0 ? "var(--chart-1)" : "var(--chart-2)"}
                />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col items-start gap-2 text-sm">
        <div className="flex gap-2 leading-none font-medium">
          Article {chartData[0]?.code ?? "—"} à {fmtNum(chartData[0]?.stock)} unités{" "}
          <TrendingDownIcon className="h-4 w-4" />
        </div>
        <div className="leading-none text-muted-foreground">
          Code article affiché au-dessus de chaque barre
        </div>
      </CardFooter>
    </Card>
  )
}
