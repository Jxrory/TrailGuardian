import { useState } from 'react';
import { ActionModal } from './ActionModal.jsx';
import { useNotifications } from '../hooks/useNotifications.jsx';

const POI_META = {
  camp: { icon: 'fa-campground', color: '#10b981', label: '营地' },
  water: { icon: 'fa-droplet', color: '#3b82f6', label: '水源' },
  danger: { icon: 'fa-triangle-exclamation', color: '#ef4444', label: '危险' },
  view: { icon: 'fa-mountain-sun', color: '#f59e0b', label: '观景' },
};

const FILTERS = [
  { id: 'all', label: '全部' },
  { id: 'camp', label: '⛺ 营地' },
  { id: 'water', label: '💧 水源' },
  { id: 'danger', label: '⚠️ 危险点' },
  { id: 'view', label: '👁️ 观景台' },
];

export function PoiView({ pois, onAdd, onFocus, onDelete }) {
  const [filter, setFilter] = useState('all');
  const [pendingDelete, setPendingDelete] = useState(null);
  const { notify } = useNotifications();
  const filteredPois = filter === 'all' ? pois : pois.filter((poi) => poi.type === filter);

  return (
    <section className="absolute inset-0 flex flex-col overflow-y-auto bg-slate-900 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-xl font-bold text-emerald-400">
          <i className="fa-solid fa-location-dot" /> 路标与兴趣点
        </h2>
        <button
          className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow"
          onClick={onAdd}
          type="button"
        >
          <i className="fa-solid fa-plus" /> 添加打点
        </button>
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((item) => (
          <button
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium ${
              filter === item.id
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-800 text-slate-300'
            }`}
            key={item.id}
            onClick={() => setFilter(item.id)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex flex-1 flex-col gap-3 pb-16">
        {filteredPois.length === 0 ? (
          <div className="py-6 text-center text-sm text-slate-500">
            暂无路标，点击右上角添加营地、水源或危险点。
          </div>
        ) : (
          filteredPois.map((poi) => {
            const meta = POI_META[poi.type] ?? POI_META.camp;
            return (
              <div
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-700/80 bg-slate-800 p-3.5"
                key={poi.id}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow"
                    style={{ backgroundColor: meta.color }}
                  >
                    <i className={`fa-solid ${meta.icon}`} />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-200">
                      {poi.name}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-slate-400">
                      {meta.label} · {poi.desc || '无说明'}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    className="rounded-lg bg-slate-700 p-2.5 text-xs text-emerald-400"
                    onClick={() => onFocus(poi)}
                    title="在地图中查看"
                    type="button"
                  >
                    <i className="fa-solid fa-location-arrow" />
                  </button>
                  <button
                    className="rounded-lg bg-slate-700 p-2.5 text-xs text-rose-400"
                    onClick={() => setPendingDelete(poi)}
                    title="删除路标"
                    type="button"
                  >
                    <i className="fa-solid fa-trash" />
                  </button>
                </div>
              </div>
            );
          })
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
              onDelete(pendingDelete.id);
              setPendingDelete(null);
              notify('路标已删除', 'info');
            },
          },
        ]}
        open={Boolean(pendingDelete)}
        title="删除路标"
      >
        <p>确认删除“{pendingDelete?.name}”？</p>
      </ActionModal>
    </section>
  );
}
