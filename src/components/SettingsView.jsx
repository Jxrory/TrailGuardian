import { useEffect, useState } from 'react';
import { tileCache } from '../services/storage.js';

function Toggle({ checked, disabled, onChange }) {
  return (
    <button
      aria-pressed={checked}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${
        checked ? 'bg-emerald-600' : 'bg-slate-700'
      } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      type="button"
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${
          checked ? 'left-[22px]' : 'left-0.5'
        }`}
      />
    </button>
  );
}

export function SettingsView({
  audioKeepAliveEnabled,
  cacheRevision,
  isRecording,
  lowPowerEnabled,
  offlineMapCount,
  onAudioKeepAliveChange,
  onLowPowerChange,
  onOpenOfflineMaps,
  pageHidden,
}) {
  const [cacheCount, setCacheCount] = useState(null);

  useEffect(() => {
    let cancelled = false;
    tileCache.countTiles().then((count) => {
      if (!cancelled) setCacheCount(count);
    });
    return () => {
      cancelled = true;
    };
  }, [cacheRevision]);

  const sampleRate = pageHidden
    ? '10s / 息屏'
    : lowPowerEnabled
      ? '3s / 运动态'
      : '1.5s / 高性能';
  const cacheSizeMb =
    cacheCount === null ? '--' : ((cacheCount * 24) / 1024).toFixed(1);

  return (
    <section className="absolute inset-0 flex flex-col overflow-y-auto bg-slate-900 p-4">
      <div className="mb-4">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-emerald-500/80">
          TrailGuardian
        </div>
        <h2 className="flex items-center gap-2 text-xl font-bold text-emerald-400">
          <i className="fa-solid fa-gear" /> 设置
        </h2>
      </div>

      <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-emerald-800/60 bg-slate-800/90 p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-bold text-emerald-400">
            <i className="fa-solid fa-bolt" /> 实时功耗与保活状态
          </span>
          <span className="rounded-full border border-emerald-700 bg-emerald-950 px-2.5 py-0.5 text-xs text-emerald-300">
            {pageHidden ? '息屏省电' : lowPowerEnabled ? '智能低功耗' : '高性能'}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 rounded-xl border border-slate-700/60 bg-slate-900/80 p-3 text-center">
          <div>
            <div className="text-[10px] text-slate-400">GPS 策略</div>
            <div className="mt-1 text-xs font-bold text-slate-200">{sampleRate}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400">防丢快照</div>
            <div className="mt-1 text-xs font-bold text-emerald-400">
              {isRecording ? '自动保存中' : '已就绪'}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400">后台锁</div>
            <div className="mt-1 text-xs font-bold text-amber-400">
              {isRecording ? '已请求' : '待启动'}
            </div>
          </div>
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between rounded-2xl border border-slate-700 bg-slate-800/80 p-4">
        <div className="pr-3">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-200">
            后台音频轨道防杀保活
            <span className="rounded bg-emerald-900/80 px-1.5 py-0.5 text-[10px] text-emerald-300">
              推荐
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-400">
            降低移动端息屏后冻结 GPS 进程的概率
          </div>
        </div>
        <Toggle checked={audioKeepAliveEnabled} onChange={onAudioKeepAliveChange} />
      </div>

      <div className="mb-3 flex items-center justify-between rounded-2xl border border-slate-700 bg-slate-800/80 p-4">
        <div className="pr-3">
          <div className="text-sm font-semibold text-slate-200">
            自适应省电与静止休眠
          </div>
          <div className="mt-1 text-xs text-slate-400">
            扎营休息时降低采样频率，延长续航
          </div>
        </div>
        <Toggle checked={lowPowerEnabled} onChange={onLowPowerChange} />
      </div>

      <button
        className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-slate-700 bg-slate-800/80 p-4 text-left transition hover:border-emerald-800 hover:bg-slate-800"
        onClick={onOpenOfflineMaps}
        type="button"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <i className="fa-solid fa-layer-group text-emerald-400" /> 离线地图
          </div>
          <div className="mt-1 text-xs leading-relaxed text-slate-400">
            独立圈选区域、选择层级并管理离线瓦片包
          </div>
          <div className="mt-2 text-[10px] text-emerald-400">
            {offlineMapCount} 个离线区域 · 缓存{' '}
            {cacheCount === null ? '计算中…' : `${cacheCount} 张 · ${cacheSizeMb} MB`}
          </div>
        </div>
        <i className="fa-solid fa-chevron-right shrink-0 text-slate-500" />
      </button>

      <div className="mb-16 mt-auto flex flex-col gap-1.5 rounded-2xl border border-slate-700/60 bg-slate-800/50 p-4 text-xs text-slate-400">
        <div className="font-semibold text-slate-300">
          野径户外助手 · TrailGuardian v2.0
        </div>
        <div>React + Vite + Leaflet，支持工作空间、等高线、GPX、轨迹和离线地图。</div>
        <div>等高线由 AWS Terrain 高程数据在本地生成，首次访问需要联网。</div>
      </div>
    </section>
  );
}
