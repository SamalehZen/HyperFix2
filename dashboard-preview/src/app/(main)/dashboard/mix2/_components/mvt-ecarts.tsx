"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { fmtFdj, type MvtEcart } from "../_lib/mouvements";

export function MvtEcarts({ ecarts }: { ecarts: MvtEcart[] }) {
  const [filtre, setFiltre] = useState("");
  const rows = useMemo(() => {
    const f = filtre.trim().toLowerCase();
    const list = f
      ? ecarts.filter(
          (e) =>
            String(e.code ?? "").includes(f) ||
            (e.libelle ?? "").toLowerCase().includes(f) ||
            e.type.toLowerCase().includes(f),
        )
      : ecarts;
    return [...list].sort((a, b) => Math.abs(b.valeur ?? 0) - Math.abs(a.valeur ?? 0));
  }, [ecarts, filtre]);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Écarts inexpliqués</CardTitle>
        <CardDescription>
          {ecarts.length ? `${ecarts.length} article(s) — triés par valeur` : "Aucun écart ce jour. Données propres."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Input
          placeholder="Filtrer (code, libellé, type)…"
          value={filtre}
          onChange={(e) => setFiltre(e.target.value)}
          className="max-w-xs"
        />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Article</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Écart (pcs)</TableHead>
              <TableHead className="text-right">Valeur</TableHead>
              <TableHead>Signal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(0, 50).map((e, i) => (
              <TableRow key={`${e.code}-${i}`}>
                <TableCell>
                  <div className="font-medium tabular-nums">{e.code ?? "—"}</div>
                  <div className="max-w-56 truncate text-muted-foreground text-xs">{e.libelle ?? ""}</div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{e.type === "nouvel_article" ? "nouveauté" : "écart"}</Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {e.qte != null ? e.qte.toLocaleString("fr-FR") : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">{e.valeur != null ? fmtFdj(e.valeur) : "—"}</TableCell>
                <TableCell>
                  {e.type === "nouvel_article" ? (
                    <Badge variant="outline">assortiment</Badge>
                  ) : e.chevauchement ? (
                    <Badge variant="outline">snapshot 9h-10h</Badge>
                  ) : (
                    <Badge variant="outline" className="border-destructive/20 bg-destructive/10 text-destructive">
                      à vérifier
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  Rien à signaler.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
