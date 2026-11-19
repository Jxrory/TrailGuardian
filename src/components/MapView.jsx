import L from 'leaflet';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  useMap,
} from 'react-leaflet';
import {
  CachedTileLayer,
  buildTileUrlsForBounds,
  getMapSource,
} from '../services/mapLayers.js';
import {
  CONTOUR_TERRAIN_SOURCE,
  ContourTileLayer,
} from '../services/contourTileLayer.js';
import { tileCache } from '../services/storage.js';

const DEFAULT_CENTER = [30.245, 120.125];
const MAX_OFFLINE_TILES = 900;

const POI_META = {
  camp: { icon: 'fa-campground', color: '#10b981', label: '营地' },
  water: { icon: 'fa-droplet', color: '#3b82f6', label: '水源' },
  danger: { icon: 'fa-triangle-exclamation', color: '#ef4444', label: '危险' },
  view: { icon: 'fa-mountain-sun', color: '#f59e0b', label: '观景' },
  marker: { icon: 'fa-location-dot', color: '#8b5cf6', label: '标注' },
};

const CONTOUR_STATUS_LABEL = {
  idle: '等高线已关闭',
  loading: '正在生成等高线…',
  ready: '等高线已显示',
  error: '地形数据加载失败，请检查网络',
};

function ManagedTileLayer({
  url,
  subdomains,
  maxZoom,
  maxNativeZoom,
  opacity = 1,
  zIndex = 1,
  className,
  attribution,
  onStatusChange,
}) {
  const map = useMap();
  const layerRef = useRef(null);
  const statusCallbackRef = useRef(onStatusChange);

  useEffect(() => {
    statusCallbackRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    const layer = new CachedTileLayer(
      url,
      {
        subdomains: subdomains ?? 'abc',
        maxZoom,
        maxNativeZoom,
        opacity,
        zIndex,
        className,
        attribution,
        tileSize: 256,
        keepBuffer: 4,
      },
      tileCache,
    );

    let tileErrors = 0;
    const handleLoading = () => {
      tileErrors = 0;
      statusCallbackRef.current?.('loading');
    };
    const handleLoad = () => {
      statusCallbackRef.current?.(tileErrors >= 3 ? 'error' : 'ready');
    };
    const handleTileLoad = () => {
      if (tileErrors < 3) statusCallbackRef.current?.('ready');
    };
    const handleTileError = () => {
      tileErrors += 1;
      if (tileErrors >= 3) statusCallbackRef.current?.('error');
    };

    layer.on('loading', handleLoading);
    layer.on('load', handleLoad);
    layer.on('tileload', handleTileLoad);
    layer.on('tileerror', handleTileError);
    layer.addTo(map);
    layerRef.current = layer;

    return () => {
      layer.off('loading', handleLoading);
      layer.off('load', handleLoad);
      layer.off('tileload', handleTileLoad);
      layer.off('tileerror', handleTileError);
      map.removeLayer(layer);
      layerRef.current = null;
    };
  }, [
    attribution,
    className,
    map,
    maxNativeZoom,
    maxZoom,
    subdomains,
    url,
    zIndex,
  ]);

  useEffect(() => {
    layerRef.current?.setOpacity(opacity);
  }, [opacity]);

  useEffect(() => {
    layerRef.current?.setZIndex(zIndex);
  }, [zIndex]);

  return null;
}

function MapReady({ onReady }) {
  const map = useMap();
  useEffect(() => {
    onReady(map);
  }, [map, onReady]);
  return null;
}

function TerrainContourLayer({ opacity, zIndex = 3, onStatusChange }) {
  const map = useMap();
  const layerRef = useRef(null);
  const statusCallbackRef = useRef(onStatusChange);

  useEffect(() => {
    statusCallbackRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    let successfulTiles = 0;
    let failedTiles = 0;
    const layer = new ContourTileLayer({
      className: 'generated-contour-layer',
      keepBuffer: 4,
      onTileError: () => {
        failedTiles += 1;
        if (failedTiles >= 3 && successfulTiles === 0) {
          statusCallbackRef.current?.('error');
        }
      },
      onTileReady: () => {
        successfulTiles += 1;
        statusCallbackRef.current?.('ready');
      },
      opacity,
      zIndex,
    });
    layer.addTo(map);
    layerRef.current = layer;

    return () => {
      map.removeLayer(layer);
      layerRef.current = null;
    };
  }, [map, zIndex]);

  useEffect(() => {
    layerRef.current?.setOpacity(opacity);
  }, [opacity]);

  return null;
}

