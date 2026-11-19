import { useEffect, useState } from 'react';
import { useNotifications } from '../hooks/useNotifications.jsx';
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
  lowPowerEnabled,
  onLowPowerChange,
  audioKeepAliveEnabled,
  onAudioKeepAliveChange,
  pageHidden,
  isRecording,
  cacheRevision,
  onDownloadArea,
  onCacheCleared,
}) {
  const { notify } = useNotifications();
  const [cacheCount, setCacheCount] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let cancelled = false;
    tileCache.countTiles().then((count) => {
      if (!cancelled) setCacheCount(count);
    });
    return () => {
      cancelled = true;
    };
  }, [cacheRevision]);

  const downloadArea = async () => {
    setDownloading(true);
    setProgress(0);
    try {
      const result = await onDownloadArea(setProgress);
      if (!result?.ok) {
        notify(result?.message ?? '离线包下载失败', 'error');
        return;
      }
      if (result.failed > 0) {
        notify(
          `离线包完成：新增 ${result.downloaded} 张，复用 ${result.cached} 张，${result.failed} 张失败`,
          'info',
          5000,
        );
      } else {
        notify(
          `离线包完成：共 ${result.total} 张瓦片，新增 ${result.downloaded} 张`,
          'success',
        );
      }
      setCacheCount(await tileCache.countTiles());
    } finally {
      setDownloading(false);
      setProgress(0);
    }
  };

  const clearCache = async () => {
    await tileCache.clearTiles();
    setCacheCount(0);
    onCacheCleared?.();
    notify('离线地图缓存已清空', 'success');
  };

  const cacheSizeMb = cacheCount === null ? '--' : ((cacheCount * 26) / 1024).toFixed(1);
  const sampleRate = pageHidden
    ? '10s / 息屏'
    : lowPowerEnabled
      ? '3s / 运动态'
      : '1.5s / 高性能';

  return (
    <section className="absolute inset-0 flex flex-col overflow-y-auto bg-slate-900 p-4">
      <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-emerald-400">
        <i className="fa-solid fa-shield-halved" /> 息屏保活与离线中心
      </h2>

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

      <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-slate-700 bg-slate-800/80 p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-200">
            离线卫星与等高线瓦片库
          </div>
          <span className="rounded-full border border-emerald-800 bg-emerald-950/60 px-2.5 py-1 text-xs text-emerald-400">
            {cacheCount === null ? '计算中…' : `${cacheCount} 张 · ${cacheSizeMb} MB`}
          </span>
        </div>
        <div className="text-xs leading-relaxed text-slate-400">
          在有网时下载当前视野的底图与等高线瓦片。进山断网后，已缓存的区域仍可正常显示。
        </div>
        {(downloading || progress > 0) && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-700">
            <div
              className="h-1.5 rounded-full bg-emerald-500 transition-all duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
        <div className="mt-1 flex gap-2">
          <button
            className="rounded-xl border border-rose-800/60 bg-rose-950/40 px-4 py-2.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-900/50"
            onClick={clearCache}
            type="button"
          >
            清空缓存
          </button>
          <button
            className="flex-1 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-wait disabled:opacity-60"
            disabled={downloading}
            onClick={downloadArea}
            type="button"
          >
            {downloading ? `下载中 ${progress}%` : '批量下载当前区域离线包'}
          </button>
        </div>
      </div>

      <div className="mb-16 mt-auto flex flex-col gap-1.5 rounded-2xl border border-slate-700/60 bg-slate-800/50 p-4 text-xs text-slate-400">
        <div className="font-semibold text-slate-300">
          野径户外助手 · TrailGuardian v2.0
        </div>
        <div>React + Vite + Leaflet，支持等高线、GPX、轨迹记录、路标和离线瓦片。</div>
        <div>等高线由 AWS Terrain 高程数据在本地生成，首次访问需要联网。</div>
      </div>
    </section>
  );
}
