"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import type { GammeSerieJour } from "../_lib/gamme";

const pipelineChartValues = [42, 38, 51, 47, 55, 49, 61, 44, 58, 52, 48, 38] as const;

type Periode = "jour" | "trimestre" | "12mois";

function aggregateByMonth(serie: GammeSerieJour[]): { date: string; negatifs: number; corriges: number }[] {
  const byMonth = new Map<string, { negatifs: number; corriges: number }>();
  for (const s of serie) {
    const month = s.jour.slice(0, 7);
    const current = byMonth.get(month) ?? { negatifs: 0, corriges: 0 };
    current.negatifs += s.total;
    current.corriges += s.corriges ?? 0;
    byMonth.set(month, current);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, value]) => ({
      date: new Date(`${month}-01T00:00:00.000Z`).toISOString(),
      negatifs: value.negatifs,
      corriges: value.corriges,
    }));
}

function latestDay(serie: GammeSerieJour[]): GammeSerieJour {
  return [...serie].sort((a, b) => (a.jour < b.jour ? -1 : 1))[serie.length - 1];
}

interface PeriodCounts {
  negatifs: number;
  corriges: number;
}

function getCounts(serie: GammeSerieJour[] | null, periode: Periode): PeriodCounts {
  if (!serie || serie.length === 0) {
    if (periode === "jour") return { negatifs: 5, corriges: 6 };
    const months = getRollingMonthData(pipelineChartValues);
    const slice = periode === "trimestre" ? months.slice(-3) : months;
    const negatifs = slice.reduce((sum, item) => sum + item.negatifs, 0);
    return { negatifs, corriges: Math.round(negatifs * 0.9) };
  }
  if (periode === "jour") {
    const last = latestDay(serie);
    return { negatifs: last.total, corriges: last.corriges ?? 0 };
  }
  const months = aggregateByMonth(serie);
  const slice = periode === "trimestre" ? months.slice(-3) : months;
  return {
    negatifs: slice.reduce((sum, item) => sum + item.negatifs, 0),
    corriges: slice.reduce((sum, item) => sum + item.corriges, 0),
  };
}

