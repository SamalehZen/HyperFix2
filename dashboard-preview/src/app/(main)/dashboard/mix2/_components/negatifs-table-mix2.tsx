"use client";

import * as React from "react";

import { ArrowUpDown, Download } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import type { DashboardArticleDetail, DashboardNegatifRow } from "../_lib/gamme";
import { ArticleDrawer } from "./article-drawer";

type Statut = "nouveau" | "persistant" | "corrige";
type Priorite = "critique" | "important" | "surveiller" | "corrige";
type Confiance = "fort" | "moyen" | "faible" | "aucun";

interface NegatifRow extends DashboardNegatifRow {}

const statutLabels: Record<Statut, string> = {
  nouveau: "Nouveau",
  persistant: "Persistant",
  corrige: "Corrigé",
};

const prioriteLabels: Record<Priorite, string> = {
  critique: "Critique",
  important: "Important",
  surveiller: "Surveiller",
  corrige: "Corrigé",
};

const healthStripSlots = Array.from({ length: 18 }, (_, index) => index + 1);

const prioriteScore: Record<Priorite, number> = {
  critique: 7,
  important: 11,
  surveiller: 7,
  corrige: 18,
};

const confianceScore: Record<Confiance, number> = {
  fort: 18,
  moyen: 11,
  faible: 7,
  aucun: 4,
};

const trainTones: Record<"red" | "yellow" | "green", { active: string; inactive: string }> = {
  red: { active: "bg-red-500/85", inactive: "bg-red-500/15" },
  yellow: { active: "bg-yellow-500/85", inactive: "bg-yellow-500/15" },
  green: { active: "bg-green-500/85", inactive: "bg-green-500/15" },
};

function toneForPriorite(priorite: Priorite): keyof typeof trainTones {
  if (priorite === "critique") return "red";
  if (priorite === "important" || priorite === "surveiller") return "yellow";
  return "green";
}

function toneForConfiance(confiance: Confiance): keyof typeof trainTones {
  if (confiance === "fort") return "green";
  if (confiance === "moyen") return "yellow";
  return "red";
}

function HealthTrain({ score, tone, label }: { score: number; tone: keyof typeof trainTones; label: string }) {
  const colors = trainTones[tone];
  return (
    <div className="flex items-end gap-0.5" title={label}>
      <span className="sr-only">{label}</span>
      {healthStripSlots.map((threshold) => (
        <div
          key={threshold}
          className={`h-5 w-1 rounded-full ${threshold <= score ? colors.active : colors.inactive}`}
        />
      ))}
    </div>
  );
}

const filters = [
  { value: "all", label: "Tous" },
  { value: "nouveau", label: "Nouveaux" },
  { value: "persistant", label: "Persistants" },
  { value: "corrige", label: "Corrigés" },
] as const;

