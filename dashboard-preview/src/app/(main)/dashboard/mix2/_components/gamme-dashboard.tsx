"use client";

import * as React from "react";

import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarDays, Loader2, ShieldAlert, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  computeSources,
  fetchJours,
  fetchStats,
  fetchStory,
  type GammeJour,
  type GammeStats,
  type GammeStory,
  toArticleDetail,
  toDashboardRows,
} from "../_lib/gamme";
import { CitationGamme } from "./citation-gamme";
import { Historique12Mois } from "./historique-12mois";
import { InventoryGamme } from "./inventory-gamme";
import { Kpi4Gamme } from "./kpi-4-gamme";
import { KpiStripGamme } from "./kpi-strip-gamme";
import { NegatifsLive } from "./negatifs-live";
import { NegatifsTableMix2 } from "./negatifs-table-mix2";
import { RayonTraffic } from "./rayon-traffic";
import { SourcesValeurBloquee } from "./sources-valeur-bloquee";
import { Tendance90Jours } from "./tendance-90j";
import { TopNegatifs } from "./top-negatifs";

const RAYONS = [
  { id: "frais-surgele", libelle: "Frais surgelé" },
  { id: "epicerie-salee", libelle: "Épicerie salée" },
] as const;

interface PrevData {
  story: GammeStory | null;
  stats: GammeStats | null;
}

export function GammeDashboard() {
  const [rayon, setRayon] = React.useState<string>("frais-surgele");
  const [jour, setJour] = React.useState<string | null>(null);
  const [jours, setJours] = React.useState<GammeJour[]>([]);
  const [story, setStory] = React.useState<GammeStory | null>(null);
  const [stats, setStats] = React.useState<GammeStats | null>(null);
  const [prev, setPrev] = React.useState<PrevData | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const r = params.get("rayon");
    if (r && RAYONS.some((rayon) => rayon.id === r)) setRayon(r);
    const j = params.get("jour");
    if (j) setJour(j);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setStory(null);
    setStats(null);
    setPrev(null);
    fetchJours(rayon).then((list) => {
      if (cancelled) return;
      setJours(list ?? []);
      setJour((current) => {
        if (current && list?.some((d) => d.jour === current)) return current;
        return list?.[0]?.jour ?? null;
      });
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [rayon]);

  const prevJour = jours[1]?.jour ?? null;

  React.useEffect(() => {
    if (!jour) return;
    let cancelled = false;
    Promise.all([fetchStory(jour, rayon), fetchStats(jour, rayon)]).then(([s, st]) => {
      if (cancelled) return;
      setStory(s);
      setStats(st);
    });
    return () => {
      cancelled = true;
    };
  }, [jour, rayon]);

  React.useEffect(() => {
    if (!prevJour || prevJour === jour) return;
    let cancelled = false;
    Promise.all([fetchStory(prevJour, rayon), fetchStats(prevJour, rayon)]).then(([s, st]) => {
      if (cancelled) return;
      setPrev({ story: s, stats: st });
    });
    return () => {
      cancelled = true;
    };
  }, [prevJour, jour, rayon]);

  const rayonLibelle = RAYONS.find((r) => r.id === rayon)?.libelle ?? rayon;
  const isReal = story !== null && stats !== null;
  const subtitle = jour
    ? `Rayon ${rayonLibelle} · ${format(new Date(jour), "EEEE, do MMMM yyyy", { locale: fr })}`
    : `Rayon ${rayonLibelle}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="grid size-12 shrink-0 place-items-center rounded-full bg-primary text-xl font-semibold text-primary-foreground">
            S
          </div>
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl leading-none tracking-tight">Bonjour Samaleh 👋</h1>
            <p className="text-muted-foreground text-sm">
              {subtitle}
              {jour && <> · {isReal ? "données réelles" : loading ? "chargement…" : "données simulées"}</>}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:w-fit">
          <Select value={rayon} onValueChange={setRayon}>
            <SelectTrigger size="sm" className="w-40">
              <SelectValue placeholder="Rayon" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Rayon</SelectLabel>
                {RAYONS.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.libelle}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          <Select value={jour ?? ""} onValueChange={setJour} disabled={!jours.length}>
            <SelectTrigger size="sm" className="w-40">
              <SelectValue placeholder="Jour" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Imports disponibles</SelectLabel>
                {jours.map((d) => (
                  <SelectItem key={d.jour} value={d.jour}>
                    {format(new Date(d.jour), "EEEE d MMM", { locale: fr })}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          {loading ? (
            <Badge variant="outline">
              <Loader2 className="animate-spin" />
              Chargement
            </Badge>
          ) : isReal ? (
            <>
              <Badge
                variant="outline"
                className="border-green-200 bg-green-500/10 text-green-700 dark:border-green-900/40 dark:bg-green-500/15 dark:text-green-300"
              >
                <CalendarDays />
                Import n°{story.resume.nb_import} traité
              </Badge>
              <Badge variant="outline" className="border-destructive/20 bg-destructive/10 text-destructive">
                <TriangleAlert />
                {story.resume.nouveaux + story.resume.persistants} négatifs
              </Badge>
              <Badge
                variant="outline"
                className="border-yellow-200 bg-yellow-500/10 text-yellow-700 dark:border-yellow-900/40 dark:bg-yellow-500/15 dark:text-yellow-300"
              >
                <ShieldAlert />
                {story.resume.anomalies} anomalies
              </Badge>
            </>
          ) : null}
        </div>
      </div>

      <div>
        <Kpi4Gamme
          stats={stats}
          prevStats={prev?.stats ?? null}
          resume={story?.resume ?? null}
          anomalies={story?.anomalies ?? null}
          prevAnomalies={prev?.story?.resume.anomalies ?? null}
          negatifs={story?.negatifs ?? null}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <KpiStripGamme
          resume={story?.resume ?? null}
          stats={stats}
          prevResume={prev?.story?.resume ?? null}
          prevStats={prev?.stats ?? null}
          serie={story?.serie_jours ?? null}
        />

        <div className="h-full xl:col-span-4">
          <InventoryGamme stats={stats} />
        </div>
        <div className="h-full xl:col-span-8">
          <RayonTraffic
            serieAnomalies={story?.serie_anomalies ?? null}
            serieJours={story?.serie_jours ?? null}
          />
        </div>

        <div className="h-full xl:col-span-4">
          <NegatifsLive story={story} jour={jour} />
        </div>
        <div className="h-full xl:col-span-8">
          <Tendance90Jours serie={story?.serie_jours ?? null} />
        </div>

        <div className="xl:col-span-12">
          <Historique12Mois serie={story?.serie_jours ?? null} />
        </div>

        <div className="h-full xl:col-span-5">
          <TopNegatifs story={story} />
        </div>
        <div className="flex h-full flex-col gap-4 xl:col-span-7">
          <SourcesValeurBloquee segments={story ? computeSources(story) : null} />
          <CitationGamme />
        </div>

        <div className="xl:col-span-12">
          <NegatifsTableMix2
            rows={story ? toDashboardRows(story) : null}
            details={
              story ? new Map(story.negatifs.concat(story.corriges).map((n) => [n.code, toArticleDetail(n)])) : null
            }
          />
        </div>
      </div>
    </div>
  );
}
