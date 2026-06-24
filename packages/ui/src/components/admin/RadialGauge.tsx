"use client";

import type { ApexOptions } from "apexcharts";
import dynamic from "next/dynamic";

// ApexCharts touches `window`, so load it client-only (same pattern as the
// TailAdmin chart components, re-skinned to zerotrust's indigo palette).
const ReactApexChart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
});

interface RadialGaugeProps {
  /** 0–100 */
  value: number;
  label: string;
  caption?: string;
}

export default function RadialGauge({ value, label, caption }: RadialGaugeProps) {
  const options: ApexOptions = {
    chart: {
      type: "radialBar",
      sparkline: { enabled: true },
      fontFamily: "inherit",
    },
    colors: ["#6366f1"],
    plotOptions: {
      radialBar: {
        hollow: { size: "60%" },
        track: { background: "rgba(148, 163, 184, 0.15)", strokeWidth: "100%" },
        dataLabels: {
          name: { offsetY: 24, color: "#94a3b8", fontSize: "12px" },
          value: {
            offsetY: -14,
            color: "#e2e8f0",
            fontSize: "30px",
            fontWeight: 600,
            formatter: (v: number) => `${Math.round(v)}%`,
          },
        },
      },
    },
    fill: {
      type: "gradient",
      gradient: {
        shade: "dark",
        type: "horizontal",
        gradientToColors: ["#818cf8"],
        stops: [0, 100],
      },
    },
    stroke: { lineCap: "round" },
    labels: [label],
  };

  return (
    <div className="flex flex-col items-center">
      <ReactApexChart options={options} series={[value]} type="radialBar" height={240} />
      {caption && <p className="-mt-2 text-center text-sm text-muted-foreground">{caption}</p>}
    </div>
  );
}
