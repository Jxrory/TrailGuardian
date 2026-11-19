import { useRef, useState } from 'react';
import { ActionModal } from './ActionModal.jsx';
import { RecordingControls } from './RecordingControls.jsx';
import { useNotifications } from '../hooks/useNotifications.jsx';
import { formatDuration, formatTrackDate } from '../services/geo.js';
import { parseTrackFile } from '../services/gpx.js';

const POI_META = {
  camp: { icon: 'fa-campground', color: '#10b981', label: '营地' },
  water: { icon: 'fa-droplet', color: '#3b82f6', label: '水源' },
  danger: { icon: 'fa-triangle-exclamation', color: '#ef4444', label: '危险' },
  view: { icon: 'fa-mountain-sun', color: '#f59e0b', label: '观景' },
  marker: { icon: 'fa-location-dot', color: '#8b5cf6', label: '标注' },
};

function Stat({ label, value, hint, accent = 'text-emerald-400' }) {
  return (
    <div>
      <div className="mb-1 text-[11px] text-slate-400">{label}</div>
      <div className={`text-xl font-black ${accent}`}>
        {value}
        {hint && (
          <span className="ml-1 text-[10px] font-normal text-slate-400">{hint}</span>
        )}
      </div>
    </div>
  );
}

function GpsBadge({ gpsState }) {
  if (gpsState.status === 'active') {
    return (
      <span className="text-[10px] font-semibold text-emerald-400">
        GPS 已定位 ±{Math.round(gpsState.accuracy || 0)}m
      </span>
    );
  }
  if (gpsState.status === 'waiting') {
    return (
      <span className="text-[10px] font-semibold text-amber-400">等待 GPS…</span>
    );
  }
  return <span className="text-[10px] font-semibold text-rose-400">GPS 不可用</span>;
}

