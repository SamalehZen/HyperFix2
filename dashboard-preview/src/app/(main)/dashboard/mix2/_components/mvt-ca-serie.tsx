"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

import type { MvtSerieJour } from "../_lib/mouvements";

const config = {
  ca: { label: "CA", color: "var(--chart-1)" },
  marge: { label: "Marge", color: "var(--chart-2)" },
} satisfies ChartConfig;

export function MvtCaSerie({ serie }: { serie: MvtSerieJour[] }) {
  if (!serie.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>CA + marge encaissée</CardTitle>
          <CardDescription>Pas de données sur la période.</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  const data = serie.map((p) => ({
    jour: p.jour.slice(5),
    ca: p.ca,
    marge: p.marge,
  }));
  return (
    <Card>
      <CardHeader>
        <CardTitle>CA + marge encaissée</CardTitle>
        <CardDescription>
          {serie[0].jour} → {serie[serie.length - 1].jour} · jours sans fichier reliés en pointillés
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="h-64 w-full">
          <LineChart data={data}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="jour" tickLine={false} tickMargin={8} minTickGap={24} />
            <YAxis tickLine={false} tickMargin={8} width={70} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Line dataKey="ca" type="monotone" stroke="var(--color-ca)" strokeWidth={2.5} dot={false} connectNulls />
            <Line
              dataKey="marge"
              type="monotone"
              stroke="var(--color-marge)"
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              connectNulls
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
