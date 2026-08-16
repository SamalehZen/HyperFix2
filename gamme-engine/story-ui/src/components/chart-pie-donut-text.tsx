"use client"

import { Label, Pie, PieChart } from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { Resume } from "@/lib/story"

export const description = "Répartition nouveaux / persistants"

const chartConfig = {
  value: {
    label: "Articles",
  },
  nouveaux: {
    label: "Nouveaux",
    color: "var(--chart-2)",
  },
  persistants: {
    label: "Persistants",
    color: "var(--chart-4)",
  },
} satisfies ChartConfig

export function ChartPieDonutText({ resume }: { resume: Resume }) {
  const chartData = [
    { statut: "nouveaux", value: resume.nouveaux, fill: "var(--color-nouveaux)" },
    { statut: "persistants", value: resume.persistants, fill: "var(--color-persistants)" },
  ]
  const total = resume.nouveaux + resume.persistants

  return (
    <Card className="flex flex-col">
      <CardHeader className="items-center pb-0">
        <CardTitle>Répartition des négatifs</CardTitle>
        <CardDescription>Nouveaux vs persistants du jour</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 pb-0">
        <ChartContainer
          config={chartConfig}
          className="mx-auto aspect-square max-h-[250px]"
        >
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="statut"
              innerRadius={60}
              strokeWidth={5}
            >
              <Label
                content={({ viewBox }) => {
                  if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                    return (
                      <text
                        x={viewBox.cx}
                        y={viewBox.cy}
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        <tspan
                          x={viewBox.cx}
                          y={viewBox.cy}
                          className="fill-foreground text-3xl font-bold"
                        >
                          {total.toLocaleString("fr-FR")}
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy || 0) + 24}
                          className="fill-muted-foreground"
                        >
                          négatifs
                        </tspan>
                      </text>
                    )
                  }
                }}
              />
            </Pie>
          </PieChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col gap-2 text-sm">
        <div className="flex items-center gap-2 leading-none font-medium">
          {resume.critiques.toLocaleString("fr-FR")} critiques à traiter en priorité
        </div>
        <div className="leading-none text-muted-foreground">
          {resume.persistants.toLocaleString("fr-FR")} articles négatifs depuis au moins la veille
        </div>
      </CardFooter>
    </Card>
  )
}
