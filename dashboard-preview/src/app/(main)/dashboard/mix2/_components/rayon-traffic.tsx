"use client";

import { Ellipsis } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, XAxis, YAxis } from "recharts";

import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

import type { GammeSerieAnomalies, GammeSerieJour } from "../_lib/gamme";

const TYPE_LABELS: Record<string, string> = {
  hausse_forte: "Hausses fortes",
  chute_forte: "Chutes fortes",
  promo_active: "Promos actives",
  marge_negative: "Marges négatives",
};

const TYPE_COLORS: Record<string, string> = {
  hausse_forte: "var(--chart-1)",
  chute_forte: "var(--chart-2)",
  promo_active: "var(--chart-3)",
  marge_negative: "var(--destructive)",
};

const MAX_DAYS = 15;

function formatJour(jour: string): string {
  const [, m, d] = jour.split("-");
  return `${d}/${m}`;
}

export function RayonTraffic({
  serieAnomalies,
  serieJours,
}: {
  serieAnomalies: GammeSerieAnomalies | null;
  serieJours: GammeSerieJour[] | null;
}) {
  const types = serieAnomalies?.types ?? [];
  const days = [...(serieAnomalies?.jours ?? [])].slice(-MAX_DAYS);

  const totalByJour = new Map((serieJours ?? []).map((s) => [s.jour, s.total]));
  const chartData: Array<Record<string, string | number>> = days.map((d) => {
    const jour = String(d.jour);
    return { ...d, jour, negatifs: totalByJour.get(jour) ?? 0 };
  });

  const lastDay = chartData.at(-1);
  const lastAnomalies = types.reduce((sum, t) => sum + (Number(lastDay?.[t] ?? 0) || 0), 0);

  const chartConfig = {
    negatifs: { label: "Négatifs (nouveaux + persistants)", color: "var(--chart-4)" },
    ...Object.fromEntries(types.map((t) => [t, { label: TYPE_LABELS[t] ?? t, color: TYPE_COLORS[t] ?? "var(--chart-5)" }])),
  } satisfies ChartConfig;

  if (chartData.length === 0) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="font-normal text-muted-foreground text-sm">Anomalies &amp; négatifs — par jour</CardTitle>
        </CardHeader>
        <CardContent className="flex h-54 items-center justify-center text-sm text-muted-foreground xl:h-64">
          Aucune donnée réelle pour cette période
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="font-normal text-muted-foreground text-sm">
          Anomalies &amp; négatifs — par jour
        </CardTitle>
        <CardDescription className="text-foreground text-xl leading-none tracking-tight tabular-nums">
          {lastAnomalies.toLocaleString("fr-FR")} anomalies
        </CardDescription>
        <CardAction>
          <Ellipsis className="size-4" />
        </CardAction>
      </CardHeader>

      <CardContent>
        <ChartContainer config={chartConfig} className="h-54 w-full xl:h-64 2xl:h-72">
          <BarChart accessibilityLayer data={chartData} margin={{ bottom: 0, left: 0, right: 0, top: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              axisLine={false}
              dataKey="jour"
              tick={{ fontSize: 11 }}
              tickFormatter={(value: string) => formatJour(value)}
              tickLine={false}
              tickMargin={10}
            />
            <YAxis axisLine={false} tickLine={false} tickMargin={6} width={36} yAxisId="anomalies" />
            <ChartTooltip
              content={
                <ChartTooltipContent labelFormatter={(value) => formatJour(String(value))} />
              }
              cursor={{ fill: "var(--muted)", opacity: 0.3 }}
            />
            <ChartLegend align="right" verticalAlign="top" className="justify-end" content={<ChartLegendContent />} />
            {types.map((t) => (
              <Bar
                key={t}
                dataKey={t}
                fill={`var(--color-${t})`}
                radius={[3, 3, 0, 0]}
                stackId="anomalies"
                yAxisId="anomalies"
              />
            ))}
            <Line
              dataKey="negatifs"
              dot={false}
              stroke="var(--color-negatifs)"
              strokeLinecap="round"
              strokeWidth={2}
              type="linear"
              yAxisId="anomalies"
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}