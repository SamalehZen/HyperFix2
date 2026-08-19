import { ArrowUpRight, TrendingDown, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader } from "@/components/ui/card";

import type { GammeAnomalie, GammeNegatif, GammeResume, GammeStats } from "../_lib/gamme";
import { AnomaliesPanel } from "./anomalies-panel";

function fmtFdj(v: number): string {
  return `${v.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} FDJ`;
}

function pctDelta(current: number, previous: number | null | undefined): number | null {
  if (previous === null || previous === undefined || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function DeltaBadge({ delta, invert }: { delta: number | null; invert?: boolean }) {
  if (delta === null) {
    return (
      <Badge variant="outline" className="border-border bg-muted/40 text-muted-foreground">
        —
      </Badge>
    );
  }
  const positive = delta >= 0;
  const good = invert ? !positive : positive;
  return (
    <Badge
      variant="outline"
      className={
        good
          ? "border-green-200 bg-green-500/10 text-green-700 dark:border-green-900/40 dark:bg-green-500/15 dark:text-green-300"
          : "border-destructive/20 bg-destructive/10 text-destructive"
      }
    >
      {positive ? <TrendingUp /> : <TrendingDown />}
      {positive ? "+" : ""}
      {delta.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}%
    </Badge>
  );
}

export function Kpi4Gamme({
  stats,
  prevStats,
  resume,
  anomalies,
  prevAnomalies,
  negatifs,
}: {
  stats: GammeStats | null;
  prevStats: GammeStats | null;
  resume: GammeResume | null;
  anomalies: GammeAnomalie[] | null;
  prevAnomalies: number | null;
  negatifs: GammeNegatif[] | null;
}) {
  const prmpPasse = stats?.prmp_passe_negatif ?? null;
  const prmpCorrige = stats?.prmp_corrige ?? null;
  const ouverts = resume ? resume.nouveaux + resume.persistants : null;
  const prevOuverts = prevStats?.negatifs ?? null;

  return (
    <section className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-3xl tracking-tight">Vue d&apos;ensemble</h2>
        <p className="text-muted-foreground text-sm">
          Suivez la valeur stock PRMP, les négatifs ouverts et les anomalies du cycle en cours.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Total PRMP passé négatif</CardDescription>
            <CardAction>
              <ArrowUpRight className="size-4" />
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-3xl leading-none tracking-tight">
                {prmpPasse === null ? "-5 133 FDJ" : `-${fmtFdj(prmpPasse)}`}
              </span>
              <DeltaBadge delta={pctDelta(prmpPasse ?? 0, prevStats?.prmp_passe_negatif)} invert />
            </div>
            <p className="text-sm">
              <span className="font-medium text-foreground">
                {prevStats ? fmtFdj(prevStats.prmp_passe_negatif) : "-4 210 FDJ"}
              </span>{" "}
              <span className="text-muted-foreground">le jour précédent</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Manque PRMP comblé</CardDescription>
            <CardAction>
              <ArrowUpRight className="size-4" />
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-3xl leading-none tracking-tight">
                {prmpCorrige === null ? "18 640 FDJ" : fmtFdj(prmpCorrige)}
              </span>
              <DeltaBadge delta={pctDelta(prmpCorrige ?? 0, prevStats?.prmp_corrige)} />
            </div>
            <p className="text-sm">
              <span className="font-medium text-foreground">
                {prevStats ? fmtFdj(prevStats.prmp_corrige) : "18 050 FDJ"}
              </span>{" "}
              <span className="text-muted-foreground">le jour précédent</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Négatifs ouverts</CardDescription>
            <CardAction>
              <ArrowUpRight className="size-4" />
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-3xl leading-none tracking-tight">{ouverts ?? 6}</span>
              <DeltaBadge delta={pctDelta(ouverts ?? 0, prevOuverts)} invert />
            </div>
            <p className="text-sm">
              <span className="font-medium text-foreground">{prevOuverts ?? 4}</span>{" "}
              <span className="text-muted-foreground">le jour précédent</span>
            </p>
          </CardContent>
        </Card>

        <AnomaliesPanel anomalies={anomalies} count={resume?.anomalies ?? null} negatifs={negatifs}>
          <button
            type="button"
            className="flex h-full w-full rounded-xl text-left outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Voir le détail des anomalies"
          >
            <Card className="h-full w-full">
              <CardHeader>
                <CardDescription>Anomalies</CardDescription>
                <CardAction>
                  <ArrowUpRight className="size-4" />
                </CardAction>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="text-3xl leading-none tracking-tight">
                    {(resume?.anomalies ?? anomalies?.length ?? 0).toLocaleString("fr-FR")}
                  </span>
                  <DeltaBadge delta={pctDelta(resume?.anomalies ?? 0, prevAnomalies)} invert />
                </div>
                <p className="text-sm">
                  <span className="font-medium text-foreground">
                    {prevAnomalies?.toLocaleString("fr-FR") ?? "—"}
                  </span>{" "}
                  <span className="text-muted-foreground">le jour précédent · cliquer pour le détail</span>
                </p>
              </CardContent>
            </Card>
          </button>
        </AnomaliesPanel>
      </div>
    </section>
  );
}
