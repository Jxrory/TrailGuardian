import L from 'leaflet';
import { tileCache } from './storage.js';

const TILE_SIZE = 256;
const TERRARIUM_URL =
  'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

export const CONTOUR_TERRAIN_SOURCE = {
  id: 'terrain-contours',
  label: '本地等高线',
  baseUrl: TERRARIUM_URL,
  overlayUrls: [],
  maxZoom: 18,
  maxNativeZoom: 15,
  attribution: 'Elevation tiles &copy; Mapzen / AWS Open Data',
};

function terrainTileBlob(url) {
  return tileCache.getTile(url).then(async (cachedBlob) => {
    if (cachedBlob) return cachedBlob;
    const response = await fetch(url, {
      mode: 'cors',
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) throw new Error(`Terrain tile HTTP ${response.status}`);
    const blob = await response.blob();
    tileCache.saveTile(url, blob);
    return blob;
  });
}

async function decodeTerrainTile(blob) {
  if ('createImageBitmap' in window) {
    return createImageBitmap(blob);
  }

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Terrain tile decode failed'));
    };
    image.src = objectUrl;
  });
}

function contourIntervalForZoom(zoom) {
  if (zoom >= 14) return 50;
  if (zoom >= 12) return 100;
  if (zoom >= 10) return 200;
  return 500;
}

function interpolateEdge(x1, y1, v1, x2, y2, v2, level) {
  const difference = v2 - v1;
  const ratio = Math.abs(difference) < 1e-6 ? 0.5 : (level - v1) / difference;
  return {
    x: x1 + (x2 - x1) * ratio,
    y: y1 + (y2 - y1) * ratio,
  };
}

function contourColor(level, isMajor) {
  if (isMajor) return 'rgba(251, 191, 36, 0.96)';
  const altitudeTone = Math.min(1, Math.max(0, level / 3200));
  const green = Math.round(248 - altitudeTone * 48);
  const blue = Math.round(235 - altitudeTone * 70);
  return `rgba(255, ${green}, ${blue}, 0.82)`;
}

function drawLabel(context, candidate, text, zoomScale) {
  if (!candidate) return;
  const angle = Math.atan2(candidate.y2 - candidate.y1, candidate.x2 - candidate.x1);
  const rotation = Math.abs(angle) > Math.PI / 2 ? angle + Math.PI : angle;

  context.save();
  context.translate(candidate.labelX, candidate.labelY);
  context.rotate(rotation);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = `600 ${Math.max(1.7, 10 / zoomScale)}px ui-sans-serif, system-ui, sans-serif`;
  context.lineWidth = Math.max(0.8, 2.8 / zoomScale);
  context.strokeStyle = 'rgba(15, 23, 42, 0.9)';
  context.strokeText(text, 0, 0);
  context.fillStyle = 'rgba(255, 251, 235, 0.98)';
  context.fillText(text, 0, 0);
  context.restore();
}

