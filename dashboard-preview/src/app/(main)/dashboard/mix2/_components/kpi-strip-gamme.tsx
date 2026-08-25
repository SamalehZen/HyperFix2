"use client";

import * as React from "react";

import { format, parse } from "date-fns";
import { fr } from "date-fns/locale";
import { ArrowUpRight, DollarSign, PackageCheck, RotateCcw, ShieldAlert, ShoppingBag, Users } from "lucide-react";
import { Area, CartesianGrid, ComposedChart, XAxis, YAxis } from "recharts";

import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

const revenueBucketRanges = ["01-05", "06-10", "11-15", "16-20", "21-25", "26-31"] as const;
const profitMultipliers = [0.24, 0.28, 0.26] as const;

const revenueBucketValues = [
  [482000, 515000, 506000, 552000, 599000, 688000],
  [514000, 536000, 552000, 586000, 612000, 672000],
  [492000, 468000, 515000, 536000, 572000, 615000],
  [548000, 592000, 566000, 618000, 634000, 666000],
  [584000, 622000, 648000, 611000, 668000, 723000],
  [628000, 674000, 696000, 712000, 678000, 724000],
  [682000, 724000, 768000, 741000, 792000, 781000],
  [604000, 642000, 615000, 686000, 708000, 709000],
  [586000, 612000, 634000, 608000, 662000, 690000],
  [652000, 684000, 706000, 742000, 716000, 828000],
  [698000, 732000, 764000, 716000, 804000, 862000],
  [690000, 740000, 810000, 860000, 820000, 936000],
] as const;

const monthFormatter = new Intl.DateTimeFormat("fr-FR", { month: "short" });

function getRollingRevenueBuckets() {
  const currentMonth = new Date(2026, 7, 1);

  return revenueBucketValues.map((values, index) => {
    const monthDate = new Date(currentMonth);
    monthDate.setMonth(currentMonth.getMonth() - (revenueBucketValues.length - 1 - index));

    return {
      month: `${monthFormatter.format(monthDate)} ${String(monthDate.getFullYear()).slice(-2)}`,
      values,
    };
  });
}

const revenueOverviewData = getRollingRevenueBuckets().flatMap(({ month, values }) =>
  values.map((revenue, index) => ({
    period: `${month} ${revenueBucketRanges[index]}`,
    profit: Math.round(revenue * profitMultipliers[index % profitMultipliers.length]),
    revenue,
  })),
);

const revenueOverviewConfig = {
  revenue: {
    label: "Valeur",
    color: "var(--foreground)",
  },
  profit: {
    label: "Marge",
    color: "var(--muted-foreground)",
  },
} satisfies ChartConfig;

function formatMonthTick(value: string) {
  const parts = value.split(" ");
  const range = parts.at(-1);
  const month = parts.slice(0, -1).join(" ");

  return range === "11-15" ? month : "";
}

function formatTooltipLabel(value: string) {
  const parts = value.split(" ");
  const range = parts.at(-1);
  const month = parse(parts.slice(0, -1).join(" "), "MMM yy", new Date(), { locale: fr });
  const [start, end] = String(range).split("-");
  const lastDayOfMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const startDate = new Date(month.getFullYear(), month.getMonth(), Number(start));
  const endDate = new Date(month.getFullYear(), month.getMonth(), Math.min(Number(end), lastDayOfMonth));

  return `${format(month, "MMM", { locale: fr })} ${format(startDate, "do", { locale: fr })} - ${format(endDate, "do", { locale: fr })}, ${format(month, "yyyy")}`;
}

function formatCurrencyTooltipValue(value: unknown) {
  return typeof value === "number" ? `${value.toLocaleString("fr-FR")} FDJ` : String(value ?? "");
}

import type { GammeResume, GammeStats, GammeSeriePrmp } from "../_lib/gamme";

function fmtFdj(v: number): string {
  return v.toLocaleString("fr-FR", { maximumFractionDigits: 0 });
}

function pctDelta(current: number, previous: number | null | undefined): string | null {
  if (previous === null || previous === undefined || previous === 0) return null;
  const delta = ((current - previous) / previous) * 100;
  const rounded = delta >= 0 ? Math.floor(delta * 10) / 10 : Math.ceil(delta * 10) / 10;
  return `${rounded >= 0 ? "+" : ""}${rounded.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}%`;
}

function Delta({ value, positive }: { value: string | null; positive: boolean }) {
  if (value === null) {
    return <span className="text-muted-foreground">—</span>;
  }
  return <span className={positive ? "text-green-700 dark:text-green-300" : "text-destructive"}>{value}</span>;
}

