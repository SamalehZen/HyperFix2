"use client"

import { Treemap, ResponsiveContainer, Tooltip } from "recharts"

export function ChartTreemap({ data }: { data: { name: string; value: number }[] }) {
  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <Treemap
          data={data}
          dataKey="value"
          aspectRatio={4 / 3}
          stroke="var(--border)"
          fill="var(--chart-1)"
          isAnimationActive={true}
          animationDuration={400}
          content={<CustomizedContent />}
        >
          <Tooltip formatter={(value: any, name: any) => [`${Number(value).toLocaleString("fr-FR")} FDJ`, String(name)]} />
        </Treemap>
      </ResponsiveContainer>
    </div>
  )
}

const CustomizedContent = (props: any) => {
  const { x, y, width, height, name, value, depth } = props
  if (depth !== 1) return null
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} style={{ fill: "var(--chart-1)", stroke: "var(--background)", strokeWidth: 2 }} />
      {width > 60 && height > 30 && (
        <text x={x + width / 2} y={y + height / 2} textAnchor="middle" fill="var(--chart-1-foreground)" fontSize={12}>
          <tspan x={x + width / 2} dy="0">{name}</tspan>
          <tspan x={x + width / 2} dy="1.2em" fontSize={10}>{value.toLocaleString("fr-FR")}</tspan>
        </text>
      )}
    </g>
  )
}
