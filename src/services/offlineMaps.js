import L from 'leaflet';
import { CONTOUR_TERRAIN_SOURCE } from './contourTileLayer.js';
import { buildTileUrlsForBounds } from './mapLayers.js';
import { tileCache } from './storage.js';

export const OFFLINE_ZOOM_LEVELS = Array.from({ length: 18 }, (_, index) => index + 1);
export const DEFAULT_OFFLINE_ZOOMS = OFFLINE_ZOOM_LEVELS.filter((zoom) => zoom <= 17);
export const MAX_OFFLINE_TILES = 6000;
export const APPROX_TILE_BYTES = 24 * 1024;

export function boundsFromPoints(points) {
  if (!points?.length) return null;
  const latitudes = points.map((point) => point.lat);
  const longitudes = points.map((point) => point.lng);
  return {
    north: Math.max(...latitudes),
    south: Math.min(...latitudes),
    east: Math.max(...longitudes),
    west: Math.min(...longitudes),
  };
}

export function boundsToLeaflet(bounds) {
  return L.latLngBounds(
    [bounds.south, bounds.west],
    [bounds.north, bounds.east],
  );
}

export function buildOfflineUrls({
  bounds,
  zooms,
  source,
  includeContour = false,
}) {
  if (!bounds || !zooms?.length || !source) return [];

  const leafletBounds = boundsToLeaflet(bounds);
  const selectedMinZoom = Math.min(...zooms);
  const selectedMaxZoom = Math.max(...zooms);
  const sources = includeContour ? [source, CONTOUR_TERRAIN_SOURCE] : [source];
  const urls = [];

  for (const mapSource of sources) {
    const minZoom = Math.max(selectedMinZoom, 1);
    const maxZoom = Math.min(selectedMaxZoom, mapSource.maxNativeZoom ?? 18);
    if (minZoom > maxZoom) continue;
    urls.push(
      ...buildTileUrlsForBounds(mapSource, leafletBounds, minZoom, maxZoom),
    );
  }

  return [...new Set(urls)];
}

export function createOfflinePlan(options) {
  const urls = buildOfflineUrls(options);
  return {
    urls,
    tileCount: urls.length,
    estimatedBytes: urls.length * APPROX_TILE_BYTES,
  };
}

export function formatBytes(bytes = 0) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const megabytes = bytes / (1024 * 1024);
  if (megabytes < 1) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${megabytes.toFixed(megabytes >= 10 ? 1 : 2)} MB`;
}

export async function downloadOfflineTiles(urls, onProgress) {
  let completed = 0;
  let downloaded = 0;
  let cached = 0;
  let failed = 0;
  let bytes = 0;
  let nextIndex = 0;

  const downloadOne = async (url) => {
    const existing = await tileCache.getTile(url);
    if (existing) {
      cached += 1;
      bytes += existing.size ?? APPROX_TILE_BYTES;
      return;
    }

    try {
      const response = await fetch(url, {
        mode: 'cors',
        signal: AbortSignal.timeout(18000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      await tileCache.saveTile(url, blob);
      bytes += blob.size ?? APPROX_TILE_BYTES;
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
      onProgress?.({
        completed,
        downloaded,
        cached,
        failed,
        bytes,
        progress: urls.length ? Math.round((completed / urls.length) * 100) : 100,
      });
    }
  };

  await Promise.all(Array.from({ length: 6 }, worker));

  return {
    total: urls.length,
    downloaded,
    cached,
    failed,
    bytes,
  };
}

