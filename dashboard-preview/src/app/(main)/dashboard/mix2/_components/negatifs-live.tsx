"use client";

import { Ellipsis } from "lucide-react";
import { Bar, BarChart, XAxis, YAxis } from "recharts";

import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

import type { GammeStory } from "../_lib/gamme";
import { TYPE_LABELS } from "./anomalies-panel";

const chartConfig = {
  count: {
    color: "var(--destructive)",
    label: "Anomalies",
  },
} satisfies ChartConfig;

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

export function NegatifsLive({ story, jour }: { story: GammeStory | null; jour: string | null }) {
  const total = story ? story.resume.nouveaux + story.resume.persistants : 6;
  const topArticles = topArticlesFrom(story) ?? [
    { code: "#15295", libelle: "Lanières dindes fumées", count: 2, color: "var(--destructive)" },
    { code: "#13080", libelle: "Alk paratha plain", count: 2, color: "var(--chart-1)" },
    { code: "#14872", libelle: "Haché boeuf traiteur", count: 1, color: "var(--chart-2)" },
    { code: "#13125", libelle: "Crêpe chocolat", count: 1, color: "var(--chart-4)" },
  ];

  const barData = story
    ? Object.entries(story.types_anom).map(([type, count]) => ({
        type,
        label: TYPE_LABELS[type] ?? type,
        count,
      }))
    : [];

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
        <div className="text-muted-foreground text-xs">
          Anomalies du jour{jour ? ` · ${jour.slice(5).replace("-", "/")}` : ""}
        </div>
        {barData.length > 0 ? (
          <ChartContainer config={chartConfig} className="h-36 w-full xl:h-44 2xl:h-48">
            <BarChart data={barData} margin={{ bottom: 0, left: 0, right: 0, top: 0 }} barCategoryGap={8}>
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} interval={0} />
              <YAxis hide domain={[0, (dataMax: number) => Math.max(4, dataMax + 5)]} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
              <Bar dataKey="count" fill="var(--destructive)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ChartContainer>
        ) : (
          <div className="flex h-36 items-center justify-center text-sm text-muted-foreground xl:h-44 2xl:h-48">
            Aucune anomalie
          </div>
        )}
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