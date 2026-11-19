import L from 'leaflet';

export const BASE_MAP_SOURCES = [
  {
    id: 'esri-satellite',
    label: 'Esri 卫星',
    shortLabel: 'Esri 卫星',
    baseUrl:
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    overlayUrls: [
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    ],
    maxZoom: 19,
    maxNativeZoom: 19,
    attribution: 'Tiles &copy; Esri',
  },
];

export function getMapSource(id) {
  return BASE_MAP_SOURCES.find((source) => source.id === id) ?? BASE_MAP_SOURCES[0];
}

function expandTileUrl(template, z, x, y, subdomains = []) {
  const subdomain = subdomains.length
    ? subdomains[Math.abs(x + y) % subdomains.length]
    : '';

  return template
    .replaceAll('{s}', subdomain)
    .replaceAll('{z}', String(z))
    .replaceAll('{x}', String(x))
    .replaceAll('{y}', String(y));
}

export class CachedTileLayer extends L.TileLayer {
  constructor(urlTemplate, options = {}, tileCache) {
    super(urlTemplate, options);
    this.tileCache = tileCache;
    this.on('tileunload', (event) => {
      if (event.tile?._trailObjectUrl) {
        URL.revokeObjectURL(event.tile._trailObjectUrl);
        event.tile._trailObjectUrl = null;
      }
    });
  }

  createTile(coords, done) {
    const tile = document.createElement('img');
    tile.setAttribute('role', 'presentation');
    tile.alt = '';

    const url = this.getTileUrl(coords);
    const markTileLoaded = () => done(null, tile);
    const markTileFailed = () => done(new Error(`Tile failed: ${url}`), tile);

    tile.addEventListener('load', markTileLoaded, { once: true });
    tile.addEventListener('error', markTileFailed, { once: true });

    if (!this.tileCache) {
      tile.src = url;
      return tile;
    }

    this.tileCache
      .getTile(url)
      .then((cachedBlob) => {
        if (cachedBlob) {
          const objectUrl = URL.createObjectURL(cachedBlob);
          tile._trailObjectUrl = objectUrl;
          tile.src = objectUrl;
          return;
        }

        tile.src = url;
        fetch(url, { mode: 'cors' })
          .then((response) => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.blob();
          })
          .then((blob) => this.tileCache.saveTile(url, blob))
          .catch(() => {});
      })
      .catch(() => {
        tile.src = url;
      });

    return tile;
  }
}

export function buildTileUrlsForBounds(source, bounds, minZoom, maxZoom) {
  const urls = [];
  const templates = [source.baseUrl, ...(source.overlayUrls ?? [])];

  for (let z = minZoom; z <= maxZoom; z += 1) {
    const tileBounds = tileRangeForBounds(bounds, z);
    for (let x = tileBounds.minX; x <= tileBounds.maxX; x += 1) {
      for (let y = tileBounds.minY; y <= tileBounds.maxY; y += 1) {
        for (const template of templates) {
          urls.push(expandTileUrl(template, z, x, y, source.subdomains));
        }
      }
    }
  }

  return urls;
}

export function tileRangeForBounds(bounds, zoom) {
  const size = 2 ** zoom;
  const northWest = latLngToTile(bounds.getNorth(), bounds.getWest(), zoom);
  const southEast = latLngToTile(bounds.getSouth(), bounds.getEast(), zoom);

  return {
    minX: Math.min(northWest.x, southEast.x),
    maxX: Math.max(northWest.x, southEast.x),
    minY: Math.min(northWest.y, southEast.y),
    maxY: Math.max(northWest.y, southEast.y),
  };
}

export function latLngToTile(lat, lng, zoom) {
  const size = 2 ** zoom;
  const x = Math.floor(((lng + 180) / 360) * size);
  const y = Math.floor(
    ((1 -
      Math.log(
        Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180),
      ) /
        Math.PI) /
      2) *
      size,
  );

  return { x, y };
}
