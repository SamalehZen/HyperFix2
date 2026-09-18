"use client";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { fmtFdj, pctDelta, type MvtResume } from "../_lib/mouvements";

function Delta({ delta }: { delta: number | null }) {
  if (delta === null) return <Badge variant="outline">—</Badge>;
  const up = delta >= 0;
  return (
    <Badge className={up ? "bg-green-500/10 text-green-700" : "bg-destructive/10 text-destructive"}>
      {up ? <ArrowUpRight /> : <ArrowDownRight />}
      {up ? "+" : ""}
      {delta.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}%
    </Badge>
  );
}

export function MvtKpiStrip({ resume, prev }: { resume: MvtResume | null; prev: MvtResume | null }) {
  const ind = resume?.indicateurs;
  const pind = prev?.indicateurs;
  const cards = [
    { titre: "CA encaissé", valeur: fmtFdj(ind?.ca), delta: pctDelta(ind?.ca ?? 0, pind?.ca) },
    {
      titre: "Marge encaissée",
      valeur: `${fmtFdj(ind?.marge_encaissee)}${ind?.marge_pct != null ? ` (${ind.marge_pct}%)` : ""}`,
      delta: pctDelta(ind?.marge_encaissee ?? 0, pind?.marge_encaissee),
    },
    {
      titre: "Articles vendus",
      valeur: ind?.nb_articles_vendus != null ? String(ind.nb_articles_vendus) : "—",
      delta: pctDelta(ind?.nb_articles_vendus ?? 0, pind?.nb_articles_vendus),
    },
    {
      titre: "Mouvements",
      valeur: resume?.nb_mouvements != null ? String(resume.nb_mouvements) : "—",
      delta: pctDelta(resume?.nb_mouvements ?? 0, prev?.nb_mouvements),
    },
  ];
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.titre}>
          <CardHeader>
            <CardTitle className="font-normal text-muted-foreground text-sm">{c.titre}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4">
              <div className="text-2xl leading-none tracking-tight tabular-nums">{c.valeur}</div>
              <Delta delta={c.delta} />
            </div>
            <div className="text-muted-foreground text-xs">
              {prev ? `vs ${prev.jour}` : "sans jour précédent"}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
