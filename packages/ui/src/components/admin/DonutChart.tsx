"use client";

import { PieCenter } from "@/components/charts/pie-center";
import { PieChart } from "@/components/charts/pie-chart";
import type { PieData } from "@/components/charts/pie-context";
import { PieSlice } from "@/components/charts/pie-slice";

interface DonutChartProps {
  labels: string[];
  series: number[];
}

export default function DonutChart({ labels, series }: DonutChartProps) {
  const data: PieData[] = labels.map((label, index) => ({
    label,
    value: series[index] ?? 0,
  }));

  return (
    <PieChart className="mx-auto max-w-[280px]" data={data} innerRadius={70} size={280}>
      {data.map((item, index) => (
        <PieSlice key={item.label} index={index} />
      ))}
      <PieCenter defaultLabel="Total" />
    </PieChart>
  );
}
