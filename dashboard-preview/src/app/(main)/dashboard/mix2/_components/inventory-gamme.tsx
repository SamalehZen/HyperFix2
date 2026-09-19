"use client";

import { Archive, ArrowUpRight, PackageCheck, PackageX, TrendingDown, TriangleAlert } from "lucide-react";

import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import Wheel from "@/components/wheel";

const chartData = [{ month: "current", "in-stock": 9208, "low-stock": 155, "out-of-stock": 6 }];

import type { GammeStats } from "../_lib/gamme";

export function InventoryGamme({ stats }: { stats: GammeStats | null }) {
  const inStock = stats?.en_stock ?? chartData[0]["in-stock"];
  const lowStock = stats?.stock_bas ?? chartData[0]["low-stock"];
  const outOfStock =
    stats && stats.nb_articles > 0
      ? Math.max(0, stats.nb_articles - stats.en_stock - (stats.negatifs ?? 0))
      : chartData[0]["out-of-stock"];
  const negatifs = stats?.negatifs ?? 0;
  const dormants = stats?.dormants ?? 42;

  const totalUnits = inStock + lowStock + outOfStock;
  const availablePercent = totalUnits > 0 ? Math.round((inStock / totalUnits) * 100) : 0;

  const inventorySummary = [
    {
      icon: PackageCheck,
      label: "En stock",
      value: inStock,
    },
    {
      icon: TriangleAlert,
      label: "Stock bas",
      value: lowStock,
    },
    {
      icon: PackageX,
      label: "Ruptures",
      value: outOfStock,
    },
    {
      icon: TrendingDown,
      label: "Négatifs",
      value: negatifs,
    },
    {
      icon: Archive,
      label: "Dormants",
      value: dormants,
    },
  ] as const;

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="font-normal text-muted-foreground text-sm">État du stock</CardTitle>
        <CardDescription className="text-foreground text-xl tabular-nums leading-none tracking-tight">
          {availablePercent}% disponible
        </CardDescription>
        <CardAction>
          <ArrowUpRight className="size-4" />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="mx-auto w-fit">
          <Wheel value={availablePercent} label="Disponibilité du stock" size={270} />
        </div>
        <Separator />

        <div className="grid grid-cols-5 divide-x">
          {inventorySummary.map((item, _index) => (
            <div key={item.label} className="flex flex-col items-center gap-3 text-center">
              <div className="grid size-9 place-items-center rounded-full bg-muted">
                <item.icon className="size-4 text-muted-foreground" />
              </div>
              <div>
                <div className="text-muted-foreground text-xs leading-none">{item.label}</div>
                <div className="font-medium text-sm tabular-nums">{item.value.toLocaleString("fr-FR")}</div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
