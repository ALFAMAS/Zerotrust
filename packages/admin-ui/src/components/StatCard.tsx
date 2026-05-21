interface StatCardProps {
  title: string;
  value: string | number;
  trend?: { value: string; positive: boolean };
  icon?: string;
  color?: "indigo" | "green" | "yellow" | "red";
}

const colorMap = {
  indigo: "from-indigo-600 to-indigo-700",
  green: "from-emerald-600 to-emerald-700",
  yellow: "from-amber-500 to-amber-600",
  red: "from-red-600 to-red-700",
};

export function StatCard({ title, value, trend, icon, color = "indigo" }: StatCardProps) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 flex items-start gap-4">
      {icon && (
        <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${colorMap[color]} flex items-center justify-center text-xl flex-shrink-0`}>
          {icon}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm text-gray-400 mb-1">{title}</div>
        <div className="text-2xl font-bold text-white">{value}</div>
        {trend && (
          <div className={`text-xs mt-1 ${trend.positive ? "text-emerald-400" : "text-red-400"}`}>
            {trend.positive ? "↑" : "↓"} {trend.value}
          </div>
        )}
      </div>
    </div>
  );
}
