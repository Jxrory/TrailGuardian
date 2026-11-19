import { useEffect, useState } from 'react';
import { formatTrackDate } from '../services/geo.js';

function defaultWorkspaceName() {
  return `外出计划 ${formatTrackDate()}`;
}

export function WorkspaceCreateModal({ open, onClose, onCreate }) {
  const [name, setName] = useState(defaultWorkspaceName);

  useEffect(() => {
    if (open) setName(defaultWorkspaceName());
  }, [open]);

  if (!open) return null;

  const submit = (event) => {
    event.preventDefault();
    onCreate(name.trim() || defaultWorkspaceName());
  };

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <form
        className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
        onSubmit={submit}
      >
        <div>
          <h3 className="text-lg font-bold text-emerald-400">新建轨迹空间</h3>
          <p className="mt-1 text-xs text-slate-500">
            目标路径、已走轨迹和标注点位都会保存在这个工作空间中。
          </p>
        </div>
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          工作空间名称
          <input
            autoFocus
            className="rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-sm text-slate-200 outline-none focus:border-emerald-500"
            onChange={(event) => setName(event.target.value)}
            placeholder="例如：周末大尖山徒步"
            value={name}
          />
        </label>
        <div className="mt-1 flex justify-end gap-3">
          <button
            className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-700"
            onClick={onClose}
            type="button"
          >
            取消
          </button>
          <button
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-500"
            type="submit"
          >
            新建
          </button>
        </div>
      </form>
    </div>
  );
}
