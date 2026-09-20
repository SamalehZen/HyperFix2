import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

import type { SourcesSegment } from "../_lib/gamme";

function fmtFdj(v: number): string {
  return v.toLocaleString("fr-FR", { maximumFractionDigits: 0 });
}

export function SourcesValeurBloquee({ segments }: { segments: SourcesSegment[] | null }) {
  const data = segments ?? [
    { label: "Négatifs critiques", value: 10_000 },
    { label: "Négatifs importants", value: 3_146 },
    { label: "Nouveaux négatifs", value: 986 },
  ];
  const total = data.reduce((sum, segment) => sum + segment.value, 0);
  const barColors = ["bg-chart-1", "bg-chart-4", "bg-chart-3"];

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="font-normal">Sources de la valeur bloquée</CardTitle>
      </CardHeader>

      <CardContent className="grid grid-cols-1 gap-1 md:grid-cols-3">
        {data.map((segment, index) => {
          const pct = total > 0 ? Math.round((segment.value / total) * 100) : 0;
          const barColor = barColors[index % barColors.length];
          return (
            <section className="isolate flex gap-[0.5px]" key={segment.label}>
              <Separator
                orientation="vertical"
                className="mb-1 h-auto self-auto border-muted-foreground/50 border-l border-dashed bg-transparent"
              />
              <div className="flex min-h-24 flex-1 flex-col justify-between">
                <div className="flex min-w-0 flex-col gap-1 px-1">
                  <p className="wrap-break-word flex items-center gap-1.5 text-muted-foreground text-xs leading-none">
                    <span className={`inline-block size-2 shrink-0 rounded-full ${barColor}`} />
                    {segment.label} · {pct}%
                  </p>
                  <div className="text-lg leading-none tracking-tight">{fmtFdj(segment.value)} FDJ</div>
                </div>
                <div className={`-ml-0.5 h-5 rounded-sm ${barColor}`} />
              </div>
            </section>
          );
        })}
      </CardContent>
    </Card>
  );
}