function TrackFocusController({ focusTrack, isActive }) {
  const map = useMap();
  const lastFocusKeyRef = useRef(null);

  useEffect(() => {
    if (!isActive) return undefined;

    const timeoutId = window.setTimeout(() => {
      map.invalidateSize();
      if (!focusTrack?.points?.length) return;
      if (lastFocusKeyRef.current === focusTrack.key) return;
      const bounds = L.latLngBounds(
        focusTrack.points.map((point) => [point.lat, point.lng]),
      );
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: 16 });
      lastFocusKeyRef.current = focusTrack.key;
    }, 80);

    return () => window.clearTimeout(timeoutId);
  }, [focusTrack, isActive, map]);

  return null;
}

function createPoiIcon(meta) {
  return L.divIcon({
    className: 'custom-poi-marker',
    html: `<div style="background:${meta.color}" class="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-xs text-white shadow"><i class="fa-solid ${meta.icon}"></i></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
}

export const MapView = forwardRef(function MapView(
  {
    isActive,
    mapSourceId,
    onCycleMapSource,
    contourEnabled,
    onToggleContour,
    contourOpacity,
    onContourOpacityChange,
    targetTrack,
    recordedTrack,
    focusTrack,
    pois,
    currentPosition,
    currentElevation,
    onOpenPoi,
    onLocateRequest,
  },
  ref,
) {
  const [mapInstance, setMapInstance] = useState(null);
  const [contourStatus, setContourStatus] = useState('loading');
  const mapSource = getMapSource(mapSourceId);

  const poiMarkers = useMemo(
    () =>
      pois.map((poi) => {
        const meta = POI_META[poi.type] ?? POI_META.camp;
        return {
          ...poi,
          meta,
          icon: createPoiIcon(meta),
        };
      }),
    [pois],
  );

  const userIcon = useMemo(
    () =>
      L.divIcon({
        className: 'user-position-marker',
        html: '<div class="h-4 w-4 rounded-full border-2 border-white bg-emerald-500 shadow-lg"></div>',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      }),
    [],
  );

  useEffect(() => {
    setContourStatus(contourEnabled ? 'loading' : 'idle');
  }, [contourEnabled]);

  useImperativeHandle(
    ref,
    () => ({
      centerToUser() {
        if (!mapInstance || !currentPosition) return false;
        mapInstance.setView(
          [currentPosition.lat, currentPosition.lng],
          Math.max(mapInstance.getZoom(), 16),
        );
        return true;
      },
      centerToPoint(lat, lng, zoom = 17) {
        mapInstance?.setView([lat, lng], zoom);
      },
      getPoiAnchor() {
        if (currentPosition) {
          return { lat: currentPosition.lat, lng: currentPosition.lng };
        }
        const center = mapInstance?.getCenter();
        return center
          ? { lat: center.lat, lng: center.lng }
          : { lat: DEFAULT_CENTER[0], lng: DEFAULT_CENTER[1] };
      },
      async downloadCurrentArea(onProgress) {
        if (!mapInstance) return { ok: false, message: '地图尚未就绪' };

        const bounds = mapInstance.getBounds();
        const currentZoom = Math.min(
          Math.max(Math.round(mapInstance.getZoom()), 11),
          15,
        );
        const sources = [mapSource];
        if (contourEnabled) {
          sources.push(CONTOUR_TERRAIN_SOURCE);
        }

        const urls = [
          ...new Set(
            sources.flatMap((source) =>
              buildTileUrlsForBounds(
                source,
                bounds,
                currentZoom,
                Math.min(currentZoom + 1, source.maxNativeZoom),
              ),
            ),
          ),
        ];

        if (urls.length > MAX_OFFLINE_TILES) {
          return {
            ok: false,
            message: `当前视野需要 ${urls.length} 张瓦片，请放大地图后再下载`,
          };
        }

        let completed = 0;
        let cached = 0;
        let downloaded = 0;
        let failed = 0;
        let nextIndex = 0;

        const downloadOne = async (url) => {
          const existing = await tileCache.getTile(url);
          if (existing) {
            cached += 1;
            return;
          }

          try {
            const response = await fetch(url, {
              mode: 'cors',
              signal: AbortSignal.timeout(15000),
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            await tileCache.saveTile(url, await response.blob());
            downloaded += 1;
          } catch {
            failed += 1;
          }
        };

        const worker = async () => {
          while (nextIndex < urls.length) {
            const currentIndex = nextIndex;
            nextIndex += 1;
            await downloadOne(urls[currentIndex]);
            completed += 1;
            onProgress?.(Math.round((completed / urls.length) * 100));
          }
        };

        await Promise.all(Array.from({ length: 6 }, worker));

        return {
          ok: true,
          total: urls.length,
          cached,
          downloaded,
          failed,
        };
      },
    }),
    [
      contourEnabled,
      currentPosition,
      mapInstance,
      mapSource,
    ],
  );

  return (
    <div className="relative h-full w-full">
      <MapContainer
        attributionControl
        center={DEFAULT_CENTER}
        maxZoom={19}
        minZoom={3}
        preferCanvas
        scrollWheelZoom
        zoom={14}
        zoomControl={false}
      >
        <MapReady onReady={setMapInstance} />
        <TrackFocusController focusTrack={focusTrack} isActive={isActive} />

        <ManagedTileLayer
          attribution={mapSource.attribution}
          maxNativeZoom={mapSource.maxNativeZoom}
          maxZoom={mapSource.maxZoom}
          subdomains={mapSource.subdomains}
          url={mapSource.baseUrl}
          zIndex={1}
        />

        {mapSource.overlayUrls.map((overlayUrl) => (
          <ManagedTileLayer
            attribution={mapSource.attribution}
            key={overlayUrl}
            maxNativeZoom={mapSource.maxNativeZoom}
            maxZoom={mapSource.maxZoom}
            subdomains={mapSource.subdomains}
            url={overlayUrl}
            zIndex={2}
          />
        ))}

        {contourEnabled && (
          <TerrainContourLayer
            onStatusChange={setContourStatus}
            opacity={contourOpacity}
            zIndex={3}
          />
        )}

        {targetTrack?.points?.length > 1 && (
          <>
            <Polyline
              pathOptions={{
                color: '#38bdf8',
                dashArray: '7 6',
                weight: 3,
                opacity: 0.92,
              }}
              positions={targetTrack.points.map((point) => [
                point.lat,
                point.lng,
              ])}
            />
            <CircleMarker
              center={[targetTrack.points[0].lat, targetTrack.points[0].lng]}
              pathOptions={{
                color: '#38bdf8',
                fillColor: '#38bdf8',
                fillOpacity: 0.9,
              }}
              radius={7}
            />
            <CircleMarker
              center={[
                targetTrack.points.at(-1).lat,
                targetTrack.points.at(-1).lng,
              ]}
              pathOptions={{
                color: '#38bdf8',
                fillColor: '#0f172a',
                fillOpacity: 0.95,
              }}
              radius={7}
            />
          </>
        )}

        {recordedTrack?.points?.length > 1 && (
          <>
            <Polyline
              pathOptions={{ color: '#10b981', weight: 4, opacity: 0.95 }}
              positions={recordedTrack.points.map((point) => [
                point.lat,
                point.lng,
              ])}
            />
            <CircleMarker
              center={[recordedTrack.points[0].lat, recordedTrack.points[0].lng]}
              pathOptions={{
                color: '#10b981',
                fillColor: '#10b981',
                fillOpacity: 0.95,
              }}
              radius={6}
            />
            <CircleMarker
              center={[
                recordedTrack.points.at(-1).lat,
                recordedTrack.points.at(-1).lng,
              ]}
              pathOptions={{
                color: '#10b981',
                fillColor: '#0f172a',
                fillOpacity: 0.95,
              }}
              radius={6}
            />
          </>
        )}

        {poiMarkers.map((poi) => (
          <Marker icon={poi.icon} key={poi.id} position={[poi.lat, poi.lng]}>
            <Popup>
              <div className="min-w-32 text-slate-800">
                <div className="font-bold">{poi.name}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {poi.meta.label}
                  {poi.desc ? ` · ${poi.desc}` : ''}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        {currentPosition && (
          <>
            <Circle
              center={[currentPosition.lat, currentPosition.lng]}
              pathOptions={{
                color: '#10b981',
                fillColor: '#10b981',
                fillOpacity: 0.12,
                weight: 1,
              }}
              radius={Math.min(currentPosition.accuracy || 20, 200)}
            />
            <Marker
              icon={userIcon}
              position={[currentPosition.lat, currentPosition.lng]}
            >
              <Popup>
                <div className="text-xs text-slate-700">
                  精度约 {Math.round(currentPosition.accuracy || 0)} m
                  {currentElevation !== null && ` · 海拔 ${currentElevation} m`}
                </div>
              </Popup>
            </Marker>
          </>
        )}
      </MapContainer>

      <div className="absolute left-3 top-3 z-20 flex w-52 flex-col gap-2 rounded-xl border border-slate-700/90 bg-slate-900/90 p-2.5 shadow-lg backdrop-blur">
        <div className="flex items-center justify-between gap-2 border-b border-slate-700/80 pb-1.5">
          <span className="truncate text-[11px] font-bold text-emerald-400">
            {mapSource.label}
          </span>
          <button
            className="shrink-0 rounded border border-emerald-700/80 bg-emerald-950/90 px-2 py-0.5 text-[10px] text-emerald-300 transition hover:bg-emerald-900"
            onClick={onCycleMapSource}
            type="button"
          >
            切换图源
          </button>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
            <i className="fa-solid fa-mountain text-emerald-400" /> 等高线叠加
          </span>
          <button
            aria-pressed={contourEnabled}
            className={`relative h-5 w-9 shrink-0 rounded-full transition ${
              contourEnabled ? 'bg-emerald-600' : 'bg-slate-700'
            }`}
            onClick={() => onToggleContour(!contourEnabled)}
            type="button"
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${
                contourEnabled ? 'left-[18px]' : 'left-0.5'
              }`}
            />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-400">强度</span>
          <input
            aria-label="等高线叠加强度"
            className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-slate-700 accent-emerald-500"
            disabled={!contourEnabled}
            max="1"
            min="0.1"
            onChange={(event) => onContourOpacityChange(Number(event.target.value))}
            step="0.05"
            type="range"
            value={contourOpacity}
          />
          <span className="w-7 text-right font-mono text-[9px] text-slate-400">
            {Math.round(contourOpacity * 100)}%
          </span>
        </div>

        <div
          className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] ${
            contourStatus === 'ready'
              ? 'bg-emerald-950/60 text-emerald-300'
              : contourStatus === 'error'
                ? 'bg-rose-950/60 text-rose-300'
                : 'bg-slate-800/80 text-slate-400'
          }`}
        >
          <i
            className={`fa-solid ${
              contourStatus === 'loading'
                ? 'fa-spinner animate-spin'
                : contourStatus === 'error'
                  ? 'fa-triangle-exclamation'
                  : 'fa-circle-check'
            }`}
          />
          {CONTOUR_STATUS_LABEL[contourStatus]}
        </div>

        <div className="text-[9px] leading-relaxed text-slate-500">
          AWS Terrain 地形数据 · 本地生成 · 50m 间隔
        </div>
        {contourStatus === 'ready' && (
          <div className="flex items-center gap-2 text-[9px] text-slate-500">
            <span className="h-px w-4 bg-amber-400" /> 整百米
            <span className="h-px w-4 bg-slate-300/80" /> 五十米
          </div>
        )}
        <div className="flex flex-col gap-1.5 border-t border-slate-700/70 pt-2 text-[9px] text-slate-400">
          <span className="flex items-center gap-2">
            <span
              className="h-0.5 w-5 border-t-2 border-dashed"
              style={{ borderColor: '#38bdf8' }}
            />
            目标运动路径
          </span>
          <span className="flex items-center gap-2">
            <span className="h-0.5 w-5 bg-emerald-500" /> 已走路径
          </span>
        </div>
      </div>

      <div className="absolute right-3 top-3 z-20 flex flex-col gap-2">
        <button
          className="rounded-xl border border-slate-700 bg-slate-900/90 p-3 text-emerald-400 shadow-lg backdrop-blur transition active:scale-95"
          onClick={onCycleMapSource}
          title="切换图源"
          type="button"
        >
          <i className="fa-solid fa-layer-group text-lg" />
        </button>
        <button
          className="rounded-xl border border-slate-700 bg-slate-900/90 p-3 text-emerald-400 shadow-lg backdrop-blur transition active:scale-95"
          onClick={() => {
            if (mapInstance && currentPosition) {
              mapInstance.setView(
                [currentPosition.lat, currentPosition.lng],
                Math.max(mapInstance.getZoom(), 16),
              );
            } else {
              onLocateRequest?.();
            }
          }}
          title="定位当前"
          type="button"
        >
          <i className="fa-solid fa-crosshairs text-lg" />
        </button>
        <button
          className="rounded-xl border border-slate-700 bg-slate-900/90 p-3 text-amber-400 shadow-lg backdrop-blur transition active:scale-95"
          onClick={() => onOpenPoi?.()}
          title="打点营地/水源"
          type="button"
        >
          <i className="fa-solid fa-map-pin text-lg" />
        </button>
      </div>

      {currentElevation !== null && (
        <div className="absolute bottom-14 right-3 z-20 rounded-lg border border-slate-700/80 bg-slate-900/85 px-2.5 py-1 text-[10px] text-slate-300 backdrop-blur">
          海拔 <span className="font-mono text-emerald-400">{currentElevation} m</span>
        </div>
      )}
    </div>
  );
});
