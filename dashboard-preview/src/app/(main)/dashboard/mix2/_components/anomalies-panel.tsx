"use client";

import { useState } from "react";

import type { ReactNode } from "react";

import { AlertTriangle, Percent, Tag, TrendingDown, TrendingUp } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

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
  children,
}: {
  anomalies: AnomalieRow[] | null;
  count: number | null;
  children: ReactNode;
}) {
  const items = anomalies ?? [];
  const total = count ?? items.length;
  const [filter, setFilter] = useState<string | null>(null);

  const byType = new Map<string, number>();
  for (const a of items) {
    byType.set(a.type, (byType.get(a.type) ?? 0) + 1);
  }
  const groups = [...byType.entries()].sort(
    (a, b) => PRIORITY.indexOf(a[0]) - PRIORITY.indexOf(b[0]),
  );

  const filtered = items
    .filter((a) => filter === null || a.type === filter)
    .sort((a, b) => PRIORITY.indexOf(a.type) - PRIORITY.indexOf(b.type));

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="flex max-h-[80vh] flex-col gap-4 overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Anomalies du jour — {total.toLocaleString("fr-FR")}</DialogTitle>
          <DialogDescription>Cliquez sur un type pour filtrer la liste.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setFilter(null)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition",
              filter === null
                ? "border-primary bg-primary/10 text-primary"
                : "bg-muted/40 text-muted-foreground hover:bg-muted",
            )}
          >
            Tous · {total}
          </button>
          {groups.map(([type, n]) => {
            const Icon = TYPE_ICONS[type] ?? AlertTriangle;
            return (
              <button
                key={type}
                type="button"
                onClick={() => setFilter(filter === type ? null : type)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition",
                  filter === type
                    ? "border-primary bg-primary/10 text-primary"
                    : "bg-muted/40 text-muted-foreground hover:bg-muted",
                )}
              >
                <Icon className="size-3" />
                {TYPE_LABELS[type] ?? type} · {n}
              </button>
            );
          })}
        </div>

        <ScrollArea className="min-h-0 flex-1 pr-3">
          {filtered.length > 0 ? (
            <ul className="space-y-1.5">
              {filtered.map((a, i) => (
                <li
                  key={`${a.code}-${a.type}-${i}`}
                  className="rounded-md border bg-muted/30 px-2 py-1.5 text-xs"
                >
                  <span className="font-medium text-foreground">#{a.code ?? "—"}</span>{" "}
                  <span className="text-muted-foreground">{a.description}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
              Aucune anomalie
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}