// Couche données du poste de pilotage (mix2) — API réelle gamme-engine
// avec repli automatique sur les données de simulation locales.

export interface GammeStats {
  ok: boolean;
  rayon: string;
  jour: string;
  nb_articles: number;
  valeur_stock_prmp: number;
  prmp_passe_negatif: number;
  prmp_corrige: number;
  en_stock: number;
  stock_bas: number;
  dormants: number;
  negatifs: number;
  corriges_sous_7j: number | null;
}

export interface GammeResume {
  jour: string;
  nb_articles: number;
  libelle_rayon: string;
  nouveaux: number;
  persistants: number;
  corriges: number;
  anomalies: number;
  avec_compensateur: number;
  sans_compensateur: number;
  critiques: number;
  importants: number;
  nb_import: number;
  baseline: boolean;
}

export interface GammeCompensateur {
  code: number | null;
  libelle: string | null;
  confiance: string | null;
  justification: string | null;
  px_revient: number | null;
  px_vente: number | null;
  stock: number | null;
  couv: number | null;
}

export interface GammeNegatif {
  code: number;
  libelle: string | null;
  stock_j1: number | null;
  stock_j: number;
  variation: number | null;
  px_revient: number | null;
  px_vente: number | null;
  couv: number | null;
  statut: string;
  priorite: string;
  jours_consecutifs: number;
  premiere_apparition: string | null;
  nb_occurrences: number;
  compensateurs: GammeCompensateur[];
  compensateur: string | null;
  confiance: string;
  justification: string | null;
  hist7: { jour: string; stock: number | null }[];
}

export interface GammeTopNeg {
  code: number;
  libelle: string;
  stock: number | null;
  valeur: number;
}

export interface GammeSerieJour {
  jour: string;
  total: number;
  nouveaux: number;
  persistants: number;
  corriges: number;
  critiques: number;
}

export interface GammeSerieAnomalies {
  types: string[];
  jours: Array<Record<string, string | number>>;
}

export interface GammeStory {
  ok: boolean;
  resume: GammeResume;
  top_neg: GammeTopNeg[];
  types_anom: Record<string, number>;
  anomalies: { code: number | null; type: string; description: string | null }[];
  serie_jours: GammeSerieJour[];
  serie_anomalies: GammeSerieAnomalies;
  negatifs: GammeNegatif[];
  corriges: GammeNegatif[];
}

export interface GammeJour {
  jour: string;
  negatifs: number;
}

