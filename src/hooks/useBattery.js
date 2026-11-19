import { useEffect, useState } from 'react';

export function useBattery() {
  const [battery, setBattery] = useState({
    supported: 'getBattery' in navigator,
    level: null,
    charging: false,
  });

  useEffect(() => {
    if (!('getBattery' in navigator)) return undefined;

    let batteryManager = null;
    let disposed = false;

    const updateBattery = () => {
      if (!batteryManager || disposed) return;
      setBattery({
        supported: true,
        level: batteryManager.level,
        charging: batteryManager.charging,
      });
    };

    navigator.getBattery().then((manager) => {
      if (disposed) return;
      batteryManager = manager;
      updateBattery();
      manager.addEventListener('levelchange', updateBattery);
      manager.addEventListener('chargingchange', updateBattery);
    });

    return () => {
      disposed = true;
      batteryManager?.removeEventListener('levelchange', updateBattery);
      batteryManager?.removeEventListener('chargingchange', updateBattery);
    };
  }, []);

  return battery;
}
