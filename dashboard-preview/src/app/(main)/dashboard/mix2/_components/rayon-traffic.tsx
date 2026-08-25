"use client";

import { Ellipsis } from "lucide-react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Area, AreaChart, CartesianGrid, Line, XAxis, YAxis } from "recharts";

import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

import type { GammeSeriePrmp } from "../_lib/gamme";

const MAX_DAYS = 15;

function formatJour(jour: string): string {
  return format(parseISO(jour), "dd/MM");
}

function fmtFdj(v: number): string {
  return v.toLocaleString("fr-FR", { maximumFractionDigits: 0 });
}

const chartConfig = {
  negatifs: {
    label: "Négatifs du jour",
    color: "var(--chart-3)",
  },
  corriges: {
    label: "Corrigés (J-1)",
    color: "#f97316",
  },
} satisfies ChartConfig;

export function RayonTraffic({ seriePrmp }: { seriePrmp: GammeSeriePrmp[] | null }) {
  const chartData = (seriePrmp ?? []).slice(-MAX_DAYS).map((s) => ({
    jour: s.jour,
    negatifs: s.prmp_negatif,
    corriges: s.prmp_corrige,
  }));

  const lastNegatifs = chartData.at(-1)?.negatifs ?? 0;

  if (chartData.length === 0) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="font-normal text-muted-foreground text-sm">Négatifs PRMP — corrigés vs en cours</CardTitle>
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
        <CardTitle className="font-normal text-muted-foreground text-sm">Négatifs PRMP — corrigés vs en cours</CardTitle>
        <CardDescription className="text-foreground text-xl leading-none tracking-tight tabular-nums">
          {fmtFdj(lastNegatifs)} FDJ en négatif
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
            <YAxis axisLine={false} domain={[0, "auto"]} tickFormatter={(value: number) => fmtFdj(value)} tickLine={false} tickMargin={6} width={52} yAxisId="activite" />
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
              dataKey="corriges"
              dot={false}
              stroke="var(--color-corriges)"
              strokeDasharray="4 4"
              strokeLinecap="round"
              strokeWidth={1.5}
              type="monotone"
              yAxisId="activite"
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
