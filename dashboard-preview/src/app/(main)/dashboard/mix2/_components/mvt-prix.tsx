"use client";

import { TrendingDown, TrendingUp } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { fmtFdj } from "../_lib/mouvements";

export interface PrixDelta {
  code: number;
  libelle: string | null;
  dernier_pr: number;
  prmp: number;
  delta: number;
}

export function MvtPrix({ lignes }: { lignes: PrixDelta[] }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Prix d'achat qui bougent</CardTitle>
        <CardDescription>
          {lignes.length
            ? "Dernier prix vs PRMP — vert = baisse fournisseur, rouge = hausse"
            : "Aucun changement détecté ce jour."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Article</TableHead>
              <TableHead className="text-right">Dernier PR</TableHead>
              <TableHead className="text-right">PRMP</TableHead>
              <TableHead className="text-right">Δ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lignes.slice(0, 20).map((t) => {
              const baisse = t.delta < 0;
              return (
                <TableRow key={t.code}>
                  <TableCell>
                    <div className="font-medium tabular-nums">{t.code}</div>
                    <div className="max-w-48 truncate text-muted-foreground text-xs">{t.libelle ?? ""}</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmtFdj(t.dernier_pr)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtFdj(t.prmp)}</TableCell>
                  <TableCell
                    className={`text-right tabular-nums font-medium ${
                      baisse ? "text-green-700 dark:text-green-300" : "text-destructive"
                    }`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {baisse ? <TrendingDown className="size-4" /> : <TrendingUp className="size-4" />}
                      {t.delta > 0 ? "+" : ""}
                      {t.delta.toLocaleString("fr-FR")}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
            {!lignes.length && (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">
                  Prix stables.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