function dailyData(serie: GammeSerieJour[]): { date: string; negatifs: number }[] {
  return serie
    .map((s) => ({ date: new Date(`${s.jour}T00:00:00.000Z`).toISOString(), negatifs: s.total }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

const pipelineChartConfig = {
  negatifs: {
    label: "Négatifs détectés",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

const axisMonthFormatter = new Intl.DateTimeFormat("fr-FR", { month: "short" });
const tooltipMonthFormatter = new Intl.DateTimeFormat("fr-FR", { month: "short", year: "2-digit" });
const axisDayFormatter = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit" });
const tooltipDayFormatter = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "2-digit", month: "short" });

const fallbackDays = ["2026-08-12", "2026-08-15", "2026-08-16", "2026-08-17", "2026-08-18"];

function getRollingMonthData(values: readonly number[]) {
  return values.map((negatifs, index) => {
    const date = new Date(2026, 7, 1);
    date.setMonth(date.getMonth() - (values.length - 1 - index));

    return {
      date: date.toISOString(),
      negatifs,
    };
  });
}

function getFallbackData(periode: Periode) {
  const months = getRollingMonthData(pipelineChartValues);
  if (periode === "jour") {
    const values = [16, 15, 4, 6, 5];
    return fallbackDays.map((day, index) => ({
      date: new Date(`${day}T00:00:00.000Z`).toISOString(),
      negatifs: values[index] ?? 0,
    }));
  }
  if (periode === "trimestre") return months.slice(-3);
  return months;
}

export function Historique12Mois({ serie }: { serie: GammeSerieJour[] | null }) {
  const [periode, setPeriode] = React.useState<Periode>("jour");
  const isReal = serie !== null && serie.length > 0;

  const pipelineChartData = React.useMemo(() => {
    if (!isReal) return getFallbackData(periode);
    if (periode === "jour") return dailyData(serie);
    const months = aggregateByMonth(serie);
    return periode === "trimestre" ? months.slice(-3) : months;
  }, [isReal, periode, serie]);

  const totalNegatifs = pipelineChartData.reduce((sum, item) => sum + item.negatifs, 0);
  const counts = React.useMemo(() => getCounts(isReal ? serie : null, periode), [isReal, serie, periode]);
  const pctCorrection =
    counts.negatifs > 0 ? Math.min(100, Math.round((100 * counts.corriges) / counts.negatifs)) : 0;
  const isJour = periode === "jour";

  const periodLabel =
    periode === "jour" ? "jour" : periode === "trimestre" ? "trimestre" : "mois";
  const titre = `Négatifs détectés par ${periodLabel}`;

  const tickFormatter = (value: string) =>
    periode === "jour" ? axisDayFormatter.format(new Date(value)) : axisMonthFormatter.format(new Date(value));
  const tooltipFormatter = (value: string) =>
    periode === "jour"
      ? tooltipDayFormatter.format(new Date(value))
      : tooltipMonthFormatter.format(new Date(value));

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
      <Card className="xl:col-span-12">
        <CardHeader>
          <CardTitle>{titre}</CardTitle>
          <CardAction>
            <Select value={periode} onValueChange={(v) => setPeriode(v as Periode)}>
              <SelectTrigger size="sm" className="min-w-40">
                <SelectValue placeholder="Période" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="jour">Par jour</SelectItem>
                  <SelectItem value="trimestre">Ce trimestre</SelectItem>
                  <SelectItem value="12mois">12 derniers mois</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <ChartContainer config={pipelineChartConfig} className="h-72 w-full lg:col-span-8 xl:h-80 2xl:h-88">
              <BarChart data={pipelineChartData} margin={{ left: 0, right: 0, top: 0, bottom: 0 }} barSize={38}>
                <defs>
                  <pattern
                    id="mix2-negatifs-pattern"
                    width="4"
                    height="4"
                    patternUnits="userSpaceOnUse"
                    patternTransform="rotate(45)"
                  >
                    <rect width="6" height="6" fill="var(--color-negatifs)" fillOpacity={0.15} />
                    <line
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="6"
                      stroke="var(--color-negatifs)"
                      strokeWidth="1.25"
                      strokeOpacity="0.40"
                    />
                  </pattern>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="0" />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  tickMargin={10}
                  axisLine={false}
                  tickFormatter={(value) => tickFormatter(String(value))}
                />
                <YAxis hide />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      hideIndicator
                      labelFormatter={(value) => tooltipFormatter(String(value))}
                    />
                  }
                />
                <Bar
                  dataKey="negatifs"
                  fill="url(#mix2-negatifs-pattern)"
                  radius={[8, 8, 0, 0]}
                  stroke="var(--color-negatifs)"
                  strokeOpacity={0.5}
                  strokeWidth={0.5}
                />
              </BarChart>
            </ChartContainer>

            <div className="flex flex-col gap-5 rounded-lg p-4 lg:col-span-4">
              <div className="flex flex-col gap-1">
                <div className="font-medium text-4xl tabular-nums leading-none">
                  {counts.negatifs} <span className="font-normal text-lg text-muted-foreground">négatifs</span>
                </div>
                <p className="text-muted-foreground text-sm">
                  {isJour ? "Négatifs du jour sélectionné (J)." : "Total des négatifs sur la période suivie."}
                </p>
              </div>

              <div className="flex flex-col gap-3 rounded-lg border border-border/60 p-3">
                <div className="text-[11px] text-muted-foreground uppercase tracking-widest">
                  {isJour ? "Réglés aujourd'hui (J-1)" : "Corrigés sur la période"}
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="font-medium text-2xl tabular-nums leading-none">
                    {counts.corriges} <span className="font-normal text-muted-foreground text-sm">négatifs</span>
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {isJour
                      ? "Les négatifs détectés la veille (J-1) ont été remis en stock positif aujourd'hui."
                      : "Négatifs remis en stock positif sur la période."}
                  </p>
                </div>

                <div className="flex flex-col gap-2 pt-0.5">
                  <Progress
                    value={pctCorrection}
                    className="h-2.5 bg-chart-2/12 *:data-[slot='progress-indicator']:bg-chart-2"
                  />
                  <div className="flex items-center justify-between text-xs">
                    <div className="font-medium tabular-nums">{counts.corriges} corrigés</div>
                    <div className="text-muted-foreground tabular-nums">{counts.negatifs} détectés</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
