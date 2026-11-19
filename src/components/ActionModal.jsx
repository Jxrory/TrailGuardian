export function ActionModal({
  open,
  title,
  children,
  actions = [],
  maxWidth = 'max-w-sm',
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div
        className={`flex w-full ${maxWidth} flex-col gap-4 rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl`}
      >
        <h3 className="text-lg font-bold text-emerald-400">{title}</h3>
        <div className="text-sm leading-relaxed text-slate-300">{children}</div>
        {actions.length > 0 && (
          <div className="mt-2 flex justify-end gap-3">
            {actions.map((action) => (
              <button
                className={action.className}
                key={action.label}
                onClick={action.onClick}
                type="button"
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
