"use client";

import { Ring } from "@/components/charts/ring";
import { RingCenter } from "@/components/charts/ring-center";
import { RingChart } from "@/components/charts/ring-chart";
import type { RingData } from "@/components/charts/ring-context";

interface RadialGaugeProps {
  /** 0–100 */
  value: number;
  label: string;
  caption?: string;
}

export default function RadialGauge({ value, label, caption }: RadialGaugeProps) {
  const data: RingData[] = [{ label, value, maxValue: 100 }];

  return (
    <div className="flex flex-col items-center">
      <RingChart
        baseInnerRadius={72}
        className="mx-auto max-w-[240px]"
        data={data}
        size={240}
        strokeWidth={14}
      >
        <Ring index={0} showGlow={false} />
        <RingCenter defaultLabel={label} suffix="%" />
      </RingChart>
      {caption && <p className="-mt-2 text-center text-sm text-muted-foreground">{caption}</p>}
    </div>
  );
}
