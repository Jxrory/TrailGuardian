const NAV_ITEMS = [
  { id: 'map', icon: 'fa-map', label: '地图' },
  { id: 'track', icon: 'fa-route', label: '轨迹' },
  { id: 'pois', icon: 'fa-location-dot', label: '路标' },
  { id: 'settings', icon: 'fa-shield-halved', label: '保活/离线' },
];

export function BottomNav({ activeTab, onChange }) {
  return (
    <nav className="z-30 flex h-16 shrink-0 items-center justify-around border-t border-slate-800 bg-slate-900 px-2">
      {NAV_ITEMS.map((item) => (
        <button
          className={`flex flex-1 flex-col items-center gap-1 py-1 transition ${
            activeTab === item.id ? 'text-emerald-400' : 'text-slate-400'
          }`}
          key={item.id}
          onClick={() => onChange(item.id)}
          type="button"
        >
          <i className={`fa-solid ${item.icon} text-lg`} />
          <span className="text-[10px] font-medium">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
