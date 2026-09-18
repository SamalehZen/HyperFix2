"use client";

import * as React from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { GammeDashboard } from "./_components/gamme-dashboard";
import { MouvementsDashboard } from "./_components/mouvements-dashboard";

export default function Page() {
  const [rayon, setRayon] = React.useState("frais-surgele");
  const [jour, setJour] = React.useState<string | null>(null);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const r = params.get("rayon");
    if (r) setRayon(r);
    const j = params.get("jour");
    if (j) setJour(j);
  }, []);

  return (
    <Tabs defaultValue="pilotage" className="flex flex-col gap-4">
      <TabsList className="w-fit">
        <TabsTrigger value="pilotage">Pilotage</TabsTrigger>
        <TabsTrigger value="mouvements">Mouvements</TabsTrigger>
      </TabsList>
      <TabsContent value="pilotage">
        <GammeDashboard />
      </TabsContent>
      <TabsContent value="mouvements">
        <MouvementsDashboard rayon={rayon} jour={jour} />
      </TabsContent>
    </Tabs>
  );
}
