"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, TrendingDown, TrendingUp, Tag, Percent } from "lucide-react";

const TYPE_LABELS: Record<string, string> = {
  hausse_forte: "Hausses fortes",
  chute_forte: "Chutes fortes",
  promo_active: "Promos actives",
  marge_negative: "Marges négatives",
};

const TYPE_ICONS: Record<string, typeof AlertTriangle> = {
  hausse_forte: TrendingUp,
  chute_forte: TrendingDown,
  promo_active: Tag,
  marge_negative: Percent,
};

const PRIORITY = ["hausse_forte", "chute_forte", "promo_active", "marge_negative"];

export interface AnomalieRow {
  code: number | null;
  type: string;
  description: string | null;
}

export function AnomaliesPanel({
  anomalies,
  count,
}: {
  anomalies: AnomalieRow[] | null;
  count: number | null;
}) {
  const items = anomalies ?? [];
  const total = count ?? items.length;
  const byType = new Map<string, number>();
  for (const a of items) {
    byType.set(a.type, (byType.get(a.type) ?? 0) + 1);
  }
  const groups = [...byType.entries()].sort(
    (a, b) => PRIORITY.indexOf(a[0]) - PRIORITY.indexOf(b[0]),
  );

  const highlighted = items.filter((a) => a.type === "hausse_forte" || a.type === "chute_forte");

  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <CardTitle className="font-normal text-muted-foreground text-sm">Anomalies du jour</CardTitle>
        <CardDescription className="text-foreground text-xl leading-none tracking-tight tabular-nums">
          {total.toLocaleString("fr-FR")} anomalies
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3 overflow-hidden">
        <div className="flex flex-wrap gap-1.5">
          {groups.map(([type, n]) => {
            const Icon = TYPE_ICONS[type] ?? AlertTriangle;
            return (
              <span
                key={type}
                className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground"
              >
                <Icon className="size-3" />
                {TYPE_LABELS[type] ?? type} · {n}
              </span>
            );
          })}
        </div>

        {highlighted.length > 0 ? (
          <ScrollArea className="min-h-0 flex-1">
            <ul className="space-y-1.5">
              {highlighted.map((a, i) => (
                <li
                  key={`${a.code}-${a.type}-${i}`}
                  className="rounded-md border bg-destructive/5 px-2 py-1.5 text-xs"
                >
                  <span className="font-medium text-foreground">#{a.code}</span>{" "}
                  <span className="text-muted-foreground">{a.description}</span>
                </li>
              ))}
            </ul>
          </ScrollArea>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Aucune variation de stock
          </div>
        )}
      </CardContent>
    </Card>
  );
}