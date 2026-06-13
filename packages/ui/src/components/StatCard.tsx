import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: string;
  color: string;
  trend?: string;
}

const borderColorMap: Record<string, string> = {
  blue: "border-l-blue-500",
  green: "border-l-green-500",
  indigo: "border-l-indigo-500",
  purple: "border-l-purple-500",
  orange: "border-l-orange-500",
  red: "border-l-red-500",
};

const iconBgMap: Record<string, string> = {
  blue: "bg-blue-900/40 text-blue-400",
  green: "bg-green-900/40 text-green-400",
  indigo: "bg-indigo-900/40 text-indigo-400",
  purple: "bg-purple-900/40 text-purple-400",
  orange: "bg-orange-900/40 text-orange-400",
  red: "bg-red-900/40 text-red-400",
};

export default function StatCard({ title, value, icon, color, trend }: StatCardProps) {
  const border = borderColorMap[color] ?? "border-l-indigo-500";
  const iconBg = iconBgMap[color] ?? "bg-indigo-900/40 text-indigo-400";

  return (
    <Card className={cn("flex items-start gap-4 border-l-4 p-5", border)}>
      <div className={cn("rounded-lg p-2.5 text-xl", iconBg)}>{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-muted-foreground">{title}</p>
        <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
        {trend && <p className="mt-1 text-xs text-muted-foreground/70">{trend}</p>}
      </div>
    </Card>
  );
}