function drawElevationContours(context, imageData, zoom, currentZoom, forcedInterval) {
  const pixels = imageData.data;
  const height = new Float32Array(TILE_SIZE * TILE_SIZE);
  let minHeight = Infinity;
  let maxHeight = -Infinity;

  for (let index = 0; index < height.length; index += 1) {
    const offset = index * 4;
    const elevation =
      pixels[offset] * 256 + pixels[offset + 1] + pixels[offset + 2] / 256 - 32768;
    height[index] = elevation;
    if (elevation < -50) continue;
    if (elevation < minHeight) minHeight = elevation;
    if (elevation > maxHeight) maxHeight = elevation;
  }

  if (!Number.isFinite(minHeight) || !Number.isFinite(maxHeight)) return;

  let interval = forcedInterval ?? contourIntervalForZoom(zoom);
  while ((maxHeight - minHeight) / interval > 36) interval *= 2;

  const firstLevel = Math.ceil(Math.max(0, minHeight) / interval) * interval;
  const step = zoom >= 14 ? 1 : 2;
  const zoomScale = Math.max(1, 2 ** Math.max(0, currentZoom - zoom));
  const width = Math.max(0.65, 1.3 / zoomScale);
  const relief = maxHeight - minHeight;
  const majorInterval = interval * (relief > 800 ? 5 : 2);
  let tileLabel = null;
  let tileLabelCrossings = 0;

  for (let level = firstLevel; level <= maxHeight; level += interval) {
    const isMajor = level % majorInterval === 0;
    const path = new Path2D();
    let bestCandidate = null;
    let longestSegment = 0;
    let hasContourLine = false;
    let crossingCount = 0;

    for (let y = 0; y < TILE_SIZE - step; y += step) {
      for (let x = 0; x < TILE_SIZE - step; x += step) {
        const index = y * TILE_SIZE + x;
        const topLeft = height[index];
        const topRight = height[index + step];
        const bottomRight = height[index + TILE_SIZE * step + step];
        const bottomLeft = height[index + TILE_SIZE * step];

        const intersections = [];

        if ((topLeft > level) !== (topRight > level)) {
          intersections.push(
            interpolateEdge(x, y, topLeft, x + step, y, topRight, level),
          );
        }
        if ((topRight > level) !== (bottomRight > level)) {
          intersections.push(
            interpolateEdge(
              x + step,
              y,
              topRight,
              x + step,
              y + step,
              bottomRight,
              level,
            ),
          );
        }
        if ((bottomRight > level) !== (bottomLeft > level)) {
          intersections.push(
            interpolateEdge(
              x + step,
              y + step,
              bottomRight,
              x,
              y + step,
              bottomLeft,
              level,
            ),
          );
        }
        if ((bottomLeft > level) !== (topLeft > level)) {
          intersections.push(
            interpolateEdge(x, y + step, bottomLeft, x, y, topLeft, level),
          );
        }

        if (intersections.length === 2) {
          const [start, end] = intersections;
          path.moveTo(start.x, start.y);
          path.lineTo(end.x, end.y);
          hasContourLine = true;
          crossingCount += 1;

          const segmentLength = Math.hypot(end.x - start.x, end.y - start.y);
          if (isMajor && segmentLength > longestSegment) {
            longestSegment = segmentLength;
            bestCandidate = {
              x1: start.x,
              y1: start.y,
              x2: end.x,
              y2: end.y,
              labelX: (start.x + end.x) / 2,
              labelY: (start.y + end.y) / 2,
            };
          }
        } else if (intersections.length === 4) {
          const centerElevation =
            (topLeft + topRight + bottomRight + bottomLeft) / 4;
          const pairs =
            centerElevation > level
              ? [
                  [intersections[0], intersections[1]],
                  [intersections[2], intersections[3]],
                ]
              : [
                  [intersections[0], intersections[3]],
                  [intersections[1], intersections[2]],
                ];

          for (const [start, end] of pairs) {
            path.moveTo(start.x, start.y);
            path.lineTo(end.x, end.y);
            hasContourLine = true;
            crossingCount += 1;
          }
        }
      }
    }

    if (hasContourLine) {
      context.save();
      context.lineWidth = width + Math.max(1, 2 / zoomScale);
      context.strokeStyle = 'rgba(15, 23, 42, 0.62)';
      context.stroke(path);
      context.restore();

      context.save();
      context.lineWidth = isMajor ? width + 0.35 : width;
      context.strokeStyle = contourColor(level, isMajor);
      context.stroke(path);
      context.restore();

      if (isMajor && crossingCount > tileLabelCrossings) {
        tileLabelCrossings = crossingCount;
        tileLabel = { candidate: bestCandidate, level };
      }
    }
  }

  if (tileLabel) {
    drawLabel(context, tileLabel.candidate, `${tileLabel.level}m`, zoomScale);
  }
}

export class ContourTileLayer extends L.TileLayer {
  constructor(options = {}) {
    super(TERRARIUM_URL, {
      tileSize: TILE_SIZE,
      maxZoom: 18,
      maxNativeZoom: 15,
      attribution: CONTOUR_TERRAIN_SOURCE.attribution,
      noWrap: true,
      ...options,
    });
    this.forcedInterval = options.contourInterval;
    this.onTileReady = options.onTileReady;
    this.onTileError = options.onTileError;
  }

  createTile(coords, done) {
    const canvas = document.createElement('canvas');
    canvas.width = TILE_SIZE;
    canvas.height = TILE_SIZE;
    const context = canvas.getContext('2d', { willReadFrequently: true });

    const renderTile = async () => {
      const url = this.getTileUrl(coords);
      const blob = await terrainTileBlob(url);
      const bitmap = await decodeTerrainTile(blob);
      context.clearRect(0, 0, TILE_SIZE, TILE_SIZE);
      context.drawImage(bitmap, 0, 0, TILE_SIZE, TILE_SIZE);
      if (typeof bitmap.close === 'function') bitmap.close();

      const imageData = context.getImageData(0, 0, TILE_SIZE, TILE_SIZE);
      context.clearRect(0, 0, TILE_SIZE, TILE_SIZE);
      const currentZoom = this._map?.getZoom() ?? coords.z;
      drawElevationContours(
        context,
        imageData,
        coords.z,
        currentZoom,
        this.forcedInterval,
      );
      done(null, canvas);
      this.onTileReady?.();
    };

    renderTile().catch((error) => {
      done(error, canvas);
      this.onTileError?.(error);
    });
    return canvas;
  }
}
