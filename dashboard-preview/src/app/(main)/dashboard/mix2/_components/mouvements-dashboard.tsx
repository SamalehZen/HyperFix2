"use client";

import * as React from "react";

import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarDays, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";

import { fetchMouvements, fetchMouvementsJours, type MvtJour, type MvtJourDispo } from "../_lib/mouvements";
import { MvtAlertes } from "./mvt-alertes";
import { MvtCaSerie } from "./mvt-ca-serie";
import { MvtDormants } from "./mvt-dormants";
import { MvtEcarts } from "./mvt-ecarts";
import { MvtFamilles } from "./mvt-familles";
import { MvtKpiStrip } from "./mvt-kpi-strip";
import { MvtMargeDonut } from "./mvt-marge-donut";
import { MvtPrix } from "./mvt-prix";
import { MvtTopVentes } from "./mvt-top-ventes";

const RAYONS = [
  { id: "frais-surgele", libelle: "Frais surgelé" },
  { id: "epicerie-salee", libelle: "Épicerie salée" },
] as const;

export function MouvementsDashboard({ rayon: rayonInit, jour: jourInit }: { rayon: string; jour: string | null }) {
  const [rayon, setRayon] = React.useState<string>(rayonInit);
  const [jours, setJours] = React.useState<MvtJourDispo[]>([]);
  const [jour, setJour] = React.useState<string | null>(jourInit);
  const [data, setData] = React.useState<MvtJour | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    fetchMouvementsJours(rayon).then((list) => {
      if (cancelled) return;
      setJours(list ?? []);
      setJour((current) => {
        if (current && list?.some((d) => d.jour === current)) return current;
        return list?.[0]?.jour ?? null;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [rayon]);

  React.useEffect(() => {
    if (!jour) return;
    let cancelled = false;
    setLoading(true);
    setData(null);
    fetchMouvements(jour, rayon).then((d) => {
      if (cancelled) return;
      setData(d);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [jour, rayon]);

  if (!jour) {
    return <p className="text-muted-foreground text-sm">Choisis un jour pour voir ses mouvements.</p>;
  }

  const resume = data?.resume ?? null;
  const ind = resume?.indicateurs;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
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
          <SelectTrigger size="sm" className="w-44">
            <SelectValue placeholder="Jour" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Jours avec mouvements</SelectLabel>
              {jours.map((d) => (
                <SelectItem key={d.jour} value={d.jour}>
                  {format(new Date(d.jour), "EEEE d MMM", { locale: fr })} · {d.nb_mouvements}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        <h2 className="text-2xl tracking-tight">
          Mouvements{jour ? ` du ${format(new Date(jour), "EEEE, do MMMM yyyy", { locale: fr })}` : ""}
        </h2>
        {loading ? (
          <Badge variant="outline">
            <Loader2 className="animate-spin" />
            Chargement
          </Badge>
        ) : data ? (
          <Badge variant="outline" className="border-green-200 bg-green-500/10 text-green-700">
            <CalendarDays />
            {resume?.nb_mouvements ?? 0} mouvements · {ind?.nb_articles_vendus ?? 0} articles
          </Badge>
        ) : (
          <Badge variant="outline">Pas de mouvements ce jour</Badge>
        )}
      </div>

      {data && resume && ind ? (
        <>
          <MvtKpiStrip resume={resume} prev={data.prev_resume} />
          <MvtCaSerie serie={data.serie} />

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <div className="xl:col-span-8">
              <MvtTopVentes ventes={ind.top_ventes} prixManquants={ind.prix_manquants} />
            </div>
            <div className="xl:col-span-4">
              <MvtMargeDonut
                marge={ind.marge_encaissee}
                cout={ind.cout}
                margePct={ind.marge_pct}
                caPromo={ind.ca_promo}
              />
            </div>

            <div className="xl:col-span-12">
              <MvtFamilles familles={data.familles} />
            </div>

            <div className="xl:col-span-12">
              <MvtEcarts ecarts={data.ecarts} />
            </div>

            <div className="h-full xl:col-span-5">
              <MvtPrix lignes={ind.prix_delta} />
            </div>
            <div className="h-full xl:col-span-7">
              <MvtDormants dormants={ind.dormants} />
            </div>

            <div className="xl:col-span-12">
              <MvtAlertes alertes={data.alertes} />
            </div>
          </div>
        </>
      ) : (
        !loading && (
          <p className="text-muted-foreground text-sm">
            Aucune donnée de mouvements pour ce jour. Les jours avec mouvements sont ceux importés via
            les fichiers Stock_DetailMouvement.
          </p>
        )
      )}
    </div>
  );
}
