import { formatTrackDate } from './geo.js';

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

  return Array.from(document.getElementsByTagName('trkpt')).map((node) => {
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
  });
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

  return points;
}

export function createGpx(trackName, points) {
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
<gpx version="1.1" creator="TrailGuardian">
  <metadata><name>${escapeXml(trackName)}</name></metadata>
  <trk>
    <name>${escapeXml(trackName)}</name>
    <trkseg>
${trackPoints}
    </trkseg>
  </trk>
</gpx>`;
}

export function downloadGpx(filename, points) {
  const name = filename || `trail_${formatTrackDate()}`;
  const gpx = createGpx(name, points);
  const blob = new Blob([gpx], { type: 'application/gpx+xml;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = name.endsWith('.gpx') ? name : `${name}.gpx`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
