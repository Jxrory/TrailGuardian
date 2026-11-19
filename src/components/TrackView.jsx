import { useRef, useState } from 'react';
import { ActionModal } from './ActionModal.jsx';
import { downloadGpx, parseTrackFile } from '../services/gpx.js';
import { formatDuration } from '../services/geo.js';
import { useNotifications } from '../hooks/useNotifications.jsx';

function StatCard({ label, value, hint, accent = 'text-emerald-400' }) {
  return (
    <div>
      <div className="mb-1 text-xs text-slate-400">{label}</div>
      <div className={`text-2xl font-black ${accent}`}>
        {value}
        {hint && (
          <span className="ml-1 text-xs font-normal text-slate-400">{hint}</span>
        )}
      </div>
    </div>
  );
}

function GpsBadge({ gpsState }) {
  if (gpsState.status === 'active') {
    return (
      <div className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
        <i className="fa-solid fa-satellite text-xs" />
        GPS 已定位 · ±{Math.round(gpsState.accuracy || 0)} m
      </div>
    );
  }

  if (gpsState.status === 'waiting') {
    return (
      <div className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-amber-400">
        <i className="fa-solid fa-satellite-dish animate-pulse text-xs" />
        正在等待 GPS…
      </div>
    );
  }

  return (
    <div
      className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-rose-400"
      title={gpsState.error}
    >
      <i className="fa-solid fa-triangle-exclamation text-xs" />
      {gpsState.status === 'unsupported' ? '浏览器不支持定位' : '定位不可用'}
    </div>
  );
}

