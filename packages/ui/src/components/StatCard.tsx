interface StatCardProps {
  title: string;
  value: string | number;
  icon: string;
  color: string;
  trend?: string;
}

const borderColorMap: Record<string, string> = {
  blue: "border-blue-500",
  green: "border-green-500",
  indigo: "border-indigo-500",
  purple: "border-purple-500",
  orange: "border-orange-500",
  red: "border-red-500",
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
  const border = borderColorMap[color] ?? "border-indigo-500";
  const iconBg = iconBgMap[color] ?? "bg-indigo-900/40 text-indigo-400";

  return (
    <div className={`bg-gray-900 rounded-xl p-5 border-l-4 ${border} flex items-start gap-4`}>
      <div className={`rounded-lg p-2.5 text-xl ${iconBg}`}>{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-400 truncate">{title}</p>
        <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
        {trend && (
          <p className="mt-1 text-xs text-gray-500">{trend}</p>
        )}
      </div>
    </div>
  );
}
