"use client";

import { AlertTriangle, Bell, Info } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

import type { MvtAlerte } from "../_lib/mouvements";

const ICONS = {
  critique: AlertTriangle,
  attention: Bell,
  info: Info,
} as const;

export function MvtAlertes({ alertes }: { alertes: MvtAlerte[] }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Alertes du jour</CardTitle>
        <CardDescription>
          {alertes.length ? `${alertes.length} signalement(s)` : "Rien à signaler. Journée propre."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-72">
          <div className="flex flex-col gap-3 pr-3">
            {alertes.map((a, i) => {
              const Icon = ICONS[a.niveau] ?? Info;
              return (
                <Alert
                  key={i}
                  variant={a.niveau === "critique" ? "destructive" : "default"}
                  className={a.niveau === "attention" ? "border-yellow-500/40" : undefined}
                >
                  <Icon className="size-4" />
                  <AlertTitle>{a.titre}</AlertTitle>
                  <AlertDescription>{a.detail}</AlertDescription>
                </Alert>
              );
            })}
            {!alertes.length && (
              <p className="text-muted-foreground text-sm">
                Aucun retour massif, aucune cession inhabituelle, aucun périmé, aucun écart.
              </p>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
