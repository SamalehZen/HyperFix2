"use client";

import { useState } from "react";

import { format, subMinutes } from "date-fns";
import { fr } from "date-fns/locale";
import { ArrowUpRight } from "lucide-react";
import { Area, AreaChart, CartesianGrid, Line, XAxis, YAxis } from "recharts";

import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

const trafficIntervalMinutes = 15;

const trafficPoints = [
  { passages: 280, anomalies: 8 },
  { passages: 420, anomalies: 4 },
  { passages: 360, anomalies: 3 },
  { passages: 140, anomalies: 2 },
  { passages: 80, anomalies: 1 },
  { passages: 600, anomalies: 4 },
  { passages: 260, anomalies: 3 },
  { passages: 70, anomalies: 2 },
  { passages: 90, anomalies: 1 },
  { passages: 180, anomalies: 4 },
  { passages: 150, anomalies: 3 },
  { passages: 60, anomalies: 2 },
  { passages: 430, anomalies: 1 },
  { passages: 110, anomalies: 4 },
  { passages: 260, anomalies: 3 },
  { passages: 120, anomalies: 2 },
  { passages: 90, anomalies: 1 },
  { passages: 40, anomalies: 8 },
  { passages: 75, anomalies: 3 },
  { passages: 0, anomalies: 2 },
  { passages: 15, anomalies: 1 },
  { passages: 35, anomalies: 4 },
  { passages: 60, anomalies: 3 },
  { passages: 95, anomalies: 2 },
  { passages: 105, anomalies: 1 },
  { passages: 120, anomalies: 4 },
  { passages: 0, anomalies: 3 },
  { passages: 25, anomalies: 2 },
  { passages: 70, anomalies: 1 },
  { passages: 110, anomalies: 4 },
  { passages: 0, anomalies: 3 },
  { passages: 140, anomalies: 2 },
  { passages: 310, anomalies: 1 },
  { passages: 120, anomalies: 4 },
  { passages: 160, anomalies: 8 },
  { passages: 30, anomalies: 2 },
  { passages: 20, anomalies: 1 },
  { passages: 0, anomalies: 4 },
  { passages: 120, anomalies: 3 },
  { passages: 210, anomalies: 2 },
  { passages: 110, anomalies: 1 },
  { passages: 190, anomalies: 4 },
  { passages: 0, anomalies: 3 },
  { passages: 85, anomalies: 2 },
  { passages: 250, anomalies: 1 },
  { passages: 40, anomalies: 4 },
  { passages: 110, anomalies: 3 },
  { passages: 0, anomalies: 2 },
  { passages: 140, anomalies: 1 },
  { passages: 95, anomalies: 4 },
  { passages: 180, anomalies: 3 },
  { passages: 620, anomalies: 18 },
  { passages: 35, anomalies: 1 },
  { passages: 330, anomalies: 4 },
  { passages: 45, anomalies: 3 },
  { passages: 0, anomalies: 2 },
  { passages: 160, anomalies: 1 },
  { passages: 190, anomalies: 4 },
  { passages: 260, anomalies: 3 },
  { passages: 90, anomalies: 2 },
  { passages: 70, anomalies: 1 },
  { passages: 180, anomalies: 4 },
  { passages: 150, anomalies: 3 },
  { passages: 280, anomalies: 2 },
  { passages: 160, anomalies: 1 },
  { passages: 20, anomalies: 4 },
  { passages: 120, anomalies: 3 },
  { passages: 200, anomalies: 2 },
  { passages: 45, anomalies: 8 },
  { passages: 115, anomalies: 4 },
  { passages: 145, anomalies: 3 },
  { passages: 40, anomalies: 2 },
  { passages: 160, anomalies: 1 },
  { passages: 170, anomalies: 4 },
  { passages: 95, anomalies: 3 },
  { passages: 140, anomalies: 2 },
  { passages: 70, anomalies: 1 },
  { passages: 230, anomalies: 4 },
  { passages: 120, anomalies: 3 },
  { passages: 65, anomalies: 2 },
  { passages: 35, anomalies: 1 },
  { passages: 0, anomalies: 4 },
  { passages: 80, anomalies: 3 },
  { passages: 180, anomalies: 2 },
  { passages: 95, anomalies: 1 },
  { passages: 140, anomalies: 8 },
  { passages: 270, anomalies: 3 },
  { passages: 110, anomalies: 2 },
  { passages: 50, anomalies: 1 },
  { passages: 230, anomalies: 18 },
  { passages: 115, anomalies: 3 },
  { passages: 80, anomalies: 2 },
  { passages: 260, anomalies: 1 },
  { passages: 20, anomalies: 4 },
  { passages: 120, anomalies: 3 },
  { passages: 5, anomalies: 2 },
] as const;

const SLOT_COUNT = 96;

function mulberry32(seedInput: number) {
  let seed = seedInput;
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashJour(jour: string | null): number {
  if (!jour) return 42;
  let hash = 0;
  for (const char of jour) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0;
  }
  return Math.abs(hash);
}

