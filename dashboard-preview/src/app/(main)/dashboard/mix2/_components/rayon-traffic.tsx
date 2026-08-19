"use client";

import { Ellipsis } from "lucide-react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Area, AreaChart, CartesianGrid, Line, XAxis, YAxis } from "recharts";

import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

import type { GammeSerieAnomalies, GammeSerieJour } from "../_lib/gamme";

const MAX_DAYS = 15;

function formatJour(jour: string): string {
  return format(parseISO(jour), "dd/MM");
}

const chartConfig = {
  negatifs: {
    label: "Négatifs (nouveaux + persistants)",
    color: "var(--chart-3)",
  },
  anomalies: {
    label: "Anomalies",
    color: "var(--destructive)",
  },
} satisfies ChartConfig;

export function RayonTraffic({
  serieAnomalies,
  serieJours,
}: {
  serieAnomalies: GammeSerieAnomalies | null;
  serieJours: GammeSerieJour[] | null;
}) {
  const anomaliesByJour = new Map<string, number>();
  for (const d of serieAnomalies?.jours ?? []) {
    const jour = String(d.jour);
    let sum = 0;
    for (const t of serieAnomalies?.types ?? []) {
      sum += Number(d[t] ?? 0) || 0;
    }
    anomaliesByJour.set(jour, sum);
  }

  const chartData = (serieJours ?? []).slice(-MAX_DAYS).map((s) => ({
    jour: s.jour,
    negatifs: s.total,
    anomalies: anomaliesByJour.get(s.jour) ?? 0,
  }));

  const lastNegatifs = chartData.at(-1)?.negatifs ?? 0;

  if (chartData.length === 0) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="font-normal text-muted-foreground text-sm">Activité du rayon — par jour</CardTitle>
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
        <CardTitle className="font-normal text-muted-foreground text-sm">Activité du rayon — par jour</CardTitle>
        <CardDescription className="text-foreground text-xl leading-none tracking-tight tabular-nums">
          {lastNegatifs.toLocaleString("fr-FR")} négatifs
        </CardDescription>
        <CardAction>
          <Ellipsis className="size-4" />
        </CardAction>
      </CardHeader>

      <CardContent>
        <ChartContainer config={chartConfig} className="h-54 w-full xl:h-64 2xl:h-72">
          <AreaChart accessibilityLayer data={chartData} margin={{ bottom: 0, left: 0, right: 0, top: 8 }}>
            <defs>
              <linearGradient id="mix2FillNegatifs" x1="0" x2="0" y1="0" y2="1">
                <stop offset="5%" stopColor="var(--color-negatifs)" stopOpacity={0.28} />
                <stop offset="95%" stopColor="var(--color-negatifs)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              axisLine={false}
              dataKey="jour"
              tick={{ fontSize: 11 }}
              tickFormatter={(value: string) => formatJour(value)}
              tickLine={false}
              tickMargin={10}
            />
            <YAxis axisLine={false} domain={[0, "auto"]} tickLine={false} tickMargin={6} width={36} yAxisId="activite" />
            <ChartTooltip
              content={
                <ChartTooltipContent labelFormatter={(value) => format(parseISO(String(value)), "EEEE d MMMM yyyy", { locale: fr })} />
              }
              cursor={{ stroke: "var(--border)", strokeDasharray: "4 4" }}
            />
            <ChartLegend align="right" verticalAlign="top" className="justify-end" content={<ChartLegendContent />} />
            <Area
              dataKey="negatifs"
              dot={false}
              fill="url(#mix2FillNegatifs)"
              stroke="var(--color-negatifs)"
              strokeWidth={2}
              type="monotone"
              yAxisId="activite"
            />
            <Line
              dataKey="anomalies"
              dot={false}
              stroke="var(--color-anomalies)"
              strokeLinecap="round"
              strokeWidth={1.2}
              type="monotone"
              yAxisId="activite"
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}