export function TrackView({
    points,
    isRecording,
    isPaused,
    distanceMeters,
    elevationGain,
    currentElevation,
    elapsedSeconds,
    gpsState,
    savedTracks,
    onStartOrPause,
    onFinish,
    onImportTrack,
    onLoadTrack,
    onDeleteTrack,
}) {
  const fileInputRef = useRef(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const { notify } = useNotifications();

  const importFile = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const importedPoints = parseTrackFile(String(reader.result), file.name)
          .filter(
            (point) => Number.isFinite(point.lat) && Number.isFinite(point.lng),
          );
        if (!importedPoints.length) throw new Error('未解析到有效轨迹点');
        onImportTrack({
          points: importedPoints,
          name: file.name.replace(/\.(gpx|kml)$/i, ''),
        });
        notify(`已导入 ${importedPoints.length} 个轨迹点`, 'success');
      } catch (error) {
        notify(error.message || '轨迹文件解析失败', 'error');
      }
    };
    reader.onerror = () => notify('无法读取该文件', 'error');
    reader.readAsText(file);
  };

  const exportCurrent = () => {
    if (!points.length) {
      notify('当前没有正在记录的轨迹', 'error');
      return;
    }
    downloadGpx(`trail_${Date.now()}`, points);
    notify('GPX 文件已导出', 'success');
  };

  const exportSavedTrack = (track) => {
    if (!track.points?.length) {
      notify('该轨迹没有可导出的点', 'error');
      return;
    }
    downloadGpx(track.name, track.points);
    notify('GPX 文件已导出', 'success');
  };

  const startButtonClass = !isRecording || isPaused
    ? 'bg-emerald-600 hover:bg-emerald-500'
    : 'bg-amber-600 hover:bg-amber-500';
  const startIcon = !isRecording ? 'fa-play' : isPaused ? 'fa-play' : 'fa-pause';
  const startLabel = !isRecording ? '开始记录' : isPaused ? '继续记录' : '暂停记录';

  return (
    <section className="absolute inset-0 flex flex-col overflow-y-auto bg-slate-900 p-4">
      <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-emerald-400">
        <i className="fa-solid fa-route" /> 轨迹记录与管理
      </h2>

      <div className="mb-4 grid grid-cols-2 gap-4 rounded-2xl border border-slate-700 bg-slate-800/80 p-5 shadow-lg">
        <StatCard
          hint="km"
          label="运动距离"
          value={(distanceMeters / 1000).toFixed(2)}
        />
        <StatCard
          accent="font-mono text-slate-100"
          label="运动耗时"
          value={formatDuration(elapsedSeconds)}
        />
        <StatCard
          hint={`/ ${currentElevation === null ? '--m' : `${currentElevation}m`}`}
          label="累计爬升 / 海拔"
          value={`+${Math.round(elevationGain)}m`}
        />
        <div>
          <div className="mb-1 text-xs text-slate-400">采样与保活状态</div>
          <GpsBadge gpsState={gpsState} />
          <div className="mt-1 text-[10px] text-slate-500">
            已记录 {points.length} 点
          </div>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3">
        <button
          className={`flex items-center justify-center gap-2 rounded-xl py-3.5 font-bold text-white shadow-lg transition active:scale-95 ${startButtonClass}`}
          onClick={onStartOrPause}
          type="button"
        >
          <i className={`fa-solid ${startIcon}`} /> {startLabel}
        </button>
        <button
          className="flex items-center justify-center gap-2 rounded-xl bg-rose-600/80 py-3.5 font-bold text-white shadow-lg transition hover:bg-rose-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!isRecording}
          onClick={onFinish}
          type="button"
        >
          <i className="fa-solid fa-stop" /> 结束保存
        </button>
      </div>

      <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-slate-700/60 bg-slate-800/50 p-4">
        <h3 className="text-sm font-semibold text-slate-300">轨迹导入与导出</h3>
        <div className="grid grid-cols-2 gap-3">
          <input
            accept=".gpx,.kml"
            className="hidden"
            onChange={importFile}
            ref={fileInputRef}
            type="file"
          />
          <button
            className="flex items-center justify-center gap-2 rounded-xl bg-slate-700 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-slate-600"
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            <i className="fa-solid fa-file-arrow-up" /> 导入 GPX/KML
          </button>
          <button
            className="flex items-center justify-center gap-2 rounded-xl bg-slate-700 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-slate-600"
            onClick={exportCurrent}
            type="button"
          >
            <i className="fa-solid fa-file-arrow-down" /> 导出 GPX
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 pb-16">
        <h3 className="text-sm font-semibold text-slate-300">历史轨迹列表</h3>
        {savedTracks.length === 0 ? (
          <div className="py-6 text-center text-sm text-slate-500">
            暂无历史轨迹
          </div>
        ) : (
          savedTracks.map((track) => (
            <div
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-700/80 bg-slate-800 p-3.5"
              key={track.id}
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-200">
                  {track.name}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
                  <span>
                    <i className="fa-solid fa-road text-emerald-400" />{' '}
                    {track.distance} km
                  </span>
                  <span>
                    <i className="fa-solid fa-arrow-trend-up text-amber-400" /> +
                    {track.eleGain}m
                  </span>
                  <span>
                    <i className="fa-solid fa-clock text-slate-400" /> {track.time}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button
                  className="rounded-lg bg-slate-700 p-2 text-xs text-emerald-400"
                  onClick={() => onLoadTrack(track)}
                  title="查看轨迹"
                  type="button"
                >
                  <i className="fa-solid fa-eye" />
                </button>
                <button
                  className="rounded-lg bg-slate-700 p-2 text-xs text-sky-400"
                  onClick={() => exportSavedTrack(track)}
                  title="导出 GPX"
                  type="button"
                >
                  <i className="fa-solid fa-download" />
                </button>
                <button
                  className="rounded-lg bg-slate-700 p-2 text-xs text-rose-400"
                  onClick={() => setPendingDelete(track)}
                  title="删除轨迹"
                  type="button"
                >
                  <i className="fa-solid fa-trash" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <ActionModal
        actions={[
          {
            label: '取消',
            className:
              'rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300',
            onClick: () => setPendingDelete(null),
          },
          {
            label: '删除',
            className:
              'rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white',
            onClick: () => {
              onDeleteTrack(pendingDelete.id);
              setPendingDelete(null);
              notify('历史轨迹已删除', 'info');
            },
          },
        ]}
        open={Boolean(pendingDelete)}
        title="删除轨迹"
      >
        <p>确认删除“{pendingDelete?.name}”？此操作不可撤销。</p>
      </ActionModal>
    </section>
  );
}