// Activité 24 h : distribution calibrée sur les totaux réels du jour
// (anomalies réelles réparties par créneau de 15 min, pic au moment de l'import ;
// passages = affluence estimée, proportionnelle aux articles suivis).
function buildTrafficData(anomalies: number | null, articles: number | null, jour: string | null) {
  const random = mulberry32(hashJour(jour));
  const points: { passages: number; anomalies: number }[] = [];

  const totalAnomalies = anomalies ?? 234;
  const articleScale = articles && articles > 0 ? articles / 9369 : 1;

  // profil horaire (0-23h) : fermeture nocturne, pic à l'import (06:40) et fin d'après-midi.
  const hourProfile = [2, 1, 1, 1, 1, 8, 35, 60, 45, 30, 25, 28, 32, 30, 28, 32, 40, 55, 70, 62, 48, 30, 12, 4];
  const profileSum = hourProfile.reduce((sum, h) => sum + h, 0);

  const rawWeights = Array.from({ length: SLOT_COUNT }, (_, i) => {
    const hour = Math.floor(i / 4);
    const importBoost = i >= 26 && i <= 28 ? 6 : 0; // 06:30–07:15, moment de l'import
    return hourProfile[hour] + importBoost + (i === 27 ? 14 : 0);
  });
  const weightSum = rawWeights.reduce((sum, w) => sum + w, 0);

  const anomaliesPerSlot = rawWeights.map((w) => (totalAnomalies * w) / weightSum);
  let distributed = anomaliesPerSlot.map((v) => Math.round(v + (random() - 0.5) * 0.6));
  const diff = totalAnomalies - distributed.reduce((sum, v) => sum + v, 0);
  distributed = distributed.map((v, i) => (i === 27 ? v + diff : v));

  for (let i = 0; i < SLOT_COUNT; i += 1) {
    const hour = Math.floor(i / 4);
    const base = hourProfile[hour];
    const passages = Math.max(0, Math.round(base * 5.4 * articleScale * (0.72 + random() * 0.56)));
    points.push({ passages, anomalies: Math.max(0, distributed[i]) });
  }

  return points;
}

function getTrafficData(anomalies: number | null, articles: number | null, jour: string | null) {
  const now = new Date(2026, 7, 18, 18, 0);

  const points =
    anomalies === null && articles === null && jour === null
      ? trafficPoints
      : buildTrafficData(anomalies, articles, jour);

  return points.map((point, index) => ({
    ...point,
    timestamp: subMinutes(now, (points.length - 1 - index) * trafficIntervalMinutes).toISOString(),
  }));
}

const trafficConfig = {
  passages: {
    label: "Passages rayon",
    color: "var(--chart-3)",
  },
  anomalies: {
    label: "Anomalies",
    color: "var(--destructive)",
  },
} satisfies ChartConfig;

function formatTrafficTooltipLabel(value: string) {
  return format(new Date(value), "HH:mm, do MMMM yyyy", { locale: fr });
}

export function RayonTraffic({
  anomalies,
  articles,
  jour,
}: {
  anomalies: number | null;
  articles: number | null;
  jour: string | null;
}) {
  const [trafficData] = useState(() => getTrafficData(anomalies, articles, jour));
  const firstTrafficTimestamp = trafficData[0].timestamp;
  const lastTrafficTimestamp = trafficData.at(-1)?.timestamp ?? "";
  const totalPassages = trafficData.reduce((sum, point) => sum + point.passages, 0);

  function formatTrafficTick(value: string) {
    if (value === firstTrafficTimestamp) {
      return "il y a 24h";
    }

    return value === lastTrafficTimestamp ? "maintenant" : "";
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="font-normal text-muted-foreground text-sm">Activité du rayon — 24 h</CardTitle>
        <CardDescription className="text-foreground text-xl tabular-nums leading-none tracking-tight">
          {totalPassages.toLocaleString("fr-FR")} passages
        </CardDescription>
        <CardAction>
          <ArrowUpRight className="size-4" />
        </CardAction>
      </CardHeader>

      <CardContent>
        <ChartContainer config={trafficConfig} className="h-54 w-full xl:h-64 2xl:h-72">
          <AreaChart accessibilityLayer data={trafficData} margin={{ bottom: 0, left: 0, right: 0, top: 8 }}>
            <defs>
              <linearGradient id="mix2FillPassages" x1="0" x2="0" y1="0" y2="1">
                <stop offset="5%" stopColor="var(--color-passages)" stopOpacity={0.28} />
                <stop offset="95%" stopColor="var(--color-passages)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              axisLine={false}
              dataKey="timestamp"
              tick={{ fontSize: 11 }}
              tickFormatter={formatTrafficTick}
              tickLine={false}
              tickMargin={10}
              ticks={[trafficData[0].timestamp, trafficData.at(-1)?.timestamp ?? ""]}
            />
            <YAxis axisLine={false} domain={[0, 650]} tickLine={false} tickMargin={6} width={36} yAxisId="traffic" />
            <ChartTooltip
              content={<ChartTooltipContent labelFormatter={(value) => formatTrafficTooltipLabel(String(value))} />}
              cursor={{ stroke: "var(--border)", strokeDasharray: "4 4" }}
            />
            <ChartLegend align="right" verticalAlign="top" className="justify-end" content={<ChartLegendContent />} />
            <Area
              dataKey="passages"
              dot={false}
              fill="url(#mix2FillPassages)"
              stroke="var(--color-passages)"
              strokeWidth={2}
              type="stepAfter"
              yAxisId="traffic"
            />
            <Line
              dataKey="anomalies"
              dot={false}
              stroke="var(--color-anomalies)"
              strokeLinecap="round"
              strokeWidth={1.2}
              type="stepAfter"
              yAxisId="traffic"
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
