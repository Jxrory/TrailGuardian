function batteryIcon(level, charging) {
  if (charging) return 'fa-bolt text-amber-400';
  if (level === null) return 'fa-battery-empty text-slate-400';
  if (level <= 0.2) return 'fa-battery-quarter text-rose-400';
  if (level <= 0.45) return 'fa-battery-half text-amber-400';
  if (level <= 0.75) return 'fa-battery-three-quarters text-emerald-400';
  return 'fa-battery-full text-emerald-400';
}

const MOTION_LABELS = {
  MOVING: '运动中',
  STANDBY: '就绪',
  STATIONARY: '静止',
  BACKGROUND: '后台记录',
};

export function AppHeader({
  battery,
  lowPowerEnabled,
  motionState,
  workspaceName,
  onWorkspaceClick,
}) {

  return (
    <header className="z-30 flex shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900/95 px-3 py-2 text-xs">
      <button
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        onClick={onWorkspaceClick}
        type="button"
      >
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full shadow-[0_0_8px_#10b981] ${
            workspaceName ? 'bg-emerald-500' : 'bg-amber-500'
          }`}
          title={workspaceName ? '工作空间已加载' : '尚未加载工作空间'}
        />
        <span className="min-w-0">
          <span className="block text-[9px] font-medium text-slate-500">
            当前工作空间
          </span>
          <span
            className={`block truncate text-xs font-bold ${
              workspaceName ? 'text-emerald-400' : 'text-amber-400'
            }`}
          >
            {workspaceName || '未加载 · 点击选择'}
          </span>
        </span>
        <span className="shrink-0 rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[9px] text-slate-300">
          {MOTION_LABELS[motionState] ?? '就绪'}
        </span>
      </button>
      <div className="ml-2 flex shrink-0 items-center gap-2 text-slate-300">
        <i
          className={`fa-solid ${
            lowPowerEnabled ? 'fa-leaf text-emerald-400' : 'fa-gauge-high text-amber-400'
          } text-[11px]`}
          title={lowPowerEnabled ? '智能低功耗' : '高性能模式'}
        />
        <div className="flex items-center gap-1 rounded-md border border-slate-700/80 bg-slate-800 px-2 py-0.5">
          <i
            className={`fa-solid ${batteryIcon(battery.level, battery.charging)}`}
          />
          <span className="font-mono font-semibold">
            {battery.level === null ? '--%' : `${Math.round(battery.level * 100)}%`}
          </span>
        </div>
      </div>
    </header>
  );
}
