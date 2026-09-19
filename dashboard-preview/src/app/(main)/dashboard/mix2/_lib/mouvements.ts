export interface MvtVente {
  code: number;
  libelle: string | null;
  qte: number;
  ca: number;
  promo: boolean;
  rotation_jour: number | null;
}

export interface MvtSerieJour {
  jour: string;
  ca: number | null;
  marge: number | null;
  articles: number;
}

export interface MvtDormant {
  code: number;
  libelle: string | null;
  stock: number;
  capital: number;
  dernier_vente: string | null;
  jours_sans_vente?: number;
  niveau?: string;
}

export interface MvtDormants {
  seuil_jours: number;
  jours_donnees: number;
  fenetre?: { debut: string | null; longueur: number };
  nb_prouves: number;
  nb_partiels: number;
  nb_estimes: number;
  capital_prouve: number;
  top_prouves: MvtDormant[];
  faux_dormants: MvtDormant[];
  dormants_caches: MvtDormant[];
}

export interface MvtIndicateurs {
  ca: number | null;
  cout: number | null;
  marge_encaissee: number | null;
  marge_pct: number | null;
  ca_promo: number | null;
  ventes_sans_prix: number;
  prix_manquants?: boolean;
  top_ventes: MvtVente[];
  nb_articles_vendus: number;
  demarque: Record<string, { qte: number; valeur: number }>;
  livraisons: { qte: number; valeur: number };
  prix_delta: { code: number; libelle: string | null; dernier_pr: number; prmp: number; delta: number }[];
  dormants: MvtDormants;
}

export interface MvtResume {
  fichier: string;
  rayon: string;
  jour: string;
  jours: string[];
  feuille?: string | null;
  jours_importes: string[];
  jours_deja: string[];
  jours_erreur: Record<string, string>;
  nb_mouvements: number;
  avertissements: string[];
  reconciliation?: { statut: string; nb_ecarts?: number };
  indicateurs: MvtIndicateurs;
}

export interface MvtAlerte {
  niveau: "critique" | "attention" | "info";
  titre: string;
  detail: string;
}

export interface MvtFamille {
  lignes: number;
  qte: number;
  valeur: number;
  top: { code: number; libelle: string | null; valeur: number }[];
}

export interface MvtEcart {
  code: number | null;
  type: string;
  libelle: string | null;
  qte: number | null;
  valeur: number | null;
  chevauchement: boolean;
  description: string;
}

export interface MvtJour {
  ok: boolean;
  rayon: string;
  jour: string;
  libelle_rayon: string;
  resume: MvtResume;
  prev_jour: string | null;
  prev_resume: MvtResume | null;
  serie: MvtSerieJour[];
  alertes: MvtAlerte[];
  familles: Record<string, MvtFamille>;
  ecarts: MvtEcart[];
}

export function fmtFdj(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${v.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} FDJ`;
}

export function pctDelta(current: number, previous: number | null | undefined): number | null {
  if (previous === null || previous === undefined || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export interface MvtJourDispo {
  jour: string;
  nb_mouvements: number;
}

export async function fetchMouvementsJours(rayon: string): Promise<MvtJourDispo[]> {
  try {
    const res = await fetch(
      `/story-data/mouvements/jours?rayon=${encodeURIComponent(rayon)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data?.jours ?? [];
  } catch {
    return [];
  }
}

export async function fetchMouvements(jour: string, rayon: string): Promise<MvtJour | null> {
  try {
    const res = await fetch(
      `/story-data/mouvements/${encodeURIComponent(jour)}?rayon=${encodeURIComponent(rayon)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.ok ? (data as MvtJour) : null;
  } catch {
    return null;
  }
}