export async function fetchJours(rayon: string): Promise<GammeJour[] | null> {
  try {
    const res = await fetch(`/story-data/jours?rayon=${encodeURIComponent(rayon)}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.jours ?? null;
  } catch {
    return null;
  }
}

export async function fetchStory(jour: string, rayon: string): Promise<GammeStory | null> {
  try {
    const res = await fetch(`/story-data/${encodeURIComponent(jour)}?rayon=${encodeURIComponent(rayon)}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchStats(jour: string, rayon: string): Promise<GammeStats | null> {
  try {
    const res = await fetch(`/story-data/stats/${encodeURIComponent(jour)}?rayon=${encodeURIComponent(rayon)}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export interface DashboardArticleDetail {
  code: number;
  libelle: string;
  statut: "nouveau" | "persistant" | "corrige";
  priorite: "critique" | "important" | "surveiller" | "corrige";
  stock_j1: number | null;
  stock_j: number;
  px_revient: number;
  px_vente: number;
  couv: number | null;
  jours_consecutifs: number;
  premiere_apparition: string;
  hist7: { jour: string; stock: number }[];
  compensateurs: {
    code: number;
    libelle: string;
    px_revient: number;
    px_vente: number;
    stock: number;
    couv: number | null;
    confiance: "fort" | "moyen" | "faible" | "aucun";
    justification: string;
  }[];
}

export interface DashboardNegatifRow {
  code: number;
  libelle: string;
  statut: "nouveau" | "persistant" | "corrige";
  priorite: "critique" | "important" | "surveiller" | "corrige";
  stockJ1: number | null;
  stockJ: number;
  variation: number | null;
  pxRevient: number;
  pxVente: number;
  couv: number | null;
  joursNeg: number;
  premiereApparition: string;
  compensateur: string | null;
  confiance: "fort" | "moyen" | "faible" | "aucun" | null;
}

export function toDashboardRows(story: GammeStory): DashboardNegatifRow[] {
  const mapNeg = (n: GammeNegatif): DashboardNegatifRow => ({
    code: n.code,
    libelle: n.libelle ?? `#${n.code}`,
    statut: n.statut === "corrige" ? "corrige" : n.statut.startsWith("persistant") ? "persistant" : "nouveau",
    priorite: (["critique", "important", "surveiller", "corrige"].includes(n.priorite)
      ? n.priorite
      : "surveiller") as DashboardNegatifRow["priorite"],
    stockJ1: n.stock_j1,
    stockJ: n.stock_j,
    variation: n.variation,
    pxRevient: n.px_revient ?? 0,
    pxVente: n.px_vente ?? 0,
    couv: n.couv,
    joursNeg: n.jours_consecutifs,
    premiereApparition: n.premiere_apparition ? n.premiere_apparition.slice(5) : "—",
    compensateur: n.compensateur ?? n.compensateurs?.[0]?.libelle ?? null,
    confiance: (["fort", "moyen", "faible", "aucun"].includes(n.confiance)
      ? n.confiance
      : "aucun") as DashboardNegatifRow["confiance"],
  });
  return [...story.negatifs.map(mapNeg), ...story.corriges.map(mapNeg)];
}

export function toArticleDetail(n: GammeNegatif): DashboardArticleDetail {
  const statut: DashboardArticleDetail["statut"] =
    n.statut === "corrige" ? "corrige" : n.statut.startsWith("persistant") ? "persistant" : "nouveau";
  const priorite: DashboardArticleDetail["priorite"] = (
    ["critique", "important", "surveiller", "corrige"].includes(n.priorite) ? n.priorite : "surveiller"
  ) as DashboardArticleDetail["priorite"];
  return {
    code: n.code,
    libelle: n.libelle ?? `#${n.code}`,
    statut,
    priorite,
    stock_j1: n.stock_j1,
    stock_j: n.stock_j,
    px_revient: n.px_revient ?? 0,
    px_vente: n.px_vente ?? 0,
    couv: n.couv,
    jours_consecutifs: n.jours_consecutifs,
    premiere_apparition: n.premiere_apparition ?? "—",
    hist7: (n.hist7 ?? []).map((h) => ({ jour: h.jour.slice(5), stock: h.stock ?? 0 })),
    compensateurs: (n.compensateurs ?? []).map((c) => ({
      code: c.code ?? 0,
      libelle: c.libelle ?? "—",
      px_revient: c.px_revient ?? 0,
      px_vente: c.px_vente ?? 0,
      stock: c.stock ?? 0,
      couv: c.couv,
      confiance: (["fort", "moyen", "faible", "aucun"].includes(c.confiance ?? "")
        ? (c.confiance as DashboardArticleDetail["compensateurs"][number]["confiance"])
        : "aucun") as DashboardArticleDetail["compensateurs"][number]["confiance"],
      justification: c.justification ?? "—",
    })),
  };
}

export interface SourcesSegment {
  label: string;
  value: number;
  opacity: string;
}

export function computeSources(story: GammeStory): SourcesSegment[] {
  const valueOf = (n: GammeNegatif) => Math.abs((n.stock_j ?? 0) * (n.px_revient ?? 0));
  const negatifs = story.negatifs;
  const critiques = negatifs.filter((n) => n.priorite === "critique").reduce((s, n) => s + valueOf(n), 0);
  const importants = negatifs.filter((n) => n.priorite === "important").reduce((s, n) => s + valueOf(n), 0);
  const autres = negatifs
    .filter((n) => n.priorite !== "critique" && n.priorite !== "important")
    .reduce((s, n) => s + valueOf(n), 0);
  return [
    { label: "Négatifs critiques", value: critiques, opacity: "" },
    { label: "Négatifs importants", value: importants, opacity: "/75" },
    { label: "Autres négatifs", value: autres, opacity: "/50" },
  ];
}
