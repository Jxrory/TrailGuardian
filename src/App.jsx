import { useEffect, useRef, useState } from 'react';
import { ActionModal } from './components/ActionModal.jsx';
import { AppHeader } from './components/AppHeader.jsx';
import { BottomNav } from './components/BottomNav.jsx';
import { MapView } from './components/MapView.jsx';
import { PoiModal } from './components/PoiModal.jsx';
import { PoiView } from './components/PoiView.jsx';
import { SettingsView } from './components/SettingsView.jsx';
import { TrackView } from './components/TrackView.jsx';
import { useBattery } from './hooks/useBattery.js';
import {
  NotificationProvider,
  useNotifications,
} from './hooks/useNotifications.jsx';
import { usePersistentState } from './hooks/usePersistentState.js';
import { useTrailRecorder } from './hooks/useTrailRecorder.js';
import { nextMapSource } from './services/mapLayers.js';
import { sessionStore } from './services/storage.js';

function TrailGuardianApp() {
  const { notify } = useNotifications();
  const battery = useBattery();
  const mapApiRef = useRef(null);

  const [activeTab, setActiveTab] = useState('map');
  const [mapSourceId, setMapSourceId] = usePersistentState(
    'trail_map_source',
    'esri-satellite',
  );
  const [contourEnabled, setContourEnabled] = usePersistentState(
    'trail_contour_enabled',
    true,
  );
  const [contourOpacity, setContourOpacity] = usePersistentState(
    'trail_contour_opacity',
    0.72,
  );
  const [lowPowerEnabled, setLowPowerEnabled] = usePersistentState(
    'trail_low_power',
    true,
  );
  const [audioKeepAliveEnabled, setAudioKeepAliveEnabled] = usePersistentState(
    'trail_audio_keepalive',
    true,
  );
  const [savedTracks, setSavedTracks] = usePersistentState(
    'trail_saved_tracks',
    [],
  );
  const [pois, setPois] = usePersistentState('trail_pois', []);
  const [displayedTrack, setDisplayedTrack] = useState(null);
  const [poiModal, setPoiModal] = useState({ open: false, anchor: null });
  const [pendingSnapshot, setPendingSnapshot] = useState(null);
  const [cacheRevision, setCacheRevision] = useState(0);

  const recorder = useTrailRecorder({
    lowPowerEnabled,
    audioKeepAliveEnabled,
    notify,
  });

  useEffect(() => {
    let cancelled = false;
    sessionStore.load().then((snapshot) => {
      if (!cancelled && snapshot?.points?.length) {
        setPendingSnapshot(snapshot);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const cycleMapSource = () => {
    const next = nextMapSource(mapSourceId);
    setMapSourceId(next.id);
    notify(`已切换图源：${next.label}`, 'info');
  };

  const openPoiModal = () => {
    const anchor = mapApiRef.current?.getPoiAnchor();
    if (!anchor) {
      notify('地图尚未就绪，请稍后再试', 'error');
      return;
    }
    setPoiModal({ open: true, anchor });
  };

  const savePoi = (poi) => {
    setPois((current) => [{ id: Date.now(), ...poi }, ...current]);
    setPoiModal({ open: false, anchor: null });
    notify('路标打点成功', 'success');
  };

  const deletePoi = (id) => {
    setPois((current) => current.filter((poi) => poi.id !== id));
  };

  const focusPoi = (poi) => {
    mapApiRef.current?.centerToPoint(poi.lat, poi.lng, 17);
    setActiveTab('map');
  };

  const importTrack = ({ points, name }) => {
    setDisplayedTrack({
      key: `import-${Date.now()}`,
      name,
      points,
      color: '#3b82f6',
    });
    setActiveTab('map');
  };

  const loadSavedTrack = (track) => {
    setDisplayedTrack({
      key: `saved-${track.id}`,
      name: track.name,
      points: track.points,
      color: '#f59e0b',
    });
    setActiveTab('map');
    notify('已加载历史轨迹', 'success');
  };

  const deleteSavedTrack = (id) => {
    setSavedTracks((current) => current.filter((track) => track.id !== id));
    if (displayedTrack?.key === `saved-${id}`) setDisplayedTrack(null);
  };

  const finishRecording = async () => {
    const track = await recorder.finish();
    if (!track) return;
    setSavedTracks((current) => [track, ...current]);
  };

  const handleStartOrPause = () => {
    if (!recorder.isRecording) {
      recorder.start();
    } else {
      recorder.togglePause();
    }
  };

  const downloadArea = async (onProgress) => {
    if (!mapApiRef.current) {
      return { ok: false, message: '地图尚未就绪' };
    }
    return mapApiRef.current.downloadCurrentArea(onProgress);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-slate-950 text-slate-100">
      <AppHeader
        battery={battery}
        lowPowerEnabled={lowPowerEnabled}
        motionState={recorder.motionState}
      />

      <main className="relative flex-1 overflow-hidden">
        <section
          aria-hidden={activeTab !== 'map'}
          className={`absolute inset-0 flex flex-col ${
            activeTab === 'map' ? '' : 'pointer-events-none invisible'
          }`}
        >
          <MapView
            contourEnabled={contourEnabled}
            contourOpacity={contourOpacity}
            currentElevation={recorder.currentElevation}
            currentPosition={recorder.currentPosition}
            displayedTrack={displayedTrack}
            isActive={activeTab === 'map'}
            mapSourceId={mapSourceId}
            onContourOpacityChange={setContourOpacity}
            onCycleMapSource={cycleMapSource}
            onLocateRequest={() => notify('正在等待 GPS 定位…', 'info')}
            onOpenPoi={openPoiModal}
            onToggleContour={setContourEnabled}
            pois={pois}
            ref={mapApiRef}
            trackPoints={recorder.points}
          />
        </section>

        {activeTab === 'track' && (
          <TrackView
            currentElevation={recorder.currentElevation}
            distanceMeters={recorder.distanceMeters}
            elevationGain={recorder.elevationGain}
            elapsedSeconds={recorder.elapsedSeconds}
            gpsState={recorder.gpsState}
            isPaused={recorder.isPaused}
            isRecording={recorder.isRecording}
            onDeleteTrack={deleteSavedTrack}
            onFinish={finishRecording}
            onImportTrack={importTrack}
            onLoadTrack={loadSavedTrack}
            onStartOrPause={handleStartOrPause}
            points={recorder.points}
            savedTracks={savedTracks}
          />
        )}

        {activeTab === 'pois' && (
          <PoiView
            onAdd={openPoiModal}
            onDelete={deletePoi}
            onFocus={focusPoi}
            pois={pois}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            audioKeepAliveEnabled={audioKeepAliveEnabled}
            cacheRevision={cacheRevision}
            isRecording={recorder.isRecording}
            lowPowerEnabled={lowPowerEnabled}
            onAudioKeepAliveChange={setAudioKeepAliveEnabled}
            onCacheCleared={() => setCacheRevision((current) => current + 1)}
            onDownloadArea={downloadArea}
            onLowPowerChange={setLowPowerEnabled}
            pageHidden={recorder.pageHidden}
          />
        )}
      </main>

      <BottomNav activeTab={activeTab} onChange={setActiveTab} />

      <PoiModal
        anchor={poiModal.anchor ?? { lat: 30.245, lng: 120.125 }}
        onClose={() => setPoiModal({ open: false, anchor: null })}
        onSave={savePoi}
        open={poiModal.open}
      />

      <ActionModal
        actions={[
          {
            label: '放弃',
            className:
              'rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300',
            onClick: async () => {
              await sessionStore.clear();
              setPendingSnapshot(null);
              notify('未保存轨迹已放弃', 'info');
            },
          },
          {
            label: '恢复',
            className:
              'rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow',
            onClick: () => {
              recorder.restore(pendingSnapshot);
              setPendingSnapshot(null);
              setActiveTab('track');
            },
          },
        ]}
        open={Boolean(pendingSnapshot)}
        title="发现未保存轨迹"
      >
        <p>
          检测到上次未完成的轨迹（约{' '}
          {((pendingSnapshot?.totalDistance ?? 0) / 1000).toFixed(2)} km，
          {pendingSnapshot?.points?.length ?? 0} 个点），是否恢复？
        </p>
      </ActionModal>
    </div>
  );
}

export default function App() {
  return (
    <NotificationProvider>
      <TrailGuardianApp />
    </NotificationProvider>
  );
}
