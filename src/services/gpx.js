import { formatTrackDate } from './geo.js';

const POI_TYPE_KEYWORDS = {
  camp: [
    'camp',
    'campground',
    'campsite',
    'camping',
    'tent',
    'shelter',
    'hut',
    'bivouac',
    'lodge',
    '营地',
    '露营',
    '帐篷',
    '庇护',
  ],
  water: [
    'water',
    'drinking',
    'spring',
    'stream',
    'river',
    'well',
    'fountain',
    'tap',
    '水源',
    '取水',
    '溪',
    '泉',
    '河',
  ],
  danger: [
    'danger',
    'hazard',
    'warning',
    'risk',
    'rockfall',
    'cliff',
    'avalanche',
    'danger area',
    '危险',
    '警告',
    '悬崖',
    '落石',
    '雪崩',
  ],
  view: [
    'view',
    'viewpoint',
    'scenic',
    'scenery',
    'overlook',
    'peak',
    'summit',
    'mountain',
    '观景',
    '风景',
    '山顶',
    '山峰',
  ],
};

const GPX_POI_TYPES = {
  camp: { sym: 'Campground', type: 'camp' },
  water: { sym: 'Drinking Water', type: 'water' },
  danger: { sym: 'Danger Area', type: 'danger' },
  view: { sym: 'Scenic Area', type: 'view' },
  marker: { sym: 'Waypoint', type: 'marker' },
};

function nodeText(node, tagName) {
  return node.getElementsByTagName(tagName)[0]?.textContent?.trim() ?? '';
}

function parseNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseTime(value) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isValidCoordinate(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng);
}

function inferPoiType(text) {
  const haystack = String(text ?? '').toLowerCase();
  for (const [type, keywords] of Object.entries(POI_TYPE_KEYWORDS)) {
    if (keywords.some((keyword) => haystack.includes(keyword))) return type;
  }
  return 'marker';
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function parseTrackFile(text, filename = '') {
  const isKml = filename.toLowerCase().endsWith('.kml');
  if (isKml) return parseKml(text);
  return parseGpx(text);
}

function parseGpx(text) {
  const document = new DOMParser().parseFromString(text, 'text/xml');
  if (document.querySelector('parsererror')) {
    throw new Error('GPX 文件格式不正确');
  }

  const points = Array.from(document.getElementsByTagName('trkpt'))
    .map((node) => {
      const lat = Number(node.getAttribute('lat'));
      const lng = Number(node.getAttribute('lon'));
      const elevationNode = node.getElementsByTagName('ele')[0];
      const timeNode = node.getElementsByTagName('time')[0];

      return {
        lat,
        lng,
        ele: elevationNode ? Number(elevationNode.textContent) : null,
        time: timeNode ? new Date(timeNode.textContent).getTime() : null,
      };
    })
    .filter((point) => isValidCoordinate(point.lat, point.lng));

  const waypoints = Array.from(document.getElementsByTagName('wpt'))
    .map((node, index) => {
      const lat = Number(node.getAttribute('lat'));
      const lng = Number(node.getAttribute('lon'));
      if (!isValidCoordinate(lat, lng)) return null;

      const name = nodeText(node, 'name');
      const comment = nodeText(node, 'cmt');
      const description = nodeText(node, 'desc');
      const sym = nodeText(node, 'sym');
      const gpxType = nodeText(node, 'type');
      const type = inferPoiType(
        [name, comment, description, sym, gpxType].join(' '),
      );

      return {
        lat,
        lng,
        ele: parseNumber(nodeText(node, 'ele')),
        time: parseTime(nodeText(node, 'time')),
        type,
        name: name || comment || description || `GPX 标注点 #${index + 1}`,
        desc: description || comment,
        sym,
        gpxType,
        source: 'gpx',
      };
    })
    .filter(Boolean);

  return { points, waypoints };
}

function parseKml(text) {
  const document = new DOMParser().parseFromString(text, 'text/xml');
  if (document.querySelector('parsererror')) {
    throw new Error('KML 文件格式不正确');
  }

  const coordinateNodes = Array.from(
    document.getElementsByTagName('coordinates'),
  );
  const points = [];

  for (const node of coordinateNodes) {
    const tuples = (node.textContent ?? '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    for (const tuple of tuples) {
      const [lng, lat, ele] = tuple.split(',').map(Number);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        points.push({
          lat,
          lng,
          ele: Number.isFinite(ele) ? ele : null,
          time: null,
        });
      }
    }
  }

  return { points, waypoints: [] };
}

function createWaypoint(waypoint) {
  const meta = GPX_POI_TYPES[waypoint.type] ?? GPX_POI_TYPES.marker;
  const elevation = Number.isFinite(waypoint.ele)
    ? `<ele>${waypoint.ele}</ele>`
    : '';
  const time = Number.isFinite(waypoint.time)
    ? `<time>${new Date(waypoint.time).toISOString()}</time>`
    : '';
  const description = waypoint.desc
    ? `<desc>${escapeXml(waypoint.desc)}</desc>`
    : '';
  const sym = escapeXml(waypoint.sym || meta.sym);
  const gpxType = escapeXml(waypoint.gpxType || meta.type);

  return `  <wpt lat="${waypoint.lat}" lon="${waypoint.lng}">${elevation}${time}<name>${escapeXml(
    waypoint.name || '未命名标注点',
  )}</name>${description}<sym>${sym}</sym><type>${gpxType}</type></wpt>`;
}

export function createGpx(trackName, points, waypoints = []) {
  const validWaypoints = waypoints.filter((waypoint) =>
    isValidCoordinate(waypoint.lat, waypoint.lng),
  );
  const waypointBlock = validWaypoints.length
    ? `\n${validWaypoints.map(createWaypoint).join('\n')}`
    : '';
  const trackPoints = points
    .map((point) => {
      const elevation =
        point.ele === null || point.ele === undefined ? '' : `<ele>${point.ele}</ele>`;
      const time = point.time
        ? `<time>${new Date(point.time).toISOString()}</time>`
        : '';
      return `      <trkpt lat="${point.lat}" lon="${point.lng}">${elevation}${time}</trkpt>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="TrailGuardian" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${escapeXml(trackName)}</name></metadata>
${waypointBlock}
  <trk>
    <name>${escapeXml(trackName)}</name>
    <trkseg>
${trackPoints}
    </trkseg>
  </trk>
</gpx>`;
}

export function downloadGpx(filename, points, waypoints = []) {
  const name = filename || `trail_${formatTrackDate()}`;
  const gpx = createGpx(name, points, waypoints);
  const blob = new Blob([gpx], { type: 'application/gpx+xml;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = name.endsWith('.gpx') ? name : `${name}.gpx`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
