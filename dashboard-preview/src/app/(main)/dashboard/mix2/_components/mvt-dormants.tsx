"use client";

import { PackageCheck, PackageX, Timer } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { fmtFdj, type MvtDormants } from "../_lib/mouvements";

export function MvtDormants({ dormants }: { dormants: MvtDormants }) {
  const rows = [...dormants.top_prouves];
  if (!rows.length) {
    rows.push(...dormants.faux_dormants.slice(0, 10));
  }
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Dormants prouvés</CardTitle>
        <CardDescription>
          Seuil {dormants.seuil_jours} j · fenêtre {dormants.fenetre?.longueur ?? dormants.jours_donnees} j de données
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg bg-muted/50 p-3">
            <PackageX className="mx-auto mb-1 size-4 text-destructive" />
            <div className="text-xl font-semibold tabular-nums">{dormants.nb_prouves}</div>
            <div className="text-muted-foreground text-xs">prouvés</div>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <Timer className="mx-auto mb-1 size-4 text-yellow-600" />
            <div className="text-xl font-semibold tabular-nums">{dormants.nb_partiels}</div>
            <div className="text-muted-foreground text-xs">partiels</div>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <PackageCheck className="mx-auto mb-1 size-4 text-muted-foreground" />
            <div className="text-xl font-semibold tabular-nums">{dormants.nb_estimes}</div>
            <div className="text-muted-foreground text-xs">estimés</div>
          </div>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Capital prouvé bloqué</span>
          <span className="font-medium tabular-nums">{fmtFdj(dormants.capital_prouve)}</span>
        </div>
        <Separator />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Article</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead className="text-right">Capital</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(0, 10).map((t) => (
              <TableRow key={t.code}>
                <TableCell>
                  <div className="font-medium tabular-nums">{t.code}</div>
                  <div className="max-w-48 truncate text-muted-foreground text-xs">
                    {t.libelle ?? ""}
                    {t.dernier_vente ? ` · vendu le ${t.dernier_vente}` : " · jamais vu vendu"}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{t.stock}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtFdj(t.capital)}</TableCell>
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={3} className="text-muted-foreground">
                  Aucun dormant à fort capital. Les {dormants.nb_partiels} partiels montent en preuve chaque jour.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        {dormants.faux_dormants.length > 0 && (
          <p className="text-muted-foreground text-xs">
            {dormants.faux_dormants.length} faux dormants détectés (couv 999 mais vendus récemment) — voir table
            complète côté moteur.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
