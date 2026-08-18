"use client";

import { Ellipsis } from "lucide-react";
import { CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";

import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

// 90 jours jusqu'au 17/08 — négatifs en négatif (vers 0 = amélioration),
// corrigés en positif.
const qualitySeries = [
  { negatifs: -5, corriges: 3 },
  { negatifs: -4, corriges: 2 },
  { negatifs: -6, corriges: 4 },
  { negatifs: -5, corriges: 3 },
  { negatifs: -3, corriges: 2 },
  { negatifs: -4, corriges: 5 },
  { negatifs: -6, corriges: 4 },
  { negatifs: -5, corriges: 3 },
  { negatifs: -4, corriges: 2 },
  { negatifs: -3, corriges: 4 },
  { negatifs: -2, corriges: 5 },
  { negatifs: -3, corriges: 6 },
  { negatifs: -4, corriges: 4 },
  { negatifs: -5, corriges: 3 },
  { negatifs: -3, corriges: 2 },
  { negatifs: -2, corriges: 4 },
  { negatifs: -4, corriges: 5 },
  { negatifs: -5, corriges: 3 },
  { negatifs: -6, corriges: 4 },
  { negatifs: -5, corriges: 5 },
  { negatifs: -4, corriges: 6 },
  { negatifs: -3, corriges: 4 },
  { negatifs: -2, corriges: 3 },
  { negatifs: -3, corriges: 2 },
  { negatifs: -4, corriges: 4 },
  { negatifs: -3, corriges: 5 },
  { negatifs: -2, corriges: 6 },
  { negatifs: -3, corriges: 5 },
  { negatifs: -4, corriges: 4 },
  { negatifs: -5, corriges: 3 },
  { negatifs: -4, corriges: 2 },
  { negatifs: -3, corriges: 4 },
  { negatifs: -2, corriges: 5 },
  { negatifs: -3, corriges: 6 },
  { negatifs: -4, corriges: 4 },
  { negatifs: -3, corriges: 3 },
  { negatifs: -2, corriges: 2 },
  { negatifs: -1, corriges: 4 },
  { negatifs: -2, corriges: 5 },
  { negatifs: -3, corriges: 6 },
  { negatifs: -2, corriges: 5 },
  { negatifs: -1, corriges: 4 },
  { negatifs: -2, corriges: 3 },
  { negatifs: -3, corriges: 4 },
  { negatifs: -4, corriges: 5 },
  { negatifs: -3, corriges: 6 },
  { negatifs: -2, corriges: 4 },
  { negatifs: -1, corriges: 5 },
  { negatifs: -2, corriges: 6 },
  { negatifs: -3, corriges: 5 },
  { negatifs: -2, corriges: 4 },
  { negatifs: -1, corriges: 3 },
  { negatifs: -2, corriges: 4 },
  { negatifs: -3, corriges: 5 },
  { negatifs: -2, corriges: 6 },
  { negatifs: -1, corriges: 5 },
  { negatifs: -2, corriges: 4 },
  { negatifs: -3, corriges: 3 },
  { negatifs: -2, corriges: 4 },
  { negatifs: -1, corriges: 5 },
  { negatifs: -2, corriges: 6 },
  { negatifs: -3, corriges: 5 },
  { negatifs: -4, corriges: 4 },
  { negatifs: -3, corriges: 5 },
  { negatifs: -2, corriges: 6 },
  { negatifs: -3, corriges: 4 },
  { negatifs: -2, corriges: 5 },
  { negatifs: -1, corriges: 6 },
  { negatifs: -2, corriges: 5 },
  { negatifs: -3, corriges: 4 },
  { negatifs: -2, corriges: 3 },
  { negatifs: -1, corriges: 4 },
  { negatifs: -2, corriges: 5 },
  { negatifs: -3, corriges: 6 },
  { negatifs: -2, corriges: 5 },
  { negatifs: -1, corriges: 4 },
  { negatifs: -2, corriges: 5 },
  { negatifs: -3, corriges: 6 },
  { negatifs: -4, corriges: 5 },
  { negatifs: -3, corriges: 4 },
  { negatifs: -2, corriges: 5 },
  { negatifs: -1, corriges: 6 },
  { negatifs: -2, corriges: 5 },
  { negatifs: -3, corriges: 4 },
  { negatifs: -2, corriges: 6 },
  { negatifs: -1, corriges: 5 },
  { negatifs: -2, corriges: 4 },
  { negatifs: -3, corriges: 5 },
  { negatifs: -2, corriges: 6 },
  { negatifs: -1, corriges: 5 },
  { negatifs: -2, corriges: 4 },
  { negatifs: -3, corriges: 5 },
  { negatifs: -2, corriges: 6 },
  { negatifs: -1, corriges: 5 },
  { negatifs: -2, corriges: 4 },
];

const chartConfig = {
  negatifs: {
    color: "var(--chart-3)",
    label: "Négatifs",
  },
  corriges: {
    color: "var(--muted-foreground)",
    label: "Corrigés",
  },
} satisfies ChartConfig;

import type { GammeSerieJour } from "../_lib/gamme";

const mockChartData = qualitySeries.map((item, index) => ({
  ...item,
  dayIndex: 1 + (index * 89) / (qualitySeries.length - 1),
  label: "",
}));

const monthTicks = [30, 60, 90];
const monthLabels = ["Juin", "Juillet", "Août"];

function formatMonth(value: number) {
  const idx = monthTicks.indexOf(value);

  return idx >= 0 ? monthLabels[idx] : "";
}

function buildChartData(serie: GammeSerieJour[]) {
  const n = serie.length;
  return serie.map((s, index) => ({
    negatifs: -s.total,
    corriges: s.corriges,
    dayIndex: n > 1 ? 1 + (index * 89) / (n - 1) : 45,
    label: s.jour.slice(5),
  }));
}

const monthFormatter = new Intl.DateTimeFormat("fr-FR", { month: "short" });

export function Tendance90Jours({ serie }: { serie: GammeSerieJour[] | null }) {
  const isReal = serie !== null && serie.length > 0;
  const chartData = isReal ? buildChartData(serie) : mockChartData;

  const ticks = isReal ? [25, 50, 75] : monthTicks;
  const tickLabels = isReal
    ? ticks.map((tick) => {
        const idx = Math.round(((tick - 1) / 89) * (chartData.length - 1));
        const point = chartData[Math.min(Math.max(0, idx), chartData.length - 1)];
        return point.label;
      })
    : monthLabels;

  function formatRealTick(value: number) {
    const idx = ticks.indexOf(value);
    return idx >= 0 ? tickLabels[idx] : "";
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="font-normal">Tendance 90 jours</CardTitle>
        <CardAction>
          <Ellipsis className="size-4" />
        </CardAction>
      </CardHeader>

      <CardContent>
        <ChartContainer config={chartConfig} className="h-68 w-full xl:h-72 2xl:h-80">
          <ComposedChart data={chartData} margin={{ bottom: 0, left: 0, right: 0, top: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="dayIndex"
              axisLine={false}
              domain={[1, 90]}
              interval={0}
              tickFormatter={isReal ? formatRealTick : formatMonth}
              tickLine={false}
              tickMargin={14}
              ticks={ticks}
              type="number"
            />
            <YAxis
              axisLine={false}
              domain={isReal ? [-30, 30] : [-6, 6]}
              tickFormatter={(value) => `${value}`}
              tickLine={false}
              tickMargin={10}
              width={34}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent className="w-40" labelFormatter={() => "Évolution du rayon"} />}
            />
            <Line
              dataKey="corriges"
              dot={false}
              stroke="var(--color-corriges)"
              strokeOpacity={0.65}
              strokeDasharray="4 4"
              strokeWidth={1.75}
              type="linear"
            />
            <Line
              dataKey="negatifs"
              dot={false}
              activeDot={{ r: 4 }}
              stroke="var(--color-negatifs)"
              strokeWidth={2.5}
              type="linear"
            />
          </ComposedChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
