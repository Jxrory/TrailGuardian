import { distanceInMeters, formatDuration } from './geo.js';

function workspaceId() {
  return `workspace-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function readLegacyValue(key, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function summarizeTrackPoints(points = []) {
  let distance = 0;
  let elevationGain = 0;
  let lastElevation = null;

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (index > 0) distance += distanceInMeters(points[index - 1], point);

    if (Number.isFinite(point.ele)) {
      if (lastElevation !== null) {
        const delta = point.ele - lastElevation;
        if (Math.abs(delta) >= 3) {
          if (delta > 0) elevationGain += delta;
          lastElevation = point.ele;
        }
      } else {
        lastElevation = point.ele;
      }
    }
  }

  return {
    distanceMeters: distance,
    elevationGain,
  };
}

export function createWorkspace(name = '') {
  const now = Date.now();
  return {
    id: workspaceId(),
    name: name.trim() || `户外计划 ${new Date(now).toLocaleDateString('zh-CN')}`,
    createdAt: now,
    updatedAt: now,
    targetTrack: null,
    recordedTrack: null,
    pois: [],
  };
}

export function createRecordedTrack(points, summary = {}) {
  const computed = summarizeTrackPoints(points);
  const distanceMeters = summary.distanceMeters ?? computed.distanceMeters;
  const elevationGain = summary.elevationGain ?? computed.elevationGain;
  const durationSeconds = summary.durationSeconds ?? 0;

  return {
    id: `recorded-${Date.now()}`,
    name: summary.name || '已走轨迹',
    points,
    distanceMeters,
    elevationGain,
    durationSeconds,
    distance: (distanceMeters / 1000).toFixed(2),
    eleGain: Math.round(elevationGain),
    time: formatDuration(durationSeconds),
    startedAt: summary.startedAt ?? null,
    finishedAt: summary.finishedAt ?? Date.now(),
    createdAt: summary.createdAt ?? Date.now(),
  };
}

export function createTargetTrack(points, name = '') {
  return {
    id: `target-${Date.now()}`,
    name: name || '目标运动路径',
    points,
    pointCount: points.length,
    importedAt: Date.now(),
  };
}

export function getWorkspaceFocusPoints(workspace) {
  if (workspace?.targetTrack?.points?.length) return workspace.targetTrack.points;
  if (workspace?.recordedTrack?.points?.length) {
    return workspace.recordedTrack.points;
  }
  return workspace?.pois ?? [];
}

export function migrateLegacyWorkspaces() {
  const savedTracks = readLegacyValue('trail_saved_tracks', []);
  const legacyPois = readLegacyValue('trail_pois', []);
  if (!Array.isArray(savedTracks) || !Array.isArray(legacyPois)) return [];
  if (!savedTracks.length && !legacyPois.length) return [];

  const workspaces = savedTracks
    .filter((track) => track?.points?.length)
    .map((track, index) => {
      const now = Date.now() - index * 1000;
      return {
        id: `legacy-${track.id ?? now}`,
        name: track.name || `历史轨迹 ${index + 1}`,
        createdAt: track.createdAt ?? now,
        updatedAt: track.createdAt ?? now,
        targetTrack: null,
        recordedTrack: {
          id: track.id ?? `legacy-recorded-${now}`,
          name: track.name || '已走轨迹',
          points: track.points,
          distance:
            track.distance ??
            (summarizeTrackPoints(track.points).distanceMeters / 1000).toFixed(2),
          eleGain:
            track.eleGain ?? Math.round(summarizeTrackPoints(track.points).elevationGain),
          time: track.time ?? '00:00:00',
          distanceMeters: Number(track.distance ?? 0) * 1000,
          elevationGain: Number(track.eleGain ?? 0),
          durationSeconds: 0,
          createdAt: track.createdAt ?? now,
        },
        pois: [],
      };
    });

  if (legacyPois.length) {
    if (workspaces.length) {
      workspaces[0].pois = legacyPois;
    } else {
      workspaces.push({
        ...createWorkspace('导入的路标集合'),
        pois: legacyPois,
      });
    }
  }

  return workspaces;
}

