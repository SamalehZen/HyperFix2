"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { fmtFdj, type MvtVente } from "../_lib/mouvements";

export function MvtTopVentes({ ventes, prixManquants }: { ventes: MvtVente[]; prixManquants?: boolean }) {
  const total = ventes.reduce((s, v) => s + (v.ca || 0), 0);
  const top = ventes.slice(0, 10);
  const maxQte = Math.max(1, ...top.map((v) => v.qte || 0));
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="font-normal text-muted-foreground text-sm">Top ventes du jour</CardTitle>
        <CardDescription className="text-foreground text-xl tabular-nums leading-none tracking-tight">
          {top.length ? `${fmtFdj(total)} (top ${top.length})` : "Pas de ventes ce jour"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {top.length > 0 && (
          <div aria-label="Parts du CA" className="flex h-2 gap-1 overflow-hidden rounded bg-muted" role="img">
            {top.slice(0, 5).map((v, i) => (
              <div
                key={v.code}
                className="h-full"
                style={{ width: `${total ? Math.max(2, ((v.ca || 0) / total) * 100) : 0}%`, background: `var(--chart-${(i % 5) + 1})` }}
              />
            ))}
          </div>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Article</TableHead>
              <TableHead className="text-right">Qté</TableHead>
              <TableHead className="text-right">CA</TableHead>
              <TableHead className="text-right">Rotation</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {top.map((v) => (
              <TableRow key={v.code}>
                <TableCell>
                  <div className="font-medium tabular-nums">{v.code}</div>
                  <div className="max-w-48 truncate text-muted-foreground text-xs">{v.libelle ?? ""}</div>
                  {v.promo && (
                    <Badge variant="outline" className="mt-1">
                      promo
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{v.qte}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtFdj(v.ca)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {v.rotation_jour != null ? `${(v.rotation_jour * 100).toFixed(1)}%/j` : "—"}
                </TableCell>
              </TableRow>
            ))}
            {!top.length && (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">
                  {prixManquants
                    ? "Ventes non chiffrables (pas de gamme ce jour) — il y a bien eu des ventes."
                    : "Aucune vente enregistrée."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
