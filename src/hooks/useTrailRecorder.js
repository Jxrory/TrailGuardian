import { useCallback, useEffect, useRef, useState } from 'react';
import { distanceInMeters, formatDuration, formatTrackDate } from '../services/geo.js';
import {
  startBackgroundKeepAlive,
  stopBackgroundKeepAlive,
} from '../services/keepAlive.js';
import { sessionStore } from '../services/storage.js';

const SNAPSHOT_DELAY_MS = 700;

export function useTrailRecorder({
  lowPowerEnabled,
  audioKeepAliveEnabled,
  workspaceId,
  notify,
}) {
  const [points, setPoints] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [distanceMeters, setDistanceMeters] = useState(0);
  const [elevationGain, setElevationGain] = useState(0);
  const [currentElevation, setCurrentElevation] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [currentPosition, setCurrentPosition] = useState(null);
  const [gpsState, setGpsState] = useState({
    status: 'waiting',
    accuracy: null,
    lastUpdate: null,
    error: '',
  });
  const [motionState, setMotionState] = useState('STANDBY');
  const [pageHidden, setPageHidden] = useState(document.hidden);

  const pointsRef = useRef([]);
  const isRecordingRef = useRef(false);
  const isPausedRef = useRef(false);
  const lowPowerRef = useRef(lowPowerEnabled);
  const sessionStartRef = useRef(null);
  const accumulatedPausedMsRef = useRef(0);
  const lastPauseStartRef = useRef(null);
  const totalDistanceRef = useRef(0);
  const totalElevationGainRef = useRef(0);
  const lastValidElevationRef = useRef(null);
  const lastSampleTimestampRef = useRef(0);
  const stationaryCountRef = useRef(0);
  const snapshotTimerRef = useRef(null);
  const permissionWarningShownRef = useRef(false);
  const workspaceIdRef = useRef(workspaceId);

  useEffect(() => {
    lowPowerRef.current = lowPowerEnabled;
  }, [lowPowerEnabled]);

  useEffect(() => {
    workspaceIdRef.current = workspaceId;
  }, [workspaceId]);

  const queueSnapshot = useCallback(() => {
    if (!isRecordingRef.current || pointsRef.current.length === 0) return;
    window.clearTimeout(snapshotTimerRef.current);
    snapshotTimerRef.current = window.setTimeout(() => {
      sessionStore.save({
        workspaceId: workspaceIdRef.current,
        sessionStartTime: sessionStartRef.current,
        accumulatedPausedMs: accumulatedPausedMsRef.current,
        totalDistance: totalDistanceRef.current,
        totalElevationGain: totalElevationGainRef.current,
        points: pointsRef.current,
        savedAt: Date.now(),
      });
    }, SNAPSHOT_DELAY_MS);
  }, []);

  const addPoint = useCallback(
    (point, deltaMeters) => {
      totalDistanceRef.current += deltaMeters;
      pointsRef.current = [...pointsRef.current, point];
      setPoints(pointsRef.current);
      setDistanceMeters(totalDistanceRef.current);

      const elevation = point.ele;
      if (elevation !== null && elevation !== undefined) {
        if (lastValidElevationRef.current === null) {
          lastValidElevationRef.current = elevation;
        } else {
          const elevationDelta = elevation - lastValidElevationRef.current;
          if (Math.abs(elevationDelta) >= 3) {
            if (elevationDelta > 0) {
              totalElevationGainRef.current += elevationDelta;
              setElevationGain(totalElevationGainRef.current);
            }
            lastValidElevationRef.current = elevation;
          }
        }
      }

      queueSnapshot();
    },
    [queueSnapshot],
  );

  const handlePosition = useCallback(
    (position) => {
      const now = Date.now();
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const accuracy = position.coords.accuracy;
      const speed = position.coords.speed;
      const elevation =
        position.coords.altitude === null || Number.isNaN(position.coords.altitude)
          ? null
          : Math.round(position.coords.altitude);

      setCurrentPosition({
        lat,
        lng,
        accuracy,
        speed,
        heading: position.coords.heading,
        timestamp: now,
      });
      setCurrentElevation(elevation);
      setGpsState({
        status: 'active',
        accuracy,
        lastUpdate: now,
        error: '',
      });

      if (!isRecordingRef.current || isPausedRef.current) return;
      if (accuracy > 50) return;

      const minIntervalMs = document.hidden
        ? 10000
        : lowPowerRef.current
          ? 3000
          : 1500;
      if (
        now - lastSampleTimestampRef.current < minIntervalMs &&
        pointsRef.current.length > 0
      ) {
        return;
      }

      const newPoint = { lat, lng, ele: elevation, time: now };
      const lastPoint = pointsRef.current.at(-1);

      if (!lastPoint) {
        lastSampleTimestampRef.current = now;
        lastValidElevationRef.current = elevation;
        addPoint(newPoint, 0);
        return;
      }

      const deltaMeters = distanceInMeters(lastPoint, newPoint);
      const consideredStationary =
        deltaMeters < (lowPowerRef.current ? 8 : 4) &&
        (speed === null || speed < 0.4);

      if (consideredStationary) {
        stationaryCountRef.current += 1;
        if (stationaryCountRef.current >= 3) setMotionState('STATIONARY');
        return;
      }

      stationaryCountRef.current = 0;
      setMotionState('MOVING');
      if (deltaMeters > 300 && now - lastPoint.time < 5000) return;

      lastSampleTimestampRef.current = now;
      addPoint(newPoint, deltaMeters);
    },
    [addPoint],
  );

  const handleGpsError = useCallback(
    (error) => {
      const denied = error.code === 1;
      const message = denied
        ? '定位权限被拒绝，请在浏览器设置中允许定位'
        : error.message || '暂时无法获取 GPS 定位';

      setGpsState({
        status: denied ? 'denied' : 'error',
        accuracy: null,
        lastUpdate: Date.now(),
        error: message,
      });

      if (denied && !permissionWarningShownRef.current) {
        permissionWarningShownRef.current = true;
        notify(message, 'error', 5000);
      }
    },
    [notify],
  );

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setGpsState({
        status: 'unsupported',
        accuracy: null,
        lastUpdate: null,
        error: '当前浏览器不支持定位',
      });
      return undefined;
    }

    const watchId = navigator.geolocation.watchPosition(
      handlePosition,
      handleGpsError,
      {
        enableHighAccuracy: true,
        maximumAge: 3000,
        timeout: 10000,
      },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [handleGpsError, handlePosition]);

  useEffect(() => {
    const onVisibilityChange = () => {
      const hidden = document.hidden;
      setPageHidden(hidden);

      if (hidden && isRecordingRef.current && !isPausedRef.current) {
        setMotionState('BACKGROUND');
        queueSnapshot();
      } else if (!hidden && isRecordingRef.current && !isPausedRef.current) {
        setMotionState('MOVING');
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () =>
      document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [queueSnapshot]);

  useEffect(() => {
    if (!isRecording || isPaused) return undefined;

    const updateElapsed = () => {
      if (!sessionStartRef.current) return;
      setElapsedSeconds(
        Math.floor(
          (Date.now() -
            sessionStartRef.current -
            accumulatedPausedMsRef.current) /
            1000,
        ),
      );
    };

    updateElapsed();
    const intervalId = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(intervalId);
  }, [isPaused, isRecording]);

  useEffect(() => {
    if (isRecording && !isPaused) {
      startBackgroundKeepAlive({ audioEnabled: audioKeepAliveEnabled });
    } else {
      stopBackgroundKeepAlive();
    }
  }, [audioKeepAliveEnabled, isPaused, isRecording]);

  useEffect(() => {
    return () => {
      window.clearTimeout(snapshotTimerRef.current);
      stopBackgroundKeepAlive();
    };
  }, []);

  const start = useCallback(() => {
    workspaceIdRef.current = workspaceId;
    pointsRef.current = [];
    totalDistanceRef.current = 0;
    totalElevationGainRef.current = 0;
    lastValidElevationRef.current = currentElevation;
    lastSampleTimestampRef.current = 0;
    lastPauseStartRef.current = null;
    accumulatedPausedMsRef.current = 0;
    stationaryCountRef.current = 0;
    sessionStartRef.current = Date.now();

    setPoints([]);
    setDistanceMeters(0);
    setElevationGain(0);
    setElapsedSeconds(0);
    setIsPaused(false);
    setIsRecording(true);
    isPausedRef.current = false;
    isRecordingRef.current = true;
    setMotionState('MOVING');
    sessionStore.clear();
    notify('开始记录轨迹', 'success');
  }, [currentElevation, notify, workspaceId]);

  const togglePause = useCallback(() => {
    if (!isRecordingRef.current) return;

    if (!isPausedRef.current) {
      lastPauseStartRef.current = Date.now();
      isPausedRef.current = true;
      setIsPaused(true);
      setMotionState('STANDBY');
      queueSnapshot();
      notify('轨迹记录已暂停', 'info');
      return;
    }

    if (lastPauseStartRef.current) {
      accumulatedPausedMsRef.current += Date.now() - lastPauseStartRef.current;
      lastPauseStartRef.current = null;
    }
    isPausedRef.current = false;
    setIsPaused(false);
    setMotionState('MOVING');
    notify('继续记录轨迹', 'success');
  }, [notify, queueSnapshot]);

  const finish = useCallback(async () => {
    if (!isRecordingRef.current || pointsRef.current.length === 0) {
      notify('当前没有可保存的轨迹', 'error');
      return null;
    }

    const savedPoints = [...pointsRef.current];
    const durationMs =
      Date.now() -
      sessionStartRef.current -
      accumulatedPausedMsRef.current -
      (lastPauseStartRef.current ? Date.now() - lastPauseStartRef.current : 0);
    const track = {
      id: Date.now(),
      name: `户外轨迹 ${formatTrackDate()}`,
      distance: (totalDistanceRef.current / 1000).toFixed(2),
      eleGain: Math.round(totalElevationGainRef.current),
      time: formatDuration(durationMs / 1000),
      durationSeconds: Math.round(durationMs / 1000),
      distanceMeters: totalDistanceRef.current,
      elevationGain: totalElevationGainRef.current,
      startedAt: sessionStartRef.current,
      finishedAt: Date.now(),
      points: savedPoints,
      createdAt: Date.now(),
    };

    window.clearTimeout(snapshotTimerRef.current);
    isRecordingRef.current = false;
    isPausedRef.current = false;
    setIsRecording(false);
    setIsPaused(false);
    setMotionState('STANDBY');
    setElapsedSeconds(0);
    pointsRef.current = [];
    setPoints([]);
    setDistanceMeters(0);
    setElevationGain(0);
    sessionStartRef.current = null;
    totalDistanceRef.current = 0;
    totalElevationGainRef.current = 0;
    lastValidElevationRef.current = null;
    lastPauseStartRef.current = null;
    stationaryCountRef.current = 0;
    await sessionStore.clear();

    notify('轨迹已保存', 'success');
    return track;
  }, [notify]);

  const restore = useCallback(
    (snapshot) => {
      if (!snapshot?.points?.length) return;

      pointsRef.current = snapshot.points;
      sessionStartRef.current = snapshot.sessionStartTime ?? Date.now();
      accumulatedPausedMsRef.current = snapshot.accumulatedPausedMs ?? 0;
      totalDistanceRef.current = snapshot.totalDistance ?? 0;
      totalElevationGainRef.current = snapshot.totalElevationGain ?? 0;
      lastValidElevationRef.current =
        snapshot.points.at(-1)?.ele ?? null;
      lastSampleTimestampRef.current = 0;
      stationaryCountRef.current = 0;
      lastPauseStartRef.current = null;

      setPoints(snapshot.points);
      setDistanceMeters(totalDistanceRef.current);
      setElevationGain(totalElevationGainRef.current);
      setIsRecording(true);
      setIsPaused(false);
      isRecordingRef.current = true;
      isPausedRef.current = false;
      setMotionState('MOVING');
      setElapsedSeconds(
        Math.floor(
          (Date.now() -
            sessionStartRef.current -
            accumulatedPausedMsRef.current) /
            1000,
        ),
      );
      notify('未保存轨迹已恢复', 'success');
    },
    [notify],
  );

  return {
    points,
    isRecording,
    isPaused,
    distanceMeters,
    elevationGain,
    currentElevation,
    elapsedSeconds,
    currentPosition,
    gpsState,
    motionState,
    pageHidden,
    start,
    togglePause,
    finish,
    restore,
  };
}
