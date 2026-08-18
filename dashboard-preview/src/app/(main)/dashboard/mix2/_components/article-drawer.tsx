"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts";

import { Badge } from "@/components/ui/badge";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

import { type ArticleDetail, getArticleDetail } from "./article-details";

const chartConfig = {
  stock: {
    label: "Stock",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

const statutLabels: Record<string, string> = {
  nouveau: "Nouveau",
  persistant: "Persistant",
  corrige: "Corrigé",
};

const prioriteBadgeClass: Record<string, string> = {
  critique: "border-red-700/25 bg-destructive/10 text-red-700 dark:border-red-300/25 dark:text-red-300",
  important: "border-yellow-700/25 bg-yellow-500/10 text-yellow-700 dark:border-yellow-300/25 dark:text-yellow-300",
  surveiller: "",
  corrige: "border-green-700/25 bg-green-500/10 text-green-700 dark:border-green-300/25 dark:text-green-300",
};

const confianceBadgeClass: Record<string, string> = {
  fort: "border-green-700/25 bg-green-500/10 text-green-700 dark:border-green-300/25 dark:text-green-300",
  moyen: "border-yellow-700/25 bg-yellow-500/10 text-yellow-700 dark:border-yellow-300/25 dark:text-yellow-300",
  faible: "",
  aucun: "border-red-700/25 bg-destructive/10 text-red-700 dark:border-red-300/25 dark:text-red-300",
};

function fmtFdj(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return `${v.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} FDJ`;
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "negative" | "positive" }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-xs leading-none">{label}</span>
      <span
        className={`font-medium text-sm leading-none tabular-nums ${
          tone === "negative" ? "text-destructive" : tone === "positive" ? "text-green-700 dark:text-green-300" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function DrawerBody({ detail }: { detail: ArticleDetail }) {
  const variation = detail.stock_j1 === null ? null : Math.round((detail.stock_j - detail.stock_j1) * 10) / 10;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-3 gap-4 rounded-lg border p-4 sm:grid-cols-4">
        <Kpi label="Stock J-1" value={detail.stock_j1 === null ? "—" : String(detail.stock_j1)} />
        <Kpi label="Stock J" value={String(detail.stock_j)} tone={detail.stock_j < 0 ? "negative" : "positive"} />
        <Kpi
          label="Variation"
          value={variation === null ? "—" : `${variation > 0 ? "+" : ""}${variation}`}
          tone={variation !== null && variation < 0 ? "negative" : undefined}
        />
        <Kpi label="Jours négatifs" value={detail.jours_consecutifs ? `${detail.jours_consecutifs} j` : "0"} />
        <Kpi label="Px revient" value={fmtFdj(detail.px_revient)} />
        <Kpi label="Px vente" value={fmtFdj(detail.px_vente)} />
        <Kpi label="Couverture" value={detail.couv === null ? "—" : `${detail.couv} j`} />
        <Kpi label="1re apparition" value={detail.premiere_apparition} />
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="font-medium text-sm leading-none">Historique du stock — 7 jours</h3>
        <ChartContainer config={chartConfig} className="h-48 w-full">
          <AreaChart accessibilityLayer data={detail.hist7} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="fillStock" x1="0" x2="0" y1="0" y2="1">
                <stop offset="5%" stopColor="var(--color-stock)" stopOpacity={0.25} />
                <stop offset="95%" stopColor="var(--color-stock)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis axisLine={false} dataKey="jour" tick={{ fontSize: 11 }} tickLine={false} tickMargin={8} />
            <YAxis axisLine={false} tickLine={false} width={30} />
            <ChartTooltip
              content={<ChartTooltipContent />}
              cursor={{ stroke: "var(--border)", strokeDasharray: "4 4" }}
            />
            <ReferenceLine stroke="var(--destructive)" strokeDasharray="4 4" y={0} />
            <Area
              dataKey="stock"
              fill="url(#fillStock)"
              name="Stock"
              stroke="var(--color-stock)"
              strokeWidth={2}
              type="monotone"
            />
          </AreaChart>
        </ChartContainer>
      </div>

      <Separator />

      <div className="flex flex-col gap-3">
        <h3 className="font-medium text-sm leading-none">
          {detail.compensateurs.length > 0
            ? `Compensateurs proposés (${detail.compensateurs.length})`
            : "Compensateurs proposés"}
        </h3>
        {detail.compensateurs.length === 0 ? (
          <p className="text-muted-foreground text-sm">Aucun compensateur à proposer pour cet article.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {detail.compensateurs.map((comp) => (
              <div key={comp.code} className="flex flex-col gap-2 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-sm">{comp.libelle}</div>
                    <div className="text-muted-foreground text-xs tabular-nums">
                      #{comp.code} · {fmtFdj(comp.px_revient)} · stock {comp.stock} · couv.{" "}
                      {comp.couv === null ? "—" : `${comp.couv} j`}
                    </div>
                  </div>
                  <Badge variant="outline" className={confianceBadgeClass[comp.confiance] ?? ""}>
                    {comp.confiance}
                  </Badge>
                </div>
                <p className="text-muted-foreground text-xs leading-relaxed">{comp.justification}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function ArticleDrawer({
  code,
  onOpenChange,
  detail,
}: {
  code: number | null;
  onOpenChange: (open: boolean) => void;
  detail?: ArticleDetail | null;
}) {
  const resolved = code !== null ? (detail ?? getArticleDetail(code)) : null;

  return (
    <Sheet open={code !== null} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-4 overflow-y-auto p-4 sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex flex-wrap items-center gap-2 pr-6 text-base leading-snug">
            {resolved ? resolved.libelle : "Article"}
          </SheetTitle>
          {resolved ? (
            <SheetDescription className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs">#{resolved.code}</span>
              <Badge variant="outline">{statutLabels[resolved.statut]}</Badge>
              <Badge variant="outline" className={prioriteBadgeClass[resolved.priorite] ?? ""}>
                {resolved.priorite === "critique" && <TrendingDown className="size-3" />}
                {resolved.priorite === "corrige" && <TrendingUp className="size-3" />}
                {resolved.priorite.charAt(0).toUpperCase() + resolved.priorite.slice(1)}
              </Badge>
            </SheetDescription>
          ) : null}
        </SheetHeader>
        {resolved ? <DrawerBody detail={resolved} /> : null}
      </SheetContent>
    </Sheet>
  );
}
