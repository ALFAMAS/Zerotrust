"use client";

import { Area } from "@/components/charts/area";
import { AreaChart } from "@/components/charts/area-chart";
import { Grid } from "@/components/charts/grid";
import { ChartTooltip } from "@/components/charts/tooltip";
import { XAxis } from "@/components/charts/x-axis";
import { cn } from "@/lib/utils";

export interface TrendPoint {
  date: Date;
  value: number;
}

interface AreaTrendChartProps {
  points: TrendPoint[];
  /** Row key passed to AreaChart / Area. Default: "value" */
  valueKey?: string;
  /** Tooltip label for the series. Default: "Events" */
  seriesLabel?: string;
  loading?: boolean;
  className?: string;
}

export default function AreaTrendChart({
  points,
  valueKey = "value",
  seriesLabel = "Events",
  loading = false,
  className,
}: AreaTrendChartProps) {
  const data = points.map((point) => ({
    date: point.date,
    [valueKey]: point.value,
  }));

  return (
    <AreaChart
      className={cn("w-full", className)}
      data={data}
      loadingLabel="Loading chart…"
      status={loading ? "loading" : "ready"}
      style={{ height: 256 }}
      xDataKey="date"
    >
      <Grid horizontal numTicksRows={4} vertical={false} />
      <Area dataKey={valueKey} fill="var(--chart-1)" stroke="var(--chart-1)" />
      <XAxis numTicks={5} />
      <ChartTooltip
        rows={(point) => [
          {
            label: seriesLabel,
            value: String(point[valueKey] ?? 0),
            color: "var(--chart-1)",
          },
        ]}
      />
    </AreaChart>
  );
}
