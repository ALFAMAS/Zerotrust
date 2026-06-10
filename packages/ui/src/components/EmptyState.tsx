"use client";

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionHref?: string;
}

export default function EmptyState({
  icon = "📭",
  title,
  description,
  actionLabel,
  onAction,
  actionHref,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <span className="text-4xl mb-4" aria-hidden>
        {icon}
      </span>
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      {description && <p className="mt-1 text-sm text-gray-400 max-w-sm">{description}</p>}
      {actionLabel &&
        (actionHref ? (
          <a
            href={actionHref}
            className="mt-5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {actionLabel}
          </a>
        ) : (
          <button
            onClick={onAction}
            className="mt-5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {actionLabel}
          </button>
        ))}
    </div>
  );
}
