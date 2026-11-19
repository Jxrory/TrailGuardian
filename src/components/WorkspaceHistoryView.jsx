import { useState } from 'react';
import { ActionModal } from './ActionModal.jsx';
import { useNotifications } from '../hooks/useNotifications.jsx';
import { formatTrackDate } from '../services/geo.js';

export function WorkspaceHistoryView({
  activeWorkspaceId,
  isRecording,
  onDelete,
  onExport,
  onLoad,
  onCreate,
  onViewDetails,
  workspaces,
}) {
  const [pendingDelete, setPendingDelete] = useState(null);
  const { notify } = useNotifications();

  if (workspaces.length === 0) {
    return (
      <section className="absolute inset-0 flex flex-col items-center justify-center overflow-y-auto bg-slate-900 p-6 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-700 bg-slate-800 text-2xl text-slate-500">
          <i className="fa-solid fa-box-open" />
        </div>
        <h2 className="text-xl font-bold text-slate-200">空空如也</h2>
        <p className="mt-2 max-w-xs text-xs leading-relaxed text-slate-500">
          每次外出计划都可以建立一个轨迹工作空间，目标路径、已走轨迹和标注点位会一起保存。
        </p>
        <button
          className="mt-6 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white shadow hover:bg-emerald-500"
          onClick={onCreate}
          type="button"
        >
          <i className="fa-solid fa-plus" /> 新建轨迹
        </button>
      </section>
    );
  }

  return (
    <section className="absolute inset-0 flex flex-col overflow-y-auto bg-slate-900 p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-emerald-500/80">
            工作空间管理
          </div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-emerald-400">
            <i className="fa-solid fa-clock-rotate-left" /> 历史轨迹
          </h2>
        </div>
        <button
          className="rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-bold text-white shadow hover:bg-emerald-500"
          onClick={onCreate}
          type="button"
        >
          <i className="fa-solid fa-plus" /> 新建轨迹
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-3 pb-16">
        {workspaces.map((workspace) => {
          const isActive = workspace.id === activeWorkspaceId;
          const recorded = workspace.recordedTrack;
          const target = workspace.targetTrack;

          return (
            <div
              className={`rounded-2xl border p-4 ${
                isActive
                  ? 'border-emerald-700 bg-emerald-950/25'
                  : 'border-slate-700/80 bg-slate-800/80'
              }`}
              key={workspace.id}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="truncate text-sm font-bold text-slate-100">
                      {workspace.name}
                    </div>
                    {isActive && (
                      <span className="shrink-0 rounded-full bg-emerald-900/80 px-2 py-0.5 text-[9px] font-semibold text-emerald-300">
                        已加载
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-[10px] text-slate-500">
                    {formatTrackDate(workspace.createdAt)}
                    {workspace.updatedAt !== workspace.createdAt &&
                      ` · 更新 ${formatTrackDate(workspace.updatedAt)}`}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1.5 text-[10px]">
                  <span
                    className={`rounded-full px-2 py-1 ${
                      target
                        ? 'bg-sky-950 text-sky-300'
                        : 'bg-slate-900 text-slate-500'
                    }`}
                  >
                    目标 {target?.points?.length ?? 0}
                  </span>
                  <span
                    className={`rounded-full px-2 py-1 ${
                      recorded
                        ? 'bg-emerald-950 text-emerald-300'
                        : 'bg-slate-900 text-slate-500'
                    }`}
                  >
                    已走 {recorded?.points?.length ?? 0}
                  </span>
                  <span className="rounded-full bg-slate-900 px-2 py-1 text-amber-300">
                    点位 {workspace.pois.length}
                  </span>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
                {target && (
                  <span className="truncate">
                    <i className="fa-solid fa-flag text-sky-400" /> {target.name}
                  </span>
                )}
                {recorded ? (
                  <>
                    <span>
                      <i className="fa-solid fa-road text-emerald-400" />{' '}
                      {recorded.distance} km
                    </span>
                    <span>
                      <i className="fa-solid fa-arrow-trend-up text-amber-400" /> +
                      {recorded.eleGain}m
                    </span>
                    <span>
                      <i className="fa-solid fa-clock text-slate-500" /> {recorded.time}
                    </span>
                  </>
                ) : (
                  <span className="text-slate-500">尚未记录已走轨迹</span>
                )}
              </div>

              <div className="mt-3 grid grid-cols-4 gap-1.5 border-t border-slate-700/60 pt-3">
                <button
                  className="rounded-lg bg-slate-900/70 px-1 py-2 text-[10px] font-semibold text-emerald-400 hover:bg-slate-700"
                  onClick={() => onLoad(workspace)}
                  type="button"
                >
                  <i className="fa-solid fa-folder-open" /> 加载
                </button>
                <button
                  className="rounded-lg bg-slate-900/70 px-1 py-2 text-[10px] font-semibold text-slate-300 hover:bg-slate-700"
                  onClick={() => onViewDetails(workspace)}
                  type="button"
                >
                  <i className="fa-solid fa-eye" /> 详情
                </button>
                <button
                  className="rounded-lg bg-slate-900/70 px-1 py-2 text-[10px] font-semibold text-sky-300 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={!recorded?.points?.length}
                  onClick={() => onExport(workspace)}
                  type="button"
                >
                  <i className="fa-solid fa-download" /> 导出
                </button>
                <button
                  className="rounded-lg bg-slate-900/70 px-1 py-2 text-[10px] font-semibold text-rose-400 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={isActive && isRecording}
                  onClick={() => setPendingDelete(workspace)}
                  type="button"
                >
                  <i className="fa-solid fa-trash" /> 删除
                </button>
              </div>
            </div>
          );
        })}
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
              onDelete(pendingDelete.id);
              setPendingDelete(null);
              notify('工作空间已删除', 'info');
            },
          },
        ]}
        open={Boolean(pendingDelete)}
        title="删除工作空间"
      >
        <p>
          确认删除“{pendingDelete?.name}”？目标路径、已走轨迹和标注点位将一起删除，且不可撤销。
        </p>
      </ActionModal>
    </section>
  );
}
