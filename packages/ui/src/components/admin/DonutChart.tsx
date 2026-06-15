"use client";

import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";

const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

interface DonutChartProps {
  labels: string[];
  series: number[];
}

export default function DonutChart({ labels, series }: DonutChartProps) {
  const total = series.reduce((a, b) => a + b, 0);

  const options: ApexOptions = {
    chart: { type: "donut", fontFamily: "inherit" },
    labels,
    colors: ["#6366f1", "#818cf8", "#a5b4fc", "#4f46e5", "#c7d2fe"],
    stroke: { width: 0 },
    legend: { position: "bottom", fontSize: "13px", labels: { colors: "#94a3b8" } },
    dataLabels: { enabled: false },
    plotOptions: {
      pie: {
        donut: {
          size: "70%",
          labels: {
            show: true,
            name: { color: "#94a3b8" },
            value: { color: "#e2e8f0", fontSize: "26px", fontWeight: 600 },
            total: {
              show: true,
              label: "Total",
              color: "#94a3b8",
              fontSize: "13px",
              formatter: () => String(total),
            },
          },
        },
      },
    },
    tooltip: { theme: "dark" },
  };

  return <ReactApexChart options={options} series={series} type="donut" height={280} />;
}