const mockRows: NegatifRow[] = [
  {
    code: 15295,
    libelle: "LANIÈRES DINDES FUMÉES PR TR 150G",
    statut: "nouveau",
    priorite: "critique",
    stockJ1: 2,
    stockJ: -6,
    variation: -8,
    pxRevient: 653,
    pxVente: 899,
    couv: 3,
    joursNeg: 1,
    premiereApparition: "17/08",
    compensateur: "TRANCHE DINDE FUMÉE 100G",
    confiance: "fort",
  },
  {
    code: 13080,
    libelle: "ALK PARATHA PLAIN 400G",
    statut: "persistant",
    priorite: "critique",
    stockJ1: -9,
    stockJ: -13,
    variation: -4,
    pxRevient: 249,
    pxVente: 375,
    couv: 5,
    joursNeg: 4,
    premiereApparition: "13/08",
    compensateur: "PARATHA WHOLE WHEAT 400G",
    confiance: "fort",
  },
  {
    code: 14872,
    libelle: "HACHÉ BOEUF PR TR 400G",
    statut: "persistant",
    priorite: "critique",
    stockJ1: -7,
    stockJ: -9,
    variation: -2,
    pxRevient: 316,
    pxVente: 449,
    couv: 2,
    joursNeg: 3,
    premiereApparition: "14/08",
    compensateur: "STEAK HACHÉ BOEUF 5% 400G",
    confiance: "moyen",
  },
  {
    code: 13125,
    libelle: "CRÊPE CHOCOLAT 300G",
    statut: "persistant",
    priorite: "important",
    stockJ1: -8,
    stockJ: -8,
    variation: 0,
    pxRevient: 242,
    pxVente: 349,
    couv: 999,
    joursNeg: 6,
    premiereApparition: "11/08",
    compensateur: "CRÊPE FOURRÉE CHOCOLAT 330G",
    confiance: "moyen",
  },
  {
    code: 14903,
    libelle: "FEUILLES DE BRICK 500G",
    statut: "nouveau",
    priorite: "important",
    stockJ1: 4,
    stockJ: -5,
    variation: -9,
    pxRevient: 243,
    pxVente: 355,
    couv: 8,
    joursNeg: 1,
    premiereApparition: "17/08",
    compensateur: "FEUILLES DE SPRING ROLLS 454G",
    confiance: "faible",
  },
  {
    code: 13541,
    libelle: "SAMOUSSA LÉGUMES 1KG",
    statut: "persistant",
    priorite: "important",
    stockJ1: -4,
    stockJ: -4,
    variation: 0,
    pxRevient: 493,
    pxVente: 699,
    couv: 12,
    joursNeg: 2,
    premiereApparition: "15/08",
    compensateur: "SAMOUSSA POMMES DE TERRE 1KG",
    confiance: "moyen",
  },
  {
    code: 14051,
    libelle: "NUGGETS POULET 500G",
    statut: "corrige",
    priorite: "corrige",
    stockJ1: -5,
    stockJ: 12,
    variation: 17,
    pxRevient: 410,
    pxVente: 599,
    couv: 15,
    joursNeg: 0,
    premiereApparition: "09/08",
    compensateur: null,
    confiance: null,
  },
  {
    code: 16022,
    libelle: "PETIT POIS SURGELÉ 1KG",
    statut: "corrige",
    priorite: "corrige",
    stockJ1: -2,
    stockJ: 8,
    variation: 10,
    pxRevient: 210,
    pxVente: 315,
    couv: 22,
    joursNeg: 0,
    premiereApparition: "12/08",
    compensateur: null,
    confiance: null,
  },
  {
    code: 17033,
    libelle: "GLACE VANILLE 1L",
    statut: "corrige",
    priorite: "corrige",
    stockJ1: -3,
    stockJ: 6,
    variation: 9,
    pxRevient: 480,
    pxVente: 699,
    couv: 999,
    joursNeg: 0,
    premiereApparition: "10/08",
    compensateur: "GLACE CHOCOLAT 1L",
    confiance: "fort",
  },
  {
    code: 12588,
    libelle: "FRIES PONT NEUF 1KG",
    statut: "corrige",
    priorite: "corrige",
    stockJ1: -6,
    stockJ: 24,
    variation: 30,
    pxRevient: 195,
    pxVente: 289,
    couv: 18,
    joursNeg: 0,
    premiereApparition: "08/08",
    compensateur: "FRIES ALLUMETTES 1KG",
    confiance: "fort",
  },
  {
    code: 18544,
    libelle: "ÉPINARDS HACHÉS 1KG",
    statut: "corrige",
    priorite: "corrige",
    stockJ1: -1,
    stockJ: 5,
    variation: 6,
    pxRevient: 178,
    pxVente: 265,
    couv: 30,
    joursNeg: 0,
    premiereApparition: "16/08",
    compensateur: null,
    confiance: null,
  },
  {
    code: 13770,
    libelle: "PIZZA MARGHERITA 380G",
    statut: "corrige",
    priorite: "corrige",
    stockJ1: -4,
    stockJ: 9,
    variation: 13,
    pxRevient: 250,
    pxVente: 369,
    couv: 9,
    joursNeg: 0,
    premiereApparition: "13/08",
    compensateur: "PIZZA REINE 380G",
    confiance: "moyen",
  },
  {
    code: 19420,
    libelle: "SORBET MANGUE 1L",
    statut: "corrige",
    priorite: "corrige",
    stockJ1: -2,
    stockJ: 7,
    variation: 9,
    pxRevient: 465,
    pxVente: 649,
    couv: 999,
    joursNeg: 0,
    premiereApparition: "14/08",
    compensateur: "SORBET FRUITS ROUGES 1L",
    confiance: "moyen",
  },
];

