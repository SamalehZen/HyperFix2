// Simulation — détail article (17/08, rayon Frais surgelé)
// Historique 7 jours + compensateurs proposés par l'IA.

export interface CompensateurDetail {
  code: number;
  libelle: string;
  px_revient: number;
  px_vente: number;
  stock: number;
  couv: number | null;
  confiance: "fort" | "moyen" | "faible" | "aucun";
  justification: string;
}

export interface ArticleDetail {
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
  compensateurs: CompensateurDetail[];
}

const jours = ["11/08", "12/08", "13/08", "14/08", "15/08", "16/08", "17/08"];

function hist(values: number[]): { jour: string; stock: number }[] {
  return jours.map((jour, i) => ({ jour, stock: values[i] }));
}

export const articleDetails: Record<number, ArticleDetail> = {
  15295: {
    code: 15295,
    libelle: "LANIÈRES DINDES FUMÉES PR TR 150G",
    statut: "nouveau",
    priorite: "critique",
    stock_j1: 2,
    stock_j: -6,
    px_revient: 653.2,
    px_vente: 899,
    couv: 3,
    jours_consecutifs: 1,
    premiere_apparition: "17/08",
    hist7: hist([4, 5, 3, 2, 0, 2, -6]),
    compensateurs: [
      {
        code: 15012,
        libelle: "TRANCHE DINDE FUMÉE 100G",
        px_revient: 445,
        px_vente: 649,
        stock: 18,
        couv: 9,
        confiance: "fort",
        justification:
          "Même famille produit et même usage (traiteur froid), format proche, prix de revient équivalent.",
      },
      {
        code: 15088,
        libelle: "BLANC DINDE FUMÉE 200G",
        px_revient: 612,
        px_vente: 855,
        stock: 7,
        couv: 14,
        confiance: "moyen",
        justification: "Substitut direct, prix similaire, mais conditionnement différent (200g vs 150g).",
      },
    ],
  },
  13080: {
    code: 13080,
    libelle: "ALK PARATHA PLAIN 400G",
    statut: "persistant",
    priorite: "critique",
    stock_j1: -9,
    stock_j: -13,
    px_revient: 248.8,
    px_vente: 375,
    couv: 5,
    jours_consecutifs: 4,
    premiere_apparition: "13/08",
    hist7: hist([2, 1, -2, -5, -7, -9, -13]),
    compensateurs: [
      {
        code: 13091,
        libelle: "PARATHA WHOLE WHEAT 400G",
        px_revient: 255,
        px_vente: 385,
        stock: 22,
        couv: 11,
        confiance: "fort",
        justification: "Même gamme et même grammage, écart de prix de revient < 3%.",
      },
      {
        code: 13155,
        libelle: "NAAN NATURE 320G",
        px_revient: 180,
        px_vente: 275,
        stock: 40,
        couv: 999,
        confiance: "moyen",
        justification: "Pain plat similaire, stock dormant élevé (COUV 999) — mais format plus petit.",
      },
    ],
  },
  14872: {
    code: 14872,
    libelle: "HACHÉ BOEUF PR TR 400G",
    statut: "persistant",
    priorite: "critique",
    stock_j1: -7,
    stock_j: -9,
    px_revient: 316.3,
    px_vente: 449,
    couv: 2,
    jours_consecutifs: 3,
    premiere_apparition: "14/08",
    hist7: hist([6, 4, 1, -3, -5, -7, -9]),
    compensateurs: [
      {
        code: 14910,
        libelle: "STEAK HACHÉ BOEUF 5% 400G",
        px_revient: 328,
        px_vente: 469,
        stock: 15,
        couv: 7,
        confiance: "moyen",
        justification: "Produit équivalent en viande bovine, teneur différente (5% MG).",
      },
    ],
  },
  13125: {
    code: 13125,
    libelle: "CRÊPE CHOCOLAT 300G",
    statut: "persistant",
    priorite: "important",
    stock_j1: -8,
    stock_j: -8,
    px_revient: 241.5,
    px_vente: 349,
    couv: 999,
    jours_consecutifs: 6,
    premiere_apparition: "11/08",
    hist7: hist([-1, -2, -3, -5, -6, -8, -8]),
    compensateurs: [
      {
        code: 13170,
        libelle: "CRÊPE FOURRÉE CHOCOLAT 330G",
        px_revient: 258,
        px_vente: 375,
        stock: 26,
        couv: 999,
        confiance: "moyen",
        justification: "Crêpe chocolat direct concurrent, les deux références dormantes.",
      },
    ],
  },
  14903: {
    code: 14903,
    libelle: "FEUILLES DE BRICK 500G",
    statut: "nouveau",
    priorite: "important",
    stock_j1: 4,
    stock_j: -5,
    px_revient: 242.8,
    px_vente: 355,
    couv: 8,
    jours_consecutifs: 1,
    premiere_apparition: "17/08",
    hist7: hist([3, 2, 5, 4, 6, 4, -5]),
    compensateurs: [
      {
        code: 14944,
        libelle: "FEUILLES DE SPRING ROLLS 454G",
        px_revient: 230,
        px_vente: 339,
        stock: 12,
        couv: 19,
        confiance: "faible",
        justification: "Usage culinaire proche (roulades), mais produit différent (riz vs blé).",
      },
    ],
  },
  13541: {
    code: 13541,
    libelle: "SAMOUSSA LÉGUMES 1KG",
    statut: "persistant",
    priorite: "important",
    stock_j1: -4,
    stock_j: -4,
    px_revient: 493,
    px_vente: 699,
    couv: 12,
    jours_consecutifs: 2,
    premiere_apparition: "15/08",
    hist7: hist([8, 6, 3, 1, -2, -4, -4]),
    compensateurs: [
      {
        code: 13599,
        libelle: "SAMOUSSA POMMES DE TERRE 1KG",
        px_revient: 485,
        px_vente: 689,
        stock: 9,
        couv: 999,
        confiance: "moyen",
        justification: "Même format famille samoussa, garniture différente.",
      },
    ],
  },
  14051: {
    code: 14051,
    libelle: "NUGGETS POULET 500G",
    statut: "corrige",
    priorite: "corrige",
    stock_j1: -5,
    stock_j: 12,
    px_revient: 410,
    px_vente: 599,
    couv: 15,
    jours_consecutifs: 0,
    premiere_apparition: "09/08",
    hist7: hist([3, -1, -3, -5, -4, -5, 12]),
    compensateurs: [],
  },
  17033: {
    code: 17033,
    libelle: "GLACE VANILLE 1L",
    statut: "corrige",
    priorite: "corrige",
    stock_j1: -3,
    stock_j: 6,
    px_revient: 480,
    px_vente: 699,
    couv: 999,
    jours_consecutifs: 0,
    premiere_apparition: "10/08",
    hist7: hist([2, 0, -1, -3, -2, -3, 6]),
    compensateurs: [
      {
        code: 17034,
        libelle: "GLACE CHOCOLAT 1L",
        px_revient: 480,
        px_vente: 699,
        stock: 11,
        couv: 999,
        confiance: "fort",
        justification: "Même gamme, même format — parfum alternatif.",
      },
    ],
  },
};

// Repli : génère un détail plausible pour un article absent du mock.
export function getArticleDetail(code: number): ArticleDetail {
  const found = articleDetails[code];
  if (found) return found;
  const stock = -((code % 9) + 2);
  const base = Array.from({ length: 6 }, (_, i) => Math.round(stock * (0.4 + i * 0.12)));
  return {
    code,
    libelle: `ARTICLE #${code}`,
    statut: "persistant",
    priorite: "important",
    stock_j1: base[5],
    stock_j: stock,
    px_revient: 100 + (code % 40) * 10,
    px_vente: 150 + (code % 40) * 12,
    couv: 5 + (code % 20),
    jours_consecutifs: 1 + (code % 5),
    premiere_apparition: "14/08",
    hist7: hist([...base, stock]),
    compensateurs: [],
  };
}
