import { ArrowUpRight } from "lucide-react";

import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

import type { GammeStory } from "../_lib/gamme";

function fmtFdj(v: number): string {
  return v.toLocaleString("fr-FR", { maximumFractionDigits: 0 });
}

export function TopNegatifs({ story }: { story: GammeStory | null }) {
  const produits = story
    ? story.top_neg.slice(0, 3).map((t) => {
        const valeur = Math.round(t.valeur);
        const share =
          story.top_neg.slice(0, 3).reduce((sum, item) => sum + item.valeur, 0) > 0
            ? Math.round((t.valeur / story.top_neg.slice(0, 3).reduce((sum, item) => sum + item.valeur, 0)) * 100)
            : 0;
        const priorite = story.negatifs.find((n) => n.code === t.code)?.priorite ?? "critique";
        return {
          name: t.libelle,
          category: `${priorite.charAt(0).toUpperCase() + priorite.slice(1)} · ${t.stock ?? 0} u.`,
          share: `${share}%`,
          sales: `${fmtFdj(valeur)} FDJ`,
        };
      })
    : [
        { name: "LANIÈRES DINDES FUMÉES 150G", category: "Critique · -6 u.", share: "28%", sales: "3 919 FDJ" },
        { name: "ALK PARATHA PLAIN 400G", category: "Critique · -13 u.", share: "23%", sales: "3 234 FDJ" },
        { name: "HACHÉ BOEUF PR TR 400G", category: "Critique · -9 u.", share: "20%", sales: "2 847 FDJ" },
      ];

  const totalValue = story ? Math.round(story.top_neg.slice(0, 3).reduce((sum, t) => sum + t.valeur, 0)) : 14_132;

  const negatifsCount = story ? story.negatifs.length : 0;
  const critiques = story?.resume.critiques ?? 3;
  const importants = story?.resume.importants ?? 2;
  const autres = Math.max(0, negatifsCount - critiques - importants);

  const categories = [
    {
      name: "Critiques",
      share: negatifsCount ? Math.round((critiques / negatifsCount) * 100) : 50,
      color: "var(--chart-3)",
    },
    {
      name: "Importants",
      share: negatifsCount ? Math.round((importants / negatifsCount) * 100) : 33,
      color: "var(--chart-2)",
    },
    { name: "Autres", share: negatifsCount ? Math.round((autres / negatifsCount) * 100) : 17, color: "var(--chart-1)" },
  ];

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="font-normal text-muted-foreground text-sm">Top négatifs</CardTitle>
        <CardDescription className="text-foreground text-xl tabular-nums leading-none tracking-tight">
          {fmtFdj(totalValue)} FDJ bloqués
        </CardDescription>
        <CardAction>
          <ArrowUpRight className="size-4" />
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <div aria-label="Répartition par priorité" className="flex h-2 gap-1 overflow-hidden bg-muted" role="img">
            {categories.map((category) => (
              <div
                aria-hidden="true"
                key={category.name}
                className="rounded-md"
                style={{
                  backgroundColor: category.color,
                  width: `${category.share}%`,
                }}
              />
            ))}
          </div>

          <div className="flex flex-wrap gap-4">
            {categories.map((category) => (
              <div className="flex items-center gap-1" key={category.name}>
                <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: category.color }} />
                <span className="text-muted-foreground text-xs">{category.name}</span>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-3">
          <div className="text-muted-foreground text-xs">Articles</div>
          <div className="text-muted-foreground text-xs">Part</div>
          <div className="text-muted-foreground text-xs">Valeur</div>

          {produits.map((produit) => (
            <div className="contents text-sm" key={produit.name}>
              <div className="min-w-0">
                <div className="truncate font-medium">{produit.name}</div>
                <div className="text-muted-foreground text-xs">{produit.category}</div>
              </div>
              <div className="self-center text-muted-foreground tabular-nums">{produit.share}</div>
              <div className="self-center font-medium tabular-nums">{produit.sales}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