const prioriteOrder: Record<Priorite, number> = {
  critique: 0,
  important: 1,
  surveiller: 2,
  corrige: 3,
};

const PAGE_SIZE = 8;

function fmtFdj(v: number): string {
  return v.toLocaleString("fr-FR", { maximumFractionDigits: 0 });
}

export function NegatifsTableMix2({
  rows,
  details,
}: {
  rows: DashboardNegatifRow[] | null;
  details: Map<number, DashboardArticleDetail> | null;
}) {
  const [filter, setFilter] = React.useState<(typeof filters)[number]["value"]>("all");
  const [sortDesc, setSortDesc] = React.useState(true);
  const [pageIndex, setPageIndex] = React.useState(0);
  const [selectedCode, setSelectedCode] = React.useState<number | null>(null);

  const dataRows = rows ?? mockRows;
  const selectedDetail = details && selectedCode !== null ? (details.get(selectedCode) ?? null) : null;

  const filtered = React.useMemo(
    () => (filter === "all" ? dataRows : dataRows.filter((r) => r.statut === filter)),
    [filter, dataRows],
  );

  const sorted = React.useMemo(() => {
    return [...filtered].sort((a, b) => {
      const diff = prioriteOrder[a.priorite] - prioriteOrder[b.priorite] || a.stockJ - b.stockJ;
      return sortDesc ? diff : -diff;
    });
  }, [filtered, sortDesc]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(pageIndex, pageCount - 1);
  const visible = sorted.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  const counts = React.useMemo(
    () => ({
      all: dataRows.length,
      nouveau: dataRows.filter((r) => r.statut === "nouveau").length,
      persistant: dataRows.filter((r) => r.statut === "persistant").length,
      corrige: dataRows.filter((r) => r.statut === "corrige").length,
    }),
    [dataRows],
  );

  const pageNumbers = React.useMemo(() => {
    if (pageCount <= 3) return Array.from({ length: pageCount }, (_, i) => i + 1);
    if (currentPage <= 1) return [1, 2, 3];
    if (currentPage >= pageCount - 2) return [pageCount - 2, pageCount - 1, pageCount];
    return [currentPage, currentPage + 1, currentPage + 2];
  }, [currentPage, pageCount]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-normal text-muted-foreground text-sm">Négatifs &amp; corrigés — détail</CardTitle>
        <CardDescription className="text-foreground text-xl tabular-nums leading-none tracking-tight">
          {filtered.length} article{filtered.length > 1 ? "s" : ""} · clic pour le détail
        </CardDescription>
        <CardAction>
          <Button aria-label="Export" size="icon-sm" variant="outline">
            <Download />
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-4 px-0">
        <div className="flex items-center justify-between gap-2 px-4">
          <ToggleGroup
            className="bg-muted p-0.75 text-muted-foreground **:data-[slot=toggle-group-item]:rounded-md **:data-[slot=toggle-group-item]:border **:data-[slot=toggle-group-item]:border-transparent **:data-[slot=toggle-group-item]:text-foreground/60 **:data-[slot=toggle-group-item]:hover:text-foreground [&_[data-slot=toggle-group-item][data-state=on]]:bg-background [&_[data-slot=toggle-group-item][data-state=on]]:text-foreground [&_[data-slot=toggle-group-item][data-state=on]]:shadow-sm dark:[&_[data-slot=toggle-group-item][data-state=on]]:border-input dark:[&_[data-slot=toggle-group-item][data-state=on]]:bg-input/30"
            onValueChange={(value) => {
              if (!value) return;
              setFilter(value as (typeof filters)[number]["value"]);
              setPageIndex(0);
            }}
            size="sm"
            spacing={1}
            type="single"
            value={filter}
          >
            {filters.map((f) => (
              <ToggleGroupItem key={f.value} value={f.value}>
                {f.label} · {counts[f.value]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          <Button aria-label="Trier" size="icon-sm" variant="outline" onClick={() => setSortDesc((v) => !v)}>
            <ArrowUpDown />
          </Button>
        </div>

        <div className="overflow-x-auto">
          <Table className="**:data-[slot='table-cell']:px-3 **:data-[slot='table-head']:px-3">
            <TableHeader className="border-t **:data-[slot=table-head]:h-11 **:data-[slot=table-head]:font-normal **:data-[slot=table-head]:text-foreground **:data-[slot=table-head]:text-xs **:data-[slot=table-head]:whitespace-nowrap">
              <TableRow>
                <TableHead>Libellé</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Priorité</TableHead>
                <TableHead className="text-right">J-1</TableHead>
                <TableHead className="text-right">J</TableHead>
                <TableHead className="text-right">Δ</TableHead>
                <TableHead className="text-right">Px revient</TableHead>
                <TableHead className="text-right">Px vente</TableHead>
                <TableHead className="text-right">Couv.</TableHead>
                <TableHead className="text-right">Jours nég.</TableHead>
                <TableHead>1re app.</TableHead>
                <TableHead>Compensateur</TableHead>
                <TableHead>Confiance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="**:data-[slot='table-row']:border-border/50 **:data-[slot='table-cell']:py-3 **:data-[slot='table-cell']:text-sm">
              {visible.length ? (
                visible.map((row) => (
                  <TableRow
                    key={row.code}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => setSelectedCode(row.code)}
                  >
                    <TableCell className="max-w-56 truncate font-medium" title={row.libelle}>
                      {row.libelle}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">#{row.code}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{statutLabels[row.statut]}</Badge>
                    </TableCell>
                    <TableCell>
                      <HealthTrain
                        score={prioriteScore[row.priorite]}
                        tone={toneForPriorite(row.priorite)}
                        label={prioriteLabels[row.priorite]}
                      />
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">
                      {row.stockJ1 ?? "—"}
                    </TableCell>
                    <TableCell
                      className={`text-right font-medium tabular-nums ${
                        row.stockJ < 0 ? "text-destructive" : "text-green-700 dark:text-green-300"
                      }`}
                    >
                      {row.stockJ}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${
                        row.variation !== null && row.variation < 0
                          ? "text-destructive"
                          : row.variation !== null && row.variation > 0
                            ? "text-green-700 dark:text-green-300"
                            : "text-muted-foreground"
                      }`}
                    >
                      {row.variation === null ? "—" : `${row.variation > 0 ? "+" : ""}${row.variation}`}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtFdj(row.pxRevient)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtFdj(row.pxVente)}</TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">
                      {row.couv === null ? "—" : row.couv === 999 ? "dormant" : row.couv}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.joursNeg > 0 ? `${row.joursNeg} j` : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs tabular-nums">
                      {row.premiereApparition}
                    </TableCell>
                    <TableCell className="max-w-48 truncate text-xs" title={row.compensateur ?? undefined}>
                      {row.compensateur ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      {row.confiance ? (
                        <HealthTrain
                          score={confianceScore[row.confiance]}
                          tone={toneForConfiance(row.confiance)}
                          label={row.confiance}
                        />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell className="h-24 text-center" colSpan={14}>
                    Aucun article dans cette catégorie.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between gap-4 px-4 pb-1">
          <p className="text-muted-foreground text-sm">
            {visible.length} sur {filtered.length} articles
          </p>

          <Pagination className="mx-0 w-auto justify-end">
            <PaginationContent className="gap-1.5">
              <PaginationItem>
                <PaginationPrevious
                  className={currentPage === 0 ? "pointer-events-none opacity-50" : undefined}
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setPageIndex((p) => Math.max(0, p - 1));
                  }}
                />
              </PaginationItem>
              {pageNumbers[0] > 1 ? (
                <PaginationItem>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : null}
              {pageNumbers.map((n) => (
                <PaginationItem key={`page-${n}`}>
                  <PaginationLink
                    href="#"
                    isActive={currentPage === n - 1}
                    onClick={(e) => {
                      e.preventDefault();
                      setPageIndex(n - 1);
                    }}
                  >
                    {n}
                  </PaginationLink>
                </PaginationItem>
              ))}
              {pageNumbers[pageNumbers.length - 1] < pageCount ? (
                <PaginationItem>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : null}
              <PaginationItem>
                <PaginationNext
                  className={currentPage >= pageCount - 1 ? "pointer-events-none opacity-50" : undefined}
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setPageIndex((p) => Math.min(pageCount - 1, p + 1));
                  }}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      </CardContent>

      <ArticleDrawer
        code={selectedCode}
        onOpenChange={(open) => !open && setSelectedCode(null)}
        detail={selectedDetail}
      />
    </Card>
  );
}
