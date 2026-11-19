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

export function AppHeader({ battery, lowPowerEnabled, motionState }) {
  const powerMode = lowPowerEnabled ? '智能低功耗' : '标准模式';
  const powerSaving = lowPowerEnabled ? '+35%' : '+0%';

  return (
    <header className="z-30 flex shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900/95 px-3 py-2 text-xs">
      <div className="flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]"
          title="系统运行正常"
        />
        <span className="font-bold tracking-wide text-emerald-400">
          {powerMode}
        </span>
        <span className="rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">
          {MOTION_LABELS[motionState] ?? '就绪'}
        </span>
      </div>
      <div className="flex items-center gap-3 text-slate-300">
        <span className="hidden text-[11px] text-emerald-400/90 sm:inline">
          节电预估 {powerSaving}
        </span>
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