export function WorkspaceView({
  currentElevation,
  distanceMeters,
  elevationGain,
  elapsedSeconds,
  gpsState,
  isPaused,
  isRecording,
  onCreateWorkspace,
  onDeletePoi,
  onExportRecorded,
  onFinish,
  onFocusPoi,
  onImportTarget,
  onOpenHistory,
  onOpenMap,
  onOpenOffline,
  onPause,
  onStart,
  onAddPoi,
  points,
  workspace,
}) {
  const fileInputRef = useRef(null);
  const [pendingDeletePoi, setPendingDeletePoi] = useState(null);
  const { notify } = useNotifications();

  if (!workspace) {
    return (
      <section className="absolute inset-0 flex flex-col items-center justify-center overflow-y-auto bg-slate-900 p-6 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-700 bg-slate-800 text-2xl text-slate-500">
          <i className="fa-solid fa-route" />
        </div>
        <h2 className="text-xl font-bold text-slate-200">尚未加载轨迹工作空间</h2>
        <p className="mt-2 max-w-xs text-xs leading-relaxed text-slate-500">
          目标路径、轨迹记录和标注点位都只能在轨迹工作空间中进行。
        </p>
        <div className="mt-6 grid w-full max-w-xs grid-cols-2 gap-3">
          <button
            className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow hover:bg-emerald-500"
            onClick={onCreateWorkspace}
            type="button"
          >
            <i className="fa-solid fa-plus" /> 新建
          </button>
          <button
            className="rounded-xl bg-slate-700 px-4 py-3 text-sm font-bold text-slate-200 hover:bg-slate-600"
            onClick={onOpenHistory}
            type="button"
          >
            <i className="fa-solid fa-clock-rotate-left" /> 历史
          </button>
        </div>
      </section>
    );
  }

  const recordedTrack = workspace.recordedTrack;
  const hasRecordedTrack = Boolean(recordedTrack?.points?.length);
  const visibleDistance = isRecording ? distanceMeters : recordedTrack?.distanceMeters ?? 0;
  const visibleElevation = isRecording
    ? elevationGain
    : recordedTrack?.elevationGain ?? 0;
  const visibleDuration = isRecording
    ? elapsedSeconds
    : recordedTrack?.durationSeconds ?? 0;
  const visiblePointCount = isRecording ? points.length : recordedTrack?.points?.length ?? 0;

  const importTargetFile = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseTrackFile(String(reader.result), file.name);
        const targetPoints = parsed.points.filter(
          (point) => Number.isFinite(point.lat) && Number.isFinite(point.lng),
        );
        const waypoints = parsed.waypoints.filter(
          (waypoint) =>
            Number.isFinite(waypoint.lat) && Number.isFinite(waypoint.lng),
        );
        if (!targetPoints.length && !waypoints.length) {
          throw new Error('未解析到有效的目标路径或标注点');
        }
        onImportTarget({
          name: file.name.replace(/\.(gpx|kml)$/i, ''),
          points: targetPoints,
          waypoints,
        });
        const parts = [];
        if (targetPoints.length) parts.push(`${targetPoints.length} 个目标路径点`);
        if (waypoints.length) parts.push(`${waypoints.length} 个标注点`);
        notify(`已导入 ${parts.join('、')}`, 'success');
      } catch (error) {
        notify(error.message || '目标路径文件解析失败', 'error');
      }
    };
    reader.onerror = () => notify('无法读取该文件', 'error');
    reader.readAsText(file);
  };

  return (
    <section className="absolute inset-0 flex flex-col overflow-y-auto bg-slate-900 p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-emerald-500/80">
            当前轨迹工作空间
          </div>
          <h2 className="truncate text-xl font-bold text-emerald-400">
            {workspace.name}
          </h2>
          <div className="mt-1 text-[10px] text-slate-500">
            创建于 {formatTrackDate(workspace.createdAt)}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            className="rounded-xl bg-slate-800 p-2.5 text-xs text-emerald-400 hover:bg-slate-700"
            onClick={onOpenMap}
            title="在地图查看工作空间"
            type="button"
          >
            <i className="fa-solid fa-map" />
          </button>
          <button
            className="rounded-xl bg-slate-800 p-2.5 text-xs text-slate-300 hover:bg-slate-700"
            onClick={onOpenHistory}
            title="历史轨迹空间"
            type="button"
          >
            <i className="fa-solid fa-clock-rotate-left" />
          </button>
        </div>
      </div>

      <div className="mb-4 rounded-2xl border border-slate-700 bg-slate-800/80 p-4 shadow-lg">
        <div className="mb-3 flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-bold text-slate-200">
            <i className="fa-solid fa-person-running text-emerald-400" />
            运动记录
          </span>
          <div className="flex items-center gap-2">
            {isRecording && (
              <span className="rounded-full bg-emerald-950 px-2 py-0.5 text-[10px] text-emerald-300">
                {isPaused ? '已暂停' : '记录中'}
              </span>
            )}
            <GpsBadge gpsState={gpsState} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-4">
          <Stat hint="km" label="运动距离" value={(visibleDistance / 1000).toFixed(2)} />
          <Stat
            accent="font-mono text-slate-100"
            label="运动耗时"
            value={formatDuration(visibleDuration)}
          />
          <Stat
            hint={`/ ${currentElevation === null ? '--m' : `${currentElevation}m`}`}
            label="累计爬升 / 当前海拔"
            value={`+${Math.round(visibleElevation)}m`}
          />
          <Stat
            accent="text-sky-400"
            hint="点"
            label="已记录轨迹点"
            value={visiblePointCount}
          />
        </div>
        <div className="mt-4 border-t border-slate-700/70 pt-4">
          <RecordingControls
            isPaused={isPaused}
            isRecording={isRecording}
            onFinish={onFinish}
            onPause={onPause}
            onStart={onStart}
          />
        </div>
      </div>

      <div className="mb-4 rounded-2xl border border-slate-700/70 bg-slate-800/60 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm font-bold text-slate-200">
            <i className="fa-solid fa-flag text-sky-400" />
            目标运动路径
          </span>
          <span className="text-[10px] text-slate-500">可选</span>
        </div>

        {workspace.targetTrack?.points?.length ? (
          <div className="rounded-xl border border-sky-900/70 bg-sky-950/30 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 truncate text-sm font-semibold text-sky-200">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-sky-300 bg-sky-500" />
                  <span className="truncate">{workspace.targetTrack.name}</span>
                </div>
                <div className="mt-1 text-[10px] text-sky-300/70">
                  {workspace.targetTrack.points.length} 个点 · 蓝色虚线显示
                </div>
              </div>
              <button
                className="shrink-0 rounded-lg bg-slate-800 px-3 py-2 text-[11px] font-semibold text-slate-200 hover:bg-slate-700"
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                <i className="fa-solid fa-rotate" /> 重新导入
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-xs leading-relaxed text-slate-500">
              尚未导入目标路径。可以直接记录自己走过的路径，也可以先导入 GPX/KML 作为参考路线。
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                className="rounded-xl bg-sky-700/80 px-3 py-2.5 text-xs font-semibold text-white hover:bg-sky-600"
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                <i className="fa-solid fa-file-arrow-up" /> 导入目标路径
              </button>
              <button
                className="rounded-xl bg-slate-700 px-3 py-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!hasRecordedTrack}
                onClick={onExportRecorded}
                type="button"
              >
                <i className="fa-solid fa-file-arrow-down" /> 导出已走轨迹
              </button>
            </div>
          </div>
        )}
        <input
          accept=".gpx,.kml"
          className="hidden"
          onChange={importTargetFile}
          ref={fileInputRef}
          type="file"
        />
      </div>

      {hasRecordedTrack && !isRecording && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-emerald-900/60 bg-emerald-950/25 p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              已保存的行走轨迹
            </div>
            <div className="mt-1 truncate text-[10px] text-emerald-300/70">
              {recordedTrack.points.length} 点 · {recordedTrack.distance} km · +
              {recordedTrack.eleGain}m · {recordedTrack.time}
            </div>
          </div>
          <button
            className="shrink-0 rounded-xl bg-emerald-700 px-3 py-2 text-[11px] font-semibold text-white hover:bg-emerald-600"
            onClick={onExportRecorded}
            type="button"
          >
            <i className="fa-solid fa-download" /> 导出 GPX
          </button>
        </div>
      )}

      <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-slate-700/60 bg-slate-800/50 p-4">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-bold text-slate-200">
            <i className="fa-solid fa-map-pin text-amber-400" />
            标注点位
            <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300">
              {workspace.pois.length}
            </span>
          </span>
          <button
            className="rounded-lg bg-emerald-600 px-3 py-2 text-[11px] font-semibold text-white hover:bg-emerald-500"
            onClick={onAddPoi}
            type="button"
          >
            <i className="fa-solid fa-plus" /> 打点
          </button>
        </div>
        {workspace.pois.length === 0 ? (
          <div className="py-4 text-center text-xs text-slate-500">
            暂无标注点位，可在当前位置或地图中心添加。
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {workspace.pois.map((poi) => {
              const meta = POI_META[poi.type] ?? POI_META.marker;
              return (
                <div
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-700/70 bg-slate-900/60 p-3"
                  key={poi.id}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white"
                      style={{ backgroundColor: meta.color }}
                    >
                      <i className={`fa-solid ${meta.icon} text-xs`} />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-slate-200">
                        {poi.name}
                      </div>
                      <div className="truncate text-[10px] text-slate-500">
                        {meta.label}
                        {poi.desc ? ` · ${poi.desc}` : ''}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      className="rounded-lg bg-slate-800 p-2 text-[10px] text-emerald-400 hover:bg-slate-700"
                      onClick={() => onFocusPoi(poi)}
                      title="在地图查看"
                      type="button"
                    >
                      <i className="fa-solid fa-location-arrow" />
                    </button>
                    <button
                      className="rounded-lg bg-slate-800 p-2 text-[10px] text-rose-400 hover:bg-slate-700"
                      onClick={() => setPendingDeletePoi(poi)}
                      title="删除点位"
                      type="button"
                    >
                      <i className="fa-solid fa-trash" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mb-16 flex items-center justify-between gap-3 rounded-2xl border border-slate-700/70 bg-slate-800/70 p-4">
        <div>
          <div className="text-sm font-semibold text-slate-200">离线地图</div>
          <div className="mt-1 text-[10px] text-slate-500">
            进入区域选择，并自动定位到目标路径附近
          </div>
        </div>
        <button
          className="shrink-0 rounded-xl bg-slate-700 px-3 py-2.5 text-xs font-semibold text-emerald-300 hover:bg-slate-600"
          onClick={onOpenOffline}
          type="button"
        >
          <i className="fa-solid fa-download" /> 下载离线地图
        </button>
      </div>

      <ActionModal
        actions={[
          {
            label: '取消',
            className:
              'rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300',
            onClick: () => setPendingDeletePoi(null),
          },
          {
            label: '删除',
            className:
              'rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white',
            onClick: () => {
              onDeletePoi(pendingDeletePoi.id);
              setPendingDeletePoi(null);
              notify('标注点位已删除', 'info');
            },
          },
        ]}
        open={Boolean(pendingDeletePoi)}
        title="删除标注点位"
      >
        <p>确认删除“{pendingDeletePoi?.name}”？</p>
      </ActionModal>
    </section>
  );
}
