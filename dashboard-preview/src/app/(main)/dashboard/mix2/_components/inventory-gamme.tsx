"use client";

import { ArrowUpRight, PackageCheck, PackageX, TrendingDown, TriangleAlert } from "lucide-react";
import { Label, Pie, PieChart } from "recharts";

import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer } from "@/components/ui/chart";
import { Separator } from "@/components/ui/separator";

const chartData = [{ month: "current", "in-stock": 9208, "low-stock": 155, "out-of-stock": 6 }];

import type { GammeStats } from "../_lib/gamme";

export function InventoryGamme({ stats }: { stats: GammeStats | null }) {
  const inStock = stats?.en_stock ?? chartData[0]["in-stock"];
  const lowStock = stats?.stock_bas ?? chartData[0]["low-stock"];
  const outOfStock =
    stats && stats.nb_articles > 0
      ? Math.max(0, stats.nb_articles - stats.en_stock - (stats.negatifs ?? 0))
      : chartData[0]["out-of-stock"];
  const negatifs = stats?.negatifs ?? 0;

  const totalUnits = inStock + lowStock + outOfStock;
  const availablePercent = totalUnits > 0 ? Math.round((inStock / totalUnits) * 100) : 0;
  const gaugeSegmentCount = 32;
  const inStockSegments = totalUnits > 0 ? Math.round((inStock / totalUnits) * gaugeSegmentCount) : 0;
  const lowStockSegments = totalUnits > 0 ? Math.round((lowStock / totalUnits) * gaugeSegmentCount) : 0;

  function getGaugeSegmentStatus(index: number) {
    if (index < inStockSegments) {
      return "in-stock";
    }

    if (index < inStockSegments + lowStockSegments) {
      return "low-stock";
    }

    return "out-of-stock";
  }

  const gaugeSegments = Array.from({ length: gaugeSegmentCount }, (_, index) => {
    const status = getGaugeSegmentStatus(index);
    return {
      fill: `var(--color-${status})`,
      id: `segment-${index + 1}`,
      status,
      value: 1,
    };
  });
  const inventorySummary = [
    {
      icon: PackageCheck,
      label: "En stock",
      value: inStock,
    },
    {
      icon: TriangleAlert,
      label: "Stock bas",
      value: lowStock,
    },
    {
      icon: PackageX,
      label: "Ruptures",
      value: outOfStock,
    },
    {
      icon: TrendingDown,
      label: "Négatifs",
      value: negatifs,
    },
  ] as const;

const chartConfig = {
  "in-stock": {
    label: "En stock",
    color: "var(--chart-2)",
  },
  "low-stock": {
    label: "Stock bas",
    color: "var(--chart-1)",
  },
  "out-of-stock": {
    label: "Ruptures",
    color: "var(--destructive)",
  },
} satisfies ChartConfig;

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="font-normal text-muted-foreground text-sm">État du stock</CardTitle>
        <CardDescription className="text-foreground text-xl tabular-nums leading-none tracking-tight">
          {availablePercent}% disponible
        </CardDescription>
        <CardAction>
          <ArrowUpRight className="size-4" />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ChartContainer config={chartConfig} className="mx-auto h-30 w-full xl:h-40 2xl:h-44">
          <PieChart>
            <Pie
              cx="50%"
              cy="100%"
              cornerRadius={6}
              data={gaugeSegments}
              dataKey="value"
              endAngle={0}
              innerRadius={80}
              outerRadius={110}
              paddingAngle={2}
              startAngle={180}
              stroke="var(--card)"
              strokeWidth={1}
            >
              <Label
                content={({ viewBox }) => {
                  if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                    return (
                      <text textAnchor="middle" x={viewBox.cx} y={viewBox.cy}>
                        <tspan
                          className="fill-foreground font-medium text-2xl tabular-nums"
                          x={viewBox.cx}
                          y={(viewBox.cy || 0) + 36}
                        >
                          {availablePercent}%
                        </tspan>
                        <tspan className="fill-muted-foreground text-xs" x={viewBox.cx} y={(viewBox.cy || 0) + 52}>
                          Disponible
                        </tspan>
                      </text>
                    );
                  }
                }}
              />
            </Pie>
          </PieChart>
        </ChartContainer>
        <Separator />

        <div className="grid grid-cols-4 divide-x">
          {inventorySummary.map((item, _index) => (
            <div key={item.label} className="flex flex-col items-center gap-3 text-center">
              <div className="grid size-9 place-items-center rounded-full bg-muted">
                <item.icon className="size-4 text-muted-foreground" />
              </div>
              <div>
                <div className="text-muted-foreground text-xs leading-none">{item.label}</div>
                <div className="font-medium text-sm tabular-nums">{item.value.toLocaleString("fr-FR")}</div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
