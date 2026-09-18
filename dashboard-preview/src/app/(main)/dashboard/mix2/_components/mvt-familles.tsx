"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { fmtFdj, type MvtFamille } from "../_lib/mouvements";

const LABELS: Record<string, string> = {
  vente: "Ventes",
  livraison: "Livraisons",
  inventaire: "Inventaires",
  retour_fournisseur: "Retours fourn.",
  cession: "Cessions",
  demarque: "Démarque",
  ajustement: "Ajustements",
  consigne: "Consignes",
  gratuit: "Gratuits",
  facturation_interne: "Fact. interne",
  client_facture: "Clients facturés",
  regul_composes: "Régul. composés",
  inutilise: "Inutilisés",
  type_inconnu: "Inconnus",
};

const config = {
  entrees: { label: "Entrées", color: "var(--chart-2)" },
  sorties: { label: "Sorties", color: "var(--chart-5)" },
} satisfies ChartConfig;

export function MvtFamilles({ familles }: { familles: Record<string, MvtFamille> }) {
  const rows = Object.entries(familles).filter(([f]) => f !== "vente");
  const data = rows.map(([f, v]) => ({
    famille: LABELS[f] ?? f,
    entrees: v.qte > 0 ? Math.round(v.qte) : 0,
    sorties: v.qte < 0 ? Math.round(-v.qte) : 0,
  }));
  const totalEntrees = data.reduce((s, d) => s + d.entrees, 0);
  const totalSorties = data.reduce((s, d) => s + d.sorties, 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Mouvements par famille (hors ventes)</CardTitle>
        <CardDescription>
          {totalEntrees.toLocaleString("fr-FR")} entrées · {totalSorties.toLocaleString("fr-FR")} sorties (pcs)
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {data.length ? (
          <ChartContainer config={config} className="h-56 w-full">
            <BarChart data={data} layout="vertical">
              <CartesianGrid horizontal={false} />
              <XAxis type="number" tickLine={false} />
              <YAxis dataKey="famille" type="category" tickLine={false} width={110} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="entrees" stackId="m" fill="var(--color-entrees)" radius={[0, 4, 4, 0]} />
              <Bar dataKey="sorties" stackId="m" fill="var(--color-sorties)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ChartContainer>
        ) : (
          <p className="text-muted-foreground text-sm">Pas d'autres mouvements ce jour.</p>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Famille</TableHead>
              <TableHead className="text-right">Lignes</TableHead>
              <TableHead className="text-right">Qté nette</TableHead>
              <TableHead className="text-right">Valeur</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(([f, v]) => (
              <TableRow key={f}>
                <TableCell>{LABELS[f] ?? f}</TableCell>
                <TableCell className="text-right tabular-nums">{v.lignes}</TableCell>
                <TableCell className="text-right tabular-nums">{v.qte.toLocaleString("fr-FR")}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtFdj(v.valeur)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