export function KpiStripGamme({
  resume,
  stats,
  prevResume,
  prevStats,
  seriePrmp,
}: {
  resume: GammeResume | null;
  stats: GammeStats | null;
  prevResume: GammeResume | null;
  prevStats: GammeStats | null;
  seriePrmp: GammeSeriePrmp[] | null;
}) {
  const valeurStock = stats?.valeur_stock_prmp ?? null;
  const articles = resume?.nb_articles ?? null;
  const negatifs = resume ? resume.nouveaux + resume.persistants : null;
  const sansCompensateur = resume ? resume.sans_compensateur : null;
  const corrigesSous7j = stats?.corriges_sous_7j ?? null;
  const dispo = stats && stats.nb_articles > 0 ? Math.round((stats.en_stock / stats.nb_articles) * 1000) / 10 : null;

  const chartData = React.useMemo(() => {
    if (!seriePrmp || seriePrmp.length === 0) return revenueOverviewData;
    return seriePrmp.map((s) => ({
      period: s.jour.slice(5),
      revenue: s.prmp_negatif,
      profit: s.prmp_corrige,
    }));
  }, [seriePrmp]);

  const realChart = seriePrmp !== null && seriePrmp.length > 0;

  return (
    <div className="h-full overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 xl:col-span-12">
      <div>
        <div className="grid grid-cols-1 xl:grid-cols-12">
          <div className="grid grid-cols-1 md:grid-cols-2 md:grid-rows-3 xl:col-span-5 xl:border-r">
            <Card className="h-full rounded-none border-0 border-border border-b ring-0 md:border-r">
              <CardHeader>
                <CardTitle className="font-normal text-sm">Valeur du stock</CardTitle>
                <CardDescription className="text-3xl text-foreground tabular-nums leading-none tracking-tight">
                  {valeurStock === null ? "40 705 517 FDJ" : `${fmtFdj(valeurStock)} FDJ`}
                </CardDescription>
                <CardAction className="grid size-6 place-items-center rounded-sm bg-muted">
                  <DollarSign className="size-3 text-foreground" />
                </CardAction>
              </CardHeader>
              <CardContent>
                <div className="text-sm">
                  <Delta value={pctDelta(valeurStock ?? 0, prevStats?.valeur_stock_prmp)} positive />{" "}
                  <span className="text-muted-foreground"> vs jour précédent</span>
                </div>
              </CardContent>
            </Card>

            <Card className="h-full rounded-none border-0 border-border border-b ring-0">
              <CardHeader>
                <CardTitle className="font-normal text-sm">Articles suivis</CardTitle>
                <CardDescription className="text-3xl text-foreground tabular-nums leading-none tracking-tight">
                  {articles === null ? "9 369" : articles.toLocaleString("fr-FR")}
                </CardDescription>
                <CardAction className="grid size-6 place-items-center rounded-sm bg-muted">
                  <ShoppingBag className="size-3 text-foreground" />
                </CardAction>
              </CardHeader>
              <CardContent>
                <div className="text-sm">
                  <Delta value={pctDelta(articles ?? 0, prevResume?.nb_articles)} positive />{" "}
                  <span className="text-muted-foreground"> vs hier</span>
                </div>
              </CardContent>
            </Card>

            <Card className="h-full rounded-none border-0 border-border border-b ring-0 md:border-r">
              <CardHeader>
                <CardTitle className="font-normal text-sm">Négatifs du jour</CardTitle>
                <CardDescription className="text-3xl text-foreground tabular-nums leading-none tracking-tight">
                  {negatifs ?? 6}
                </CardDescription>
                <CardAction className="grid size-6 place-items-center rounded-sm bg-muted">
                  <Users className="size-3 text-foreground" />
                </CardAction>
              </CardHeader>
              <CardContent>
                <div className="text-sm">
                  <Delta
                    value={pctDelta(negatifs ?? 0, prevResume ? prevResume.nouveaux + prevResume.persistants : null)}
                    positive={false}
                  />{" "}
                  <span className="text-muted-foreground"> vs hier</span>
                </div>
              </CardContent>
            </Card>

            <Card className="h-full rounded-none border-0 border-border border-b ring-0">
              <CardHeader>
                <CardTitle className="font-normal text-sm">Sans compensateur</CardTitle>
                <CardDescription className="text-3xl text-foreground tabular-nums leading-none tracking-tight">
                  {sansCompensateur === null ? "3" : sansCompensateur.toLocaleString("fr-FR")}
                </CardDescription>
                <CardAction className="grid size-6 place-items-center rounded-sm bg-muted">
                  <ShieldAlert className="size-3 text-foreground" />
                </CardAction>
              </CardHeader>
              <CardContent>
                <div className="text-sm">
                  <Delta value={pctDelta(sansCompensateur ?? 0, prevResume?.sans_compensateur)} positive={false} />{" "}
                  <span className="text-muted-foreground"> vs jour précédent</span>
                </div>
              </CardContent>
            </Card>

            <Card className="h-full rounded-none border-0 border-border border-b ring-0 md:border-r md:border-b-0">
              <CardHeader>
                <CardTitle className="font-normal text-sm">Corrigés sous 7 j</CardTitle>
                <CardDescription className="text-3xl text-foreground tabular-nums leading-none tracking-tight">
                  {corrigesSous7j === null
                    ? "78%"
                    : `${corrigesSous7j.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}%`}
                </CardDescription>
                <CardAction className="grid size-6 place-items-center rounded-sm bg-muted">
                  <RotateCcw className="size-3 text-foreground" />
                </CardAction>
              </CardHeader>
              <CardContent>
                <div className="text-sm">
                  <Delta value={pctDelta(corrigesSous7j ?? 0, prevStats?.corriges_sous_7j)} positive />{" "}
                  <span className="text-muted-foreground"> vs jour précédent</span>
                </div>
              </CardContent>
            </Card>

            <Card className="h-full rounded-none border-0 ring-0">
              <CardHeader>
                <CardTitle className="font-normal text-sm">Disponibilité</CardTitle>
                <CardDescription className="text-3xl text-foreground tabular-nums leading-none tracking-tight">
                  {dispo === null ? "99.9%" : `${dispo.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}%`}
                </CardDescription>
                <CardAction className="grid size-6 place-items-center rounded-sm bg-muted">
                  <PackageCheck className="size-3 text-foreground" />
                </CardAction>
              </CardHeader>
              <CardContent>
                <div className="text-sm">
                  <Delta
                    value={pctDelta(
                      dispo ?? 0,
                      prevStats && prevStats.nb_articles > 0
                        ? (prevStats.en_stock / prevStats.nb_articles) * 100
                        : null,
                    )}
                    positive
                  />{" "}
                  <span className="text-muted-foreground"> vs jour précédent</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="h-full rounded-none border-0 ring-0 xl:col-span-7">
            <CardHeader>
              <CardTitle className="font-normal">Total PRMP passé négatif — par jour</CardTitle>
              <CardAction>
                <ArrowUpRight className="size-4" />
              </CardAction>
            </CardHeader>

            <CardContent>
              <ChartContainer config={revenueOverviewConfig} className="h-74 w-full xl:h-80 2xl:h-88">
                <ComposedChart accessibilityLayer data={chartData} margin={{ bottom: 0, left: 0, right: 0, top: 0 }}>
                  <defs>
                    <filter id="mix2-kpi-glow" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="4" result="blur" />
                      <feFlood floodColor="var(--color-revenue)" floodOpacity="0.35" />
                      <feComposite in2="blur" operator="in" />
                      <feMerge>
                        <feMergeNode />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>
                  <CartesianGrid yAxisId="revenue" vertical={false} />
                  <XAxis
                    dataKey="period"
                    axisLine={false}
                    height={30}
                    interval={realChart ? "preserveStartEnd" : 0}
                    minTickGap={0}
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    tickMargin={8}
                    tickFormatter={(value) => (realChart ? String(value) : formatMonthTick(String(value)))}
                  />
                  <YAxis yAxisId="revenue" hide domain={realChart ? [0, "dataMax + 2"] : [300_000, 1_000_000]} />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        className="w-40"
                        labelFormatter={(value) =>
                          realChart ? `Jour ${String(value)}` : formatTooltipLabel(String(value))
                        }
                        formatter={(value, name, item) => (
                          <>
                            <div
                              className="size-2.5 shrink-0 rounded-[2px]"
                              style={{
                                backgroundColor: item.color,
                              }}
                            />
                            <div className="flex flex-1 items-center justify-between leading-none">
                              <span className="text-muted-foreground">{String(name ?? "")}</span>
                              <span className="font-medium font-mono text-foreground tabular-nums">
                                {formatCurrencyTooltipValue(value)}
                              </span>
                            </div>
                          </>
                        )}
                      />
                    }
                    cursor={{
                      stroke: "var(--border)",
                      strokeDasharray: "4 4",
                    }}
                  />
                  <Area
                    yAxisId="revenue"
                    dataKey="revenue"
                    fill="none"
                    filter="url(#mix2-kpi-glow)"
                    name={realChart ? "PRMP négatif" : "Valeur"}
                    stroke="var(--color-revenue)"
                    strokeWidth={1.8}
                    type="linear"
                    activeDot={{
                      r: 4,
                      fill: "var(--background)",
                      stroke: "var(--color-revenue)",
                      strokeWidth: 2,
                    }}
                    dot={false}
                  />
                </ComposedChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
