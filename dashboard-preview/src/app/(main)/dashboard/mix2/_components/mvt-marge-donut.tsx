"use client";

import { Cell, Label, Pie, PieChart } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

import { fmtFdj } from "../_lib/mouvements";

const config = {
  marge: { label: "Marge encaissée", color: "var(--chart-2)" },
  cout: { label: "Coût", color: "var(--chart-4)" },
} satisfies ChartConfig;

export function MvtMargeDonut({
  marge,
  cout,
  margePct,
  caPromo,
}: {
  marge: number;
  cout: number;
  margePct: number | null;
  caPromo: number;
}) {
  const data = [
    { name: "marge", value: Math.max(0, marge) },
    { name: "cout", value: Math.max(0, cout) },
  ];
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="font-normal text-muted-foreground text-sm">Marge encaissée</CardTitle>
        <CardDescription className="text-foreground text-xl tabular-nums leading-none tracking-tight">
          {fmtFdj(marge)}
          {margePct != null ? ` (${margePct}%)` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ChartContainer config={config} className="mx-auto aspect-square max-h-52">
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent />} />
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={60} outerRadius={85} strokeWidth={2}>
              <Cell fill="var(--color-marge)" />
              <Cell fill="var(--color-cout)" />
              <Label
                content={({ viewBox }) => {
                  if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                    return (
                      <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                        <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-xl font-bold tabular-nums">
                          {margePct != null ? `${margePct}%` : "—"}
                        </tspan>
                      </text>
                    );
                  }
                }}
              />
            </Pie>
          </PieChart>
        </ChartContainer>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Coût des ventes</span>
          <span className="tabular-nums">{fmtFdj(cout)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">dont CA promo</span>
          <span className="tabular-nums">{fmtFdj(caPromo)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
