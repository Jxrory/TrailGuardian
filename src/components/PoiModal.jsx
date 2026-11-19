import { useEffect, useState } from 'react';

const POI_OPTIONS = [
  { value: 'camp', label: '⛺ 露营地' },
  { value: 'water', label: '💧 水源点' },
  { value: 'danger', label: '⚠️ 危险点' },
  { value: 'view', label: '👁️ 观景台' },
];

export function PoiModal({ open, anchor, onClose, onSave }) {
  const [type, setType] = useState('camp');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (!open) return;
    setType('camp');
    setName('');
    setDescription('');
  }, [open]);

  if (!open) return null;

  const submit = (event) => {
    event.preventDefault();
    onSave({
      type,
      name: name.trim() || '未命名点',
      desc: description.trim(),
      lat: anchor.lat,
      lng: anchor.lng,
    });
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <form
        className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
        onSubmit={submit}
      >
        <div>
          <h3 className="text-lg font-bold text-emerald-400">添加路标 / 兴趣点</h3>
          <p className="mt-1 font-mono text-[10px] text-slate-500">
            {anchor.lat.toFixed(5)}, {anchor.lng.toFixed(5)}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            路标类型
            <select
              className="rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-sm text-slate-200 outline-none focus:border-emerald-500"
              onChange={(event) => setType(event.target.value)}
              value={type}
            >
              {POI_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-slate-400">
            路标名称
            <input
              className="rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-sm text-slate-200 outline-none focus:border-emerald-500"
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：1号营地 / 溪流取水点"
              value={name}
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-slate-400">
            备注说明
            <textarea
              className="h-20 resize-none rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-sm text-slate-200 outline-none focus:border-emerald-500"
              onChange={(event) => setDescription(event.target.value)}
              placeholder="路况、水量、营地平整度等说明..."
              value={description}
            />
          </label>
        </div>

        <div className="mt-2 flex justify-end gap-3">
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
            确认添加
          </button>
        </div>
      </form>
    </div>
  );
}
