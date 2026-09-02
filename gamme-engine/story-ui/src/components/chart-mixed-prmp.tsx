"use client"

import { Area, Bar, ComposedChart, CartesianGrid, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"

export function ChartMixedPRMP({ serie }: { serie: any[] }) {
  const chartConfig = {
    prmp_negatif: { label: "PRMP bloqué", color: "var(--chart-1)" },
    total: { label: "Négatifs", color: "var(--chart-2)" },
  }
  const data = serie.map((d: any) => ({
    jour: d.jour,
    prmp_negatif: d.prmp_negatif,
    total: d.total,
  }))
  return (
    <ChartContainer config={chartConfig} className="h-[300px] w-full">
      <ComposedChart data={data} accessibilityLayer>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="jour" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis yAxisId="left" tickLine={false} axisLine={false} />
        <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar yAxisId="left" dataKey="total" fill="var(--chart-2)" radius={4} barSize={12} isAnimationActive={true} animationDuration={400} />
        <Area yAxisId="right" type="monotone" dataKey="prmp_negatif" stroke="var(--chart-1)" fill="var(--chart-1)" fillOpacity={0.4} isAnimationActive={true} animationDuration={400} />
      </ComposedChart>
    </ChartContainer>
  )
}
