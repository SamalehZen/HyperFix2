"use client";

import { Ellipsis } from "lucide-react";
import { Bar, BarChart, type BarShapeProps, XAxis, YAxis } from "recharts";

import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

const realtimeData = [
  { minute: 1, alertes: 0 },
  { minute: 2, alertes: 1 },
  { minute: 3, alertes: 2 },
  { minute: 4, alertes: 3 },
  { minute: 5, alertes: 2 },
  { minute: 6, alertes: 0 },
  { minute: 7, alertes: 1 },
  { minute: 8, alertes: 1 },
  { minute: 9, alertes: 0 },
  { minute: 10, alertes: 1 },
  { minute: 11, alertes: 0 },
  { minute: 12, alertes: 3 },
  { minute: 13, alertes: 2 },
  { minute: 14, alertes: 1 },
  { minute: 15, alertes: 1 },
  { minute: 16, alertes: 0 },
  { minute: 17, alertes: 1 },
  { minute: 18, alertes: 2 },
  { minute: 19, alertes: 3 },
  { minute: 20, alertes: 0 },
  { minute: 21, alertes: 1 },
  { minute: 22, alertes: 3 },
  { minute: 23, alertes: 2 },
  { minute: 24, alertes: 0 },
  { minute: 25, alertes: 1 },
  { minute: 26, alertes: 1 },
  { minute: 27, alertes: 0 },
  { minute: 28, alertes: 3 },
  { minute: 29, alertes: 0 },
  { minute: 30, alertes: 1 },
];

const chartConfig = {
  alertes: {
    color: "var(--chart-3)",
    label: "Alertes",
  },
} satisfies ChartConfig;

import type { GammeStory } from "../_lib/gamme";

const articleColors = ["var(--destructive)", "var(--chart-1)", "var(--chart-2)", "var(--chart-4)"];

function topArticlesFrom(story: GammeStory | null) {
  if (!story) return null;
  return story.top_neg.slice(0, 4).map((t, index) => ({
    code: `#${t.code}`,
    libelle: t.libelle,
    count: Math.abs(t.stock ?? 0),
    color: articleColors[index % articleColors.length],
  }));
}

function RealtimeBarShape(props: BarShapeProps) {
  const { height, payload, width, x, y } = props;
  const barPayload = payload as (typeof realtimeData)[number] | undefined;
  const barHeightValue = Number(height);
  const barWidthValue = Number(width);
  const xValue = Number(x);
  const yValue = Number(y);
  const alertes = barPayload?.alertes ?? 0;
  const fill = "var(--color-alertes)";
  const fillOpacity = alertes >= 3 ? 0.95 : 0.4;
  const baselineFill = alertes === 0 ? "var(--destructive)" : fill;
  const baselineOpacity = alertes === 0 ? 1 : fillOpacity;
  const baselineY = yValue + barHeightValue - 2;
  const barGap = 4;
  const barHeight = Math.max(0, barHeightValue - barGap);

  return (
    <g>
      <rect
        x={xValue}
        y={baselineY}
        width={barWidthValue}
        height={2}
        rx={1}
        fill={baselineFill}
        fillOpacity={baselineOpacity}
      />
      {alertes > 0 && barHeight > 0 ? (
        <rect
          x={xValue}
          y={yValue}
          width={barWidthValue}
          height={barHeight}
          rx={2}
          fill={fill}
          fillOpacity={fillOpacity}
        />
      ) : null}
    </g>
  );
}

export function NegatifsLive({ story }: { story: GammeStory | null }) {
  const total = story ? story.resume.nouveaux + story.resume.persistants : 6;
  const topArticles = topArticlesFrom(story) ?? [
    { code: "#15295", libelle: "Lanières dindes fumées", count: 2, color: "var(--destructive)" },
    { code: "#13080", libelle: "Alk paratha plain", count: 2, color: "var(--chart-1)" },
    { code: "#14872", libelle: "Haché boeuf traiteur", count: 1, color: "var(--chart-2)" },
    { code: "#13125", libelle: "Crêpe chocolat", count: 1, color: "var(--chart-4)" },
  ];

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="font-normal">Négatifs en direct</CardTitle>
        <CardAction>
          <Ellipsis className="size-4" />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-end justify-between">
          <div className="flex items-baseline gap-1">
            <span className="text-2xl tabular-nums leading-none tracking-tight">{total}</span>
            <span className="text-muted-foreground text-sm">articles</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-green-500 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-green-500" />
            </span>
            <span>Du jour</span>
          </div>
        </div>
        <ChartContainer config={chartConfig} className="h-36 w-full xl:h-44 2xl:h-48">
          <BarChart data={realtimeData} margin={{ bottom: 0, left: 0, right: 0, top: 0 }} barCategoryGap={3}>
            <XAxis dataKey="minute" hide />
            <YAxis hide domain={[0, 4]} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
            <Bar dataKey="alertes" fill="var(--color-alertes)" shape={RealtimeBarShape} />
          </BarChart>
        </ChartContainer>
        <div className="grid grid-cols-2">
          {topArticles.map((article, index) => (
            <div
              key={article.code}
              className={`flex items-center gap-3 border-border/50 pt-1 pb-4 ${
                index % 2 === 0 ? "border-r border-b pr-5" : "border-b pl-5"
              } ${index >= 2 ? "pt-4 pb-1" : ""}`}
            >
              <span
                aria-hidden="true"
                className="shrink-0 rounded-xs size-4 ring-1 ring-foreground/10"
                style={{ backgroundColor: article.color }}
              />
              <span className="min-w-0 flex-1 truncate text-sm">{article.libelle}</span>
              <span className="text-sm tabular-nums">{article.count}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
