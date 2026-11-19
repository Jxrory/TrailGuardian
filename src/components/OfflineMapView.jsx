import L from 'leaflet';
import { useEffect, useMemo, useState } from 'react';
import {
  MapContainer,
  Marker,
  Polygon,
  Polyline,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import { ActionModal } from './ActionModal.jsx';
import { useNotifications } from '../hooks/useNotifications.jsx';
import { getMapSource } from '../services/mapLayers.js';
import {
  APPROX_TILE_BYTES,
  DEFAULT_OFFLINE_ZOOMS,
  MAX_OFFLINE_TILES,
  OFFLINE_ZOOM_LEVELS,
  boundsFromPoints,
  createOfflinePlan,
  formatBytes,
} from '../services/offlineMaps.js';

const DEFAULT_CENTER = [30.245, 120.125];

function selectionMarkerIcon(index) {
  return L.divIcon({
    className: 'custom-poi-marker',
    html: `<div class="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-rose-600 text-[10px] font-bold text-white shadow">${index + 1}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function SelectionClicks({ onPick }) {
  useMapEvents({
    click(event) {
      onPick(event.latlng);
    },
  });
  return null;
}

function SelectionFocus({ focusKey, points }) {
  const map = useMap();

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      map.invalidateSize();
      if (!points?.length) return;
      if (points.length > 1) {
        const bounds = L.latLngBounds(
          points.map((point) => [point.lat, point.lng]),
        );
        map.fitBounds(bounds, { padding: [42, 42], maxZoom: 14 });
      } else {
        map.setView([points[0].lat, points[0].lng], 14);
      }
    }, 80);

    return () => window.clearTimeout(timeoutId);
  }, [focusKey, map, points]);

  return null;
}

function OfflineMapLayer({ source }) {
  return (
    <>
      <TileLayer
        attribution={source.attribution}
        maxNativeZoom={source.maxNativeZoom}
        maxZoom={source.maxZoom}
        subdomains={source.subdomains ?? 'abc'}
        url={source.baseUrl}
      />
      {source.overlayUrls.map((overlayUrl) => (
        <TileLayer
          attribution={source.attribution}
          key={overlayUrl}
          maxNativeZoom={source.maxNativeZoom}
          maxZoom={source.maxZoom}
          subdomains={source.subdomains ?? 'abc'}
          url={overlayUrl}
        />
      ))}
    </>
  );
}

function offlineStatusLabel(region) {
  if (region.status === 'downloading') {
    return `${region.progress ?? 0}%`;
  }
  if (region.status === 'error') return '部分失败';
  return '已下载';
}

export function OfflineMapView({
  focusRequest,
  mapSourceId,
  offlineMaps,
  onAddOfflineMap,
  onBack,
  onClearOfflineMaps,
  onDeleteOfflineMap,
  replaceMapId,
  suggestedName,
  workspaceId,
}) {
  const [mode, setMode] = useState('list');
  const [selection, setSelection] = useState([]);
  const [zoneName, setZoneName] = useState('');
  const [selectedZooms, setSelectedZooms] = useState(DEFAULT_OFFLINE_ZOOMS);
  const [includeContour, setIncludeContour] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [pendingClear, setPendingClear] = useState(false);
  const { notify } = useNotifications();
  const source = getMapSource(mapSourceId);

  useEffect(() => {
    if (!focusRequest?.key) return;
    setSelection(focusRequest.initialSelection ?? []);
    setZoneName(focusRequest.initialName ?? '');
    if (focusRequest.initialZooms?.length) {
      setSelectedZooms(focusRequest.initialZooms);
    } else {
      setSelectedZooms(DEFAULT_OFFLINE_ZOOMS);
    }
    setIncludeContour(Boolean(focusRequest.initialIncludeContour));
    setMode(focusRequest.startPicker ? 'select' : 'list');
  }, [focusRequest?.key, focusRequest?.startPicker]);

  const bounds = useMemo(() => boundsFromPoints(selection), [selection]);
  const plan = useMemo(
    () =>
      createOfflinePlan({
        bounds,
        zooms: selectedZooms,
        source,
        includeContour,
      }),
    [bounds, includeContour, selectedZooms, source],
  );

  const focusPoints = focusRequest?.points;
  const mapCenter = focusPoints?.length
    ? [focusPoints[0].lat, focusPoints[0].lng]
    : DEFAULT_CENTER;

  const openPicker = () => {
    setSelection([]);
    setZoneName('');
    setMode('select');
  };

  const addSelectionPoint = (latlng) => {
    setSelection((current) => [
      ...current,
      { lat: latlng.lat, lng: latlng.lng },
    ]);
  };

  const undoSelection = () => {
    setSelection((current) => current.slice(0, -1));
  };

  const resetSelection = () => {
    setSelection([]);
  };

  const goToSetup = () => {
    if (selection.length < 3) {
      notify('至少选择 3 个点才能确定下载区域', 'error');
      return;
    }
    if (!zoneName.trim()) {
      setZoneName(`${suggestedName || '户外计划'} 离线地图`);
    }
    setMode('setup');
  };

  const toggleZoom = (zoom) => {
    setSelectedZooms((current) => {
      if (current.includes(zoom)) {
        return current.filter((level) => level !== zoom);
      }
      return [...current, zoom].sort((left, right) => left - right);
    });
  };

  const confirmDownload = () => {
    if (!zoneName.trim()) {
      notify('请填写离线地图名称', 'error');
      return;
    }
    if (!selectedZooms.length) {
      notify('请至少选择一个地图层级', 'error');
      return;
    }
    if (!plan.tileCount || plan.tileCount > MAX_OFFLINE_TILES) {
      notify(
        `当前区块需要 ${plan.tileCount} 张瓦片，请减少层级或缩小选区`,
        'error',
      );
      return;
    }

    onAddOfflineMap({
      bounds,
      estimatedBytes: plan.estimatedBytes,
      includeContour,
      name: zoneName.trim(),
      points: selection,
      replaceMapId,
      sourceId: mapSourceId,
      tileCount: plan.tileCount,
      workspaceId,
      zooms: selectedZooms,
    });
    notify('离线地图已加入下载队列', 'info');
    setMode('list');
    setSelection([]);
    setZoneName('');
  };

  if (mode === 'select') {
    return (
      <section className="absolute inset-0 flex flex-col bg-slate-900">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-800 px-3">
          <button
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-slate-300"
            onClick={() => setMode('list')}
            type="button"
          >
            <i className="fa-solid fa-arrow-left" />
          </button>
          <div className="text-sm font-bold text-slate-200">选择下载区域</div>
          <div className="w-9" />
        </header>

        <div className="shrink-0 bg-slate-950 px-4 py-2.5 text-center text-xs text-slate-300">
          点击地图，确定区域（至少选择 3 个点）
        </div>

        <div className="relative min-h-0 flex-1">
          <MapContainer
            center={mapCenter}
            maxZoom={19}
            minZoom={3}
            preferCanvas
            scrollWheelZoom
            zoom={14}
            zoomControl={false}
          >
            <OfflineMapLayer source={source} />
            <SelectionClicks onPick={addSelectionPoint} />
            <SelectionFocus focusKey={focusRequest?.key} points={focusPoints} />
            {focusPoints?.length > 1 && (
              <Polyline
                pathOptions={{
                  color: '#38bdf8',
                  dashArray: '7 6',
                  opacity: 0.9,
                  weight: 3,
                }}
                positions={focusPoints.map((point) => [point.lat, point.lng])}
              />
            )}
            {selection.length >= 2 && (
              <Polygon
                pathOptions={{
                  color: '#ef4444',
                  dashArray: '7 5',
                  fillColor: '#ef4444',
                  fillOpacity: 0.16,
                  weight: 3,
                }}
                positions={selection.map((point) => [point.lat, point.lng])}
              />
            )}
            {selection.map((point, index) => (
              <Marker
                icon={selectionMarkerIcon(index)}
                key={`${point.lat}-${point.lng}-${index}`}
                position={[point.lat, point.lng]}
              />
            ))}
          </MapContainer>
          <div className="pointer-events-none absolute left-3 top-3 rounded-lg border border-slate-700/80 bg-slate-900/85 px-2.5 py-1.5 text-[10px] text-slate-300 backdrop-blur">
            已选 <span className="font-mono text-rose-400">{selection.length}</span> 个点
          </div>
        </div>

        <div className="grid h-14 shrink-0 grid-cols-3 items-center border-t border-slate-800 bg-slate-900">
          <button
            className="h-full text-xs font-semibold text-slate-300 disabled:opacity-30"
            disabled={!selection.length}
            onClick={undoSelection}
            type="button"
          >
            撤销
          </button>
          <button
            className="h-full text-xs font-bold text-emerald-400 disabled:opacity-30"
            disabled={selection.length < 3}
            onClick={goToSetup}
            type="button"
          >
            下一步
          </button>
          <button
            className="h-full text-xs font-semibold text-slate-300 disabled:opacity-30"
            disabled={!selection.length}
            onClick={resetSelection}
            type="button"
          >
            重置
          </button>
        </div>
      </section>
    );
  }

  if (mode === 'setup') {
    return (
      <section className="absolute inset-0 flex flex-col overflow-y-auto bg-slate-900 p-4">
        <div className="mb-4 flex items-center justify-between">
          <button
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-slate-300"
            onClick={() => setMode('select')}
            type="button"
          >
            <i className="fa-solid fa-arrow-left" />
          </button>
          <h2 className="text-base font-bold text-slate-200">选择地图层级</h2>
          <button
            className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
            disabled={plan.tileCount > MAX_OFFLINE_TILES || !plan.tileCount}
            onClick={confirmDownload}
            type="button"
          >
            确定
          </button>
        </div>

        <div className="mb-3 rounded-2xl border border-slate-700 bg-slate-800/80 p-4">
          <label className="flex flex-col gap-1 text-[11px] text-slate-400">
            名称
            <input
              className="rounded-xl border border-slate-700 bg-slate-900 p-2.5 text-sm text-slate-200 outline-none focus:border-emerald-500"
              onChange={(event) => setZoneName(event.target.value)}
              value={zoneName}
            />
          </label>
          <div className="mt-2 text-[10px] text-slate-500">
            {source.label} · 区域共 {plan.tileCount} 张瓦片 · 约{' '}
            {formatBytes(plan.estimatedBytes)}
          </div>
        </div>

        <div className="mb-3 rounded-2xl border border-slate-700 bg-slate-800/80 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-bold text-slate-200">选择层级</div>
            <div className="text-[10px] text-emerald-400">
              {selectedZooms.length} 级 · {plan.tileCount} 瓦片 ·{' '}
              {formatBytes(plan.estimatedBytes)}
            </div>
          </div>
          <div className="rounded-xl bg-slate-900/70 p-3">
            <div className="mb-3 flex items-center justify-between text-[10px] text-slate-500">
              <span>1</span>
              <span>18</span>
            </div>
            <div className="grid grid-cols-5 gap-x-4 gap-y-3">
              {OFFLINE_ZOOM_LEVELS.map((zoom) => {
                const checked = selectedZooms.includes(zoom);
                return (
                  <button
                    className="flex items-center gap-1.5 text-xs text-slate-200"
                    key={zoom}
                    onClick={() => toggleZoom(zoom)}
                    type="button"
                  >
                    <span
                      className={`flex h-4 w-4 items-center justify-center rounded-full border text-[8px] ${
                        checked
                          ? 'border-green-500 bg-green-500 text-white'
                          : 'border-slate-500 bg-transparent text-transparent'
                      }`}
                    >
                      <i className="fa-solid fa-check" />
                    </span>
                    {zoom}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mb-3 rounded-2xl border border-slate-700 bg-slate-800/80 p-4">
          <div className="text-xs font-semibold text-slate-200">更多</div>
          <button
            className="mt-3 flex w-full items-center justify-between gap-3 rounded-xl bg-slate-900/60 p-3 text-left"
            onClick={() => setIncludeContour(!includeContour)}
            type="button"
          >
            <span>
              <span className="block text-xs text-slate-200">
                同时下载等高线叠加数据
              </span>
              <span className="mt-1 block text-[10px] text-slate-500">
                高程瓦片仅支持 1 - 15 级，体积会增加
              </span>
            </span>
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs ${
                includeContour
                  ? 'border-emerald-500 bg-emerald-600 text-white'
                  : 'border-slate-500 text-transparent'
              }`}
            >
              <i className="fa-solid fa-check" />
            </span>
          </button>
        </div>

        {plan.tileCount > MAX_OFFLINE_TILES && (
          <div className="mb-3 rounded-xl border border-rose-800/70 bg-rose-950/40 p-3 text-[11px] leading-relaxed text-rose-300">
            当前选区包含 {plan.tileCount} 张瓦片，超过单次 {MAX_OFFLINE_TILES}{' '}
            张上限。请缩小选区或减少下载层级。
          </div>
        )}

        <div className="mb-16 text-[10px] leading-relaxed text-slate-500">
          每张瓦片按约 {formatBytes(APPROX_TILE_BYTES)} 估算。离线包下载完成后，断网仍可显示对应区域与层级。
        </div>
      </section>
    );
  }

  return (
    <section className="absolute inset-0 flex flex-col overflow-y-auto bg-slate-900 p-4">
      <div className="mb-4 flex items-center justify-between">
        <button
          className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-slate-300"
          onClick={onBack}
          type="button"
        >
          <i className="fa-solid fa-arrow-left" />
        </button>
        <div className="text-center">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-emerald-500/80">
            独立管理
          </div>
          <h2 className="text-lg font-bold text-emerald-400">离线地图</h2>
        </div>
        <button
          className="rounded-full bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow hover:bg-emerald-500"
          onClick={openPicker}
          type="button"
        >
          添加
        </button>
      </div>

      <div className="mb-4 rounded-2xl border border-slate-700/70 bg-slate-800/60 p-3 text-[11px] leading-relaxed text-slate-400">
        <i className="fa-solid fa-layer-group text-emerald-400" /> 已保存{' '}
        <span className="font-bold text-emerald-300">{offlineMaps.length}</span>{' '}
        个离线区域。地图圈选后可选择 1 - 18 级并独立下载。
      </div>

      {offlineMaps.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center py-12 text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-700 bg-slate-800 text-xl text-slate-500">
            <i className="fa-solid fa-download" />
          </div>
          <div className="text-sm font-semibold text-slate-300">暂无离线地图</div>
          <div className="mt-1 max-w-xs text-[11px] text-slate-500">
            点击“添加”，在地图上圈选需要离线使用的区域。
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 pb-4">
          {offlineMaps.map((region) => {
            const regionSource = getMapSource(region.sourceId);
            const size = formatBytes(region.sizeBytes || region.estimatedBytes);
            return (
              <div
                className="rounded-xl border border-slate-700/80 bg-slate-800 p-3.5"
                key={region.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="truncate text-sm font-semibold text-slate-100">
                        {region.name}
                      </div>
                      {region.status === 'downloading' && (
                        <span className="shrink-0 text-[10px] text-amber-400">
                          ({offlineStatusLabel(region)})
                        </span>
                      )}
                    </div>
                    <div className="mt-1 truncate text-[10px] text-slate-500">
                      下载层级：{region.zooms.join(',')}
                    </div>
                    <div className="mt-1 text-[10px] text-emerald-400">
                      {regionSource.label}
                      {region.includeContour ? ' + 等高线' : ''}，{' '}
                      {region.downloadedTiles ?? 0}/{region.tileCount} 瓦片，{' '}
                      {size}
                    </div>
                  </div>
                  {region.status !== 'downloading' && (
                    <button
                      className="shrink-0 rounded-lg bg-slate-900/80 p-2 text-[10px] text-rose-400 hover:bg-slate-700"
                      onClick={() => setPendingDelete(region)}
                      title="删除离线地图"
                      type="button"
                    >
                      <i className="fa-solid fa-trash" />
                    </button>
                  )}
                </div>
                {region.status === 'downloading' && (
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-700">
                    <div
                      className="h-1.5 rounded-full bg-emerald-500 transition-all duration-200"
                      style={{ width: `${region.progress ?? 0}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {offlineMaps.length > 0 && (
        <button
          className="mb-16 mt-auto rounded-xl border border-rose-900/60 bg-rose-950/30 px-4 py-2.5 text-xs font-semibold text-rose-300 hover:bg-rose-950/50 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={offlineMaps.some((region) => region.status === 'downloading')}
          onClick={() => setPendingClear(true)}
          type="button"
        >
          {offlineMaps.some((region) => region.status === 'downloading')
            ? '下载进行中，完成后可清空'
            : '清空全部离线地图'}
        </button>
      )}

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
            onClick: async () => {
              await onDeleteOfflineMap(pendingDelete);
              setPendingDelete(null);
              notify('离线地图已删除', 'info');
            },
          },
        ]}
        open={Boolean(pendingDelete)}
        title="删除离线地图"
      >
        <p>确认删除“{pendingDelete?.name}”及其已缓存瓦片？</p>
      </ActionModal>

      <ActionModal
        actions={[
          {
            label: '取消',
            className:
              'rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300',
            onClick: () => setPendingClear(false),
          },
          {
            label: '全部清空',
            className:
              'rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white',
            onClick: async () => {
              await onClearOfflineMaps();
              setPendingClear(false);
              notify('全部离线地图已清空', 'info');
            },
          },
        ]}
        open={pendingClear}
        title="清空全部离线地图"
      >
        <p>所有离线地图记录与瓦片缓存都会被删除，此操作不可撤销。</p>
      </ActionModal>
    </section>
  );
}
