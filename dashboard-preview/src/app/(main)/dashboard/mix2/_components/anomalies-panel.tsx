"use client";

import { useMemo, useState } from "react";

import type { ReactNode } from "react";

import { ArrowUpDown, ChevronDown, ChevronUp, Percent, Search, Tag, TrendingDown, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

import type { GammeAnomalie, GammeNegatif } from "../_lib/gamme";
import { articleDetailFromAnomalie, type CompensateurDetail, type ArticleDetail } from "./article-details";
import { ArticleDrawer } from "./article-drawer";

const TYPE_LABELS: Record<string, string> = {
  hausse_forte: "Hausses fortes",
  chute_forte: "Chutes fortes",
  promo_active: "Promos actives",
  marge_negative: "Marges négatives",
};

const TYPE_ICONS: Record<string, typeof Search> = {
  hausse_forte: TrendingUp,
  chute_forte: TrendingDown,
  promo_active: Tag,
  marge_negative: Percent,
};

const PRIORITY = ["hausse_forte", "chute_forte", "promo_active", "marge_negative"];

const PAGE_SIZE = 25;

type SortKey = "code" | "libelle" | "fournisseur" | "stock" | "px_revient" | "impact";

function fmtFdj(v: number | null): string {
  if (v === null || v === undefined) return "—";
  return `${Math.abs(Math.round(v)).toLocaleString("fr-FR")} FDJ`;
}

function impactOf(a: GammeAnomalie): number {
  return Math.abs((a.stock ?? 0) * (a.px_revient ?? 0));
}

export function AnomaliesPanel({
  anomalies,
  count,
  negatifs,
  children,
}: {
  anomalies: GammeAnomalie[] | null;
  count: number | null;
  negatifs: GammeNegatif[] | null;
  children: ReactNode;
}) {
  const items = anomalies ?? [];
  const total = count ?? items.length;

  const [filter, setFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("impact");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const [page, setPage] = useState(0);
  const [selectedCode, setSelectedCode] = useState<number | null>(null);

  const byType = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of items) m.set(a.type, (m.get(a.type) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => PRIORITY.indexOf(a[0]) - PRIORITY.indexOf(b[0]));
  }, [items]);

  const negMap = useMemo(() => new Map((negatifs ?? []).map((n) => [n.code, n])), [negatifs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((a) => filter === null || a.type === filter)
      .filter(
        (a) =>
          q === "" ||
          String(a.code ?? "").includes(q) ||
          (a.libelle ?? "").toLowerCase().includes(q) ||
          (a.fournisseur ?? "").toLowerCase().includes(q),
      )
      .sort((a, b) => {
        const dir = sortDir;
        switch (sortKey) {
          case "code":
            return ((a.code ?? 0) - (b.code ?? 0)) * dir;
          case "libelle":
            return (a.libelle ?? "").localeCompare(b.libelle ?? "") * dir;
          case "fournisseur":
            return (a.fournisseur ?? "").localeCompare(b.fournisseur ?? "") * dir;
          case "stock":
            return ((a.stock ?? 0) - (b.stock ?? 0)) * dir;
          case "px_revient":
            return ((a.px_revient ?? 0) - (b.px_revient ?? 0)) * dir;
          case "impact":
            return (impactOf(a) - impactOf(b)) * dir;
        }
      });
  }, [items, filter, query, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 1 ? -1 : 1));
    } else {
      setSortKey(key);
      setSortDir(key === "libelle" || key === "fournisseur" ? 1 : -1);
    }
  };

  const selected = selectedCode !== null ? items.find((a) => a.code === selectedCode) ?? null : null;
  const selectedCompensateurs: CompensateurDetail[] = useMemo(() => {
    const comps = selected ? (negMap.get(selected.code ?? -1)?.compensateurs ?? []) : [];
    return comps.map((c) => ({
      code: c.code ?? 0,
      libelle: c.libelle ?? "—",
      px_revient: c.px_revient ?? 0,
      px_vente: c.px_vente ?? 0,
      stock: c.stock ?? 0,
      couv: c.couv,
      confiance: (["fort", "moyen", "faible", "aucun"].includes(c.confiance ?? "")
        ? c.confiance
        : "aucun") as CompensateurDetail["confiance"],
      justification: c.justification ?? "—",
    }));
  }, [selected, negMap]);
  const selectedDetail: ArticleDetail | null = selected
    ? articleDetailFromAnomalie(selected, selectedCompensateurs)
    : null;

  const SortHead = ({ label, k, className }: { label: string; k: SortKey; className?: string }) => (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className={cn(
          "inline-flex items-center gap-1 transition hover:text-foreground",
          sortKey === k && "text-foreground",
        )}
      >
        {label}
        {sortKey === k ? (sortDir === 1 ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />) : <ArrowUpDown className="size-3 opacity-50" />}
      </button>
    </TableHead>
  );

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="flex max-h-[85vh] w-full flex-col gap-4 overflow-hidden sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="text-lg">Anomalies du jour — {total.toLocaleString("fr-FR")}</DialogTitle>
          <DialogDescription>
            {filtered.length.toLocaleString("fr-FR")} affichées · cliquez sur une ligne pour ouvrir la fiche article.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-64">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
              placeholder="Rechercher code, libellé, fournisseur…"
              className="pl-8"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => {
                setFilter(null);
                setPage(0);
              }}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition",
                filter === null
                  ? "border-primary bg-primary/10 text-primary"
                  : "bg-muted/40 text-muted-foreground hover:bg-muted",
              )}
            >
              Tous · {total}
            </button>
            {byType.map(([type, n]) => {
              const Icon = TYPE_ICONS[type] ?? Search;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    setFilter(filter === type ? null : type);
                    setPage(0);
                  }}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition",
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
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded-lg border">
          <Table className="w-full">
            <TableHeader className="**:data-[slot=table-head]:h-11 **:data-[slot=table-head]:font-normal **:data-[slot=table-head]:text-xs **:data-[slot=table-head]:whitespace-nowrap">
              <TableRow>
                <SortHead label="Code" k="code" />
                <SortHead label="Libellé" k="libelle" />
                <SortHead label="Fournisseur" k="fournisseur" />
                <TableHead>Type</TableHead>
                <SortHead label="Stock" k="stock" className="text-right" />
                <SortHead label="Px revient" k="px_revient" className="text-right" />
                <TableHead className="text-right">Px vente</TableHead>
                <SortHead label="Impact" k="impact" className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody className="**:data-[slot='table-row']:border-border/50 **:data-[slot='table-cell']:py-2.5 **:data-[slot='table-cell']:text-sm">
              {visible.length ? (
                visible.map((a, i) => {
                  const Icon = TYPE_ICONS[a.type] ?? Search;
                  return (
                    <TableRow
                      key={`${a.code}-${a.type}-${i}`}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => setSelectedCode(a.code)}
                    >
                      <TableCell className="font-mono text-xs text-muted-foreground">#{a.code ?? "—"}</TableCell>
                      <TableCell className="max-w-56 truncate font-medium" title={a.libelle ?? undefined}>
                        {a.libelle ?? "—"}
                      </TableCell>
                      <TableCell
                        className="max-w-40 truncate text-xs text-muted-foreground"
                        title={a.fournisseur ?? undefined}
                      >
                        {a.fournisseur ?? "—"}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground">
                          <Icon className="size-3" />
                          {TYPE_LABELS[a.type] ?? a.type}
                        </span>
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums",
                          (a.stock ?? 0) < 0 ? "text-destructive" : "text-muted-foreground",
                        )}
                      >
                        {a.stock ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmtFdj(a.px_revient)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtFdj(a.px_vente)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{fmtFdj(impactOf(a))}</TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell className="h-24 text-center" colSpan={8}>
                    Aucune anomalie correspondante.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="text-muted-foreground text-xs tabular-nums">
            Page {safePage + 1} / {pageCount} · {filtered.length.toLocaleString("fr-FR")} ligne
            {filtered.length > 1 ? "s" : ""}
          </p>
          <div className="flex gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={safePage === 0}
              onClick={() => setPage(safePage - 1)}
            >
              Précédent
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage(safePage + 1)}
            >
              Suivant
            </Button>
          </div>
        </div>
      </DialogContent>

      <ArticleDrawer
        code={selectedCode}
        onOpenChange={(open) => !open && setSelectedCode(null)}
        detail={selectedDetail}
      />
    </Dialog>
  );
}