// Types + client API du story mode gamme-engine

export interface Resume {
  jour: string
  nb_articles: number
  rayon: string
  libelle_rayon: string
  nouveaux: number
  persistants: number
  corriges: number
  anomalies: number
  avec_compensateur: number
  sans_compensateur: number
  critiques: number
  importants: number
  nb_import: number
  baseline: boolean
}

export interface Compensateur {
  code: number | null
  libelle: string | null
  confiance: string | null
  justification: string | null
  px_revient: number | null
  px_vente: number | null
  stock: number | null
  couv: number | null
}

export interface HistPoint {
  jour: string
  stock: number | null
}

export interface Negatif {
  code: number
  libelle: string | null
  stock_j1: number | null
  stock_j: number
  variation: number | null
  px_revient: number | null
  px_vente: number | null
  couv: number | null
  statut: string
  priorite: string
  jours_consecutifs: number
  premiere_apparition: string | null
  nb_occurrences: number
  compensateurs: Compensateur[]
  compensateur: string | null
  confiance: string
  justification: string | null
  hist7: HistPoint[]
}

export interface TopNeg {
  code: number
  libelle: string
  stock: number | null
  valeur: number
}

export interface SerieJour {
  jour: string
  total: number
  nouveaux: number
  persistants: number
  corriges: number
  critiques: number
}

export interface Anomalie {
  code: number | null
  type: string
  description: string | null
  valeur_j1: number | null
  valeur_j: number | null
}

export interface SerieAnomalies {
  types: string[]
  jours: { jour: string; [type: string]: number | string }[]
}

export interface StoryData {
  ok: boolean
  resume: Resume
  top_neg: TopNeg[]
  types_anom: Record<string, number>
  anomalies: Anomalie[]
  serie_jours: SerieJour[]
  serie_anomalies: SerieAnomalies
  negatifs: Negatif[]
  corriges: Negatif[]
}

export interface JoursData {
  ok: boolean
  rayon: string
  libelle_rayon: string
  jours: { jour: string; negatifs: number }[]
}

export async function fetchJours(rayon: string): Promise<JoursData> {
  const res = await fetch(`/story-data/jours?rayon=${encodeURIComponent(rayon)}`)
  if (!res.ok) throw new Error(`Jours indisponibles (${res.status})`)
  return res.json()
}

export async function fetchStory(jour: string, rayon: string): Promise<StoryData> {
  const res = await fetch(
    `/story-data/${jour}?rayon=${encodeURIComponent(rayon)}`
  )
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.erreur || `Rapport indisponible (${res.status})`)
  }
  return res.json()
}

// --- Formatters (FDJ = franc djiboutien, affiché tel quel) ---

export const fmtNum = (v: number | null | undefined, d = 0): string =>
  v === null || v === undefined ? "—" : Number(v).toLocaleString("fr-FR", { maximumFractionDigits: d })

export const fmtFdj = (v: number | null | undefined): string =>
  v === null || v === undefined ? "—" : `${Number(v).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} FDJ`

export const fmtDate = (jour: string): string =>
  jour ? new Date(jour + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "—"

export const fmtDateShort = (jour: string): string =>
  jour ? new Date(jour + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "—"
