import { useCallback, useEffect, useRef, useState } from 'react';

function normalizeHeading(value) {
  return ((value % 360) + 360) % 360;
}

function readCompassHeading(event) {
  if (
    Number.isFinite(event.webkitCompassHeading) &&
    event.webkitCompassHeading >= 0 &&
    event.webkitCompassHeading < 360
  ) {
    return normalizeHeading(event.webkitCompassHeading);
  }
  if (event.absolute && Number.isFinite(event.alpha)) {
    return normalizeHeading(360 - event.alpha);
  }
  return null;
}

function smoothHeading(previous, next) {
  if (previous === null) return next;
  const delta = ((next - previous + 540) % 360) - 180;
  return normalizeHeading(previous + delta * 0.45);
}

export function useCompassHeading(enabled) {
  const [heading, setHeading] = useState(null);
  const attachedRef = useRef(false);
  const cleanupRef = useRef(null);
  const smoothedHeadingRef = useRef(null);
  const lastUpdateRef = useRef(0);
  const permissionGrantedRef = useRef(false);

  const handleOrientation = useCallback((event) => {
    const nextHeading = readCompassHeading(event);
    if (nextHeading === null) return;

    const now = Date.now();
    if (now - lastUpdateRef.current < 100) return;
    lastUpdateRef.current = now;

    const smoothed = smoothHeading(smoothedHeadingRef.current, nextHeading);
    smoothedHeadingRef.current = smoothed;
    setHeading(smoothed);
  }, []);

  const detach = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    attachedRef.current = false;
  }, []);

  const attach = useCallback(() => {
    if (!enabled || attachedRef.current) return;

    window.addEventListener('deviceorientationabsolute', handleOrientation, true);
    window.addEventListener('deviceorientation', handleOrientation, true);
    attachedRef.current = true;
    cleanupRef.current = () => {
      window.removeEventListener(
        'deviceorientationabsolute',
        handleOrientation,
        true,
      );
      window.removeEventListener('deviceorientation', handleOrientation, true);
    };
  }, [enabled, handleOrientation]);

  useEffect(() => {
    if (!enabled || typeof DeviceOrientationEvent === 'undefined') {
      return undefined;
    }

    if (typeof DeviceOrientationEvent.requestPermission !== 'function') {
      attach();
      return detach;
    }

    if (permissionGrantedRef.current) {
      attach();
      return detach;
    }

    let cancelled = false;
    const requestPermission = async () => {
      try {
        const permission = await DeviceOrientationEvent.requestPermission();
        if (!cancelled && permission === 'granted') {
          permissionGrantedRef.current = true;
          attach();
        }
      } catch {}
    };

    window.addEventListener('pointerup', requestPermission, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener('pointerup', requestPermission);
      detach();
    };
  }, [attach, detach, enabled]);

  return heading;
}
