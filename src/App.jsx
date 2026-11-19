import { useEffect, useMemo, useRef, useState } from 'react';
import { ActionModal } from './components/ActionModal.jsx';
import { AppHeader } from './components/AppHeader.jsx';
import { BottomNav } from './components/BottomNav.jsx';
import { MapView } from './components/MapView.jsx';
import { OfflineMapView } from './components/OfflineMapView.jsx';
import { PoiModal } from './components/PoiModal.jsx';
import { RecordingControls } from './components/RecordingControls.jsx';
import { SettingsView } from './components/SettingsView.jsx';
import { WorkspaceCreateModal } from './components/WorkspaceCreateModal.jsx';
import { WorkspaceHistoryView } from './components/WorkspaceHistoryView.jsx';
import { WorkspaceView } from './components/WorkspaceView.jsx';
import { useBattery } from './hooks/useBattery.js';
import {
  NotificationProvider,
  useNotifications,
} from './hooks/useNotifications.jsx';
import { usePersistentState } from './hooks/usePersistentState.js';
import { useTrailRecorder } from './hooks/useTrailRecorder.js';
import { formatDuration } from './services/geo.js';
import { downloadGpx } from './services/gpx.js';
import { getMapSource } from './services/mapLayers.js';
import {
  buildOfflineUrls,
  downloadOfflineTiles,
} from './services/offlineMaps.js';
import { sessionStore, tileCache } from './services/storage.js';
import {
  createRecordedTrack,
  createTargetTrack,
  createWorkspace,
  getWorkspaceFocusPoints,
  migrateLegacyWorkspaces,
} from './services/workspaces.js';

function TrailGuardianApp() {
  const { notify } = useNotifications();
  const battery = useBattery();
  const mapApiRef = useRef(null);
  const recordingWorkspaceIdRef = useRef(null);
  const offlineReturnTabRef = useRef('settings');

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
  const [workspaces, setWorkspaces] = usePersistentState(
    'trail_workspaces',
    migrateLegacyWorkspaces,
  );
  const [activeWorkspaceId, setActiveWorkspaceId] = usePersistentState(
    'trail_active_workspace_id',
    null,
  );
  const [offlineMaps, setOfflineMaps] = usePersistentState(
    'trail_offline_maps',
    [],
  );
  const [poiModal, setPoiModal] = useState({ open: false, anchor: null });
  const [pendingSnapshot, setPendingSnapshot] = useState(null);
  const [workspaceCreateOpen, setWorkspaceCreateOpen] = useState(false);
  const [offlineFocusRequest, setOfflineFocusRequest] = useState(null);
  const [cacheRevision, setCacheRevision] = useState(0);

  const activeWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null,
    [activeWorkspaceId, workspaces],
  );

  const workspaceOfflineMap = useMemo(() => {
    if (!activeWorkspace) return null;
    const directMatch = offlineMaps.find(
      (region) => region.workspaceId === activeWorkspace.id,
    );
    if (directMatch) return directMatch;
    return (
      offlineMaps.find(
        (region) =>
          region.status === 'ready' &&
          region.name === `${activeWorkspace.name} 离线地图`,
      ) ?? null
    );
  }, [activeWorkspace, offlineMaps]);

  const recorder = useTrailRecorder({
    audioKeepAliveEnabled,
    lowPowerEnabled,
    notify,
    workspaceId: activeWorkspace?.id ?? null,
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

  useEffect(() => {
    if (
      activeWorkspaceId &&
      !workspaces.some((workspace) => workspace.id === activeWorkspaceId)
    ) {
      setActiveWorkspaceId(null);
    }
  }, [activeWorkspaceId, setActiveWorkspaceId, workspaces]);

  const focusTrack = useMemo(() => {
    if (!activeWorkspace) return null;
    const targetPoints = activeWorkspace.targetTrack?.points;
    const recordedPoints = activeWorkspace.recordedTrack?.points;
    const points = targetPoints?.length ? targetPoints : recordedPoints ?? [];
    if (!points.length) return null;
    return {
      key: `workspace-${activeWorkspace.id}-${
        activeWorkspace.targetTrack?.importedAt ??
        activeWorkspace.recordedTrack?.createdAt ??
        'empty'
      }`,
      points,
    };
  }, [activeWorkspace]);

  const recordedTrackForMap = useMemo(() => {
    if (!activeWorkspace) return null;
    if (recorder.isRecording) {
      return { key: `live-${activeWorkspace.id}`, points: recorder.points };
    }
    const points = activeWorkspace.recordedTrack?.points;
    return points?.length
      ? {
          key: `recorded-${activeWorkspace.id}-${activeWorkspace.recordedTrack.createdAt}`,
          points,
        }
      : null;
  }, [activeWorkspace, recorder.isRecording, recorder.points]);

  const updateWorkspace = (workspaceId, updater) => {
    setWorkspaces((current) =>
      current.map((workspace) => {
        if (workspace.id !== workspaceId) return workspace;
        const nextWorkspace =
          typeof updater === 'function' ? updater(workspace) : { ...workspace, ...updater };
        return { ...nextWorkspace, updatedAt: Date.now() };
      }),
    );
  };

  useEffect(() => {
    const source = getMapSource(mapSourceId);
    if (mapSourceId !== source.id) setMapSourceId(source.id);
  }, [mapSourceId, setMapSourceId]);

  const openWorkspaceCreate = () => {
    if (recorder.isRecording) {
      notify('请先结束当前轨迹记录，再新建工作空间', 'error');
      return;
    }
    setWorkspaceCreateOpen(true);
  };

  const handleCreateWorkspace = (name) => {
    if (recorder.isRecording) {
      notify('请先结束当前轨迹记录，再新建工作空间', 'error');
      return;
    }
    const workspace = createWorkspace(name);
    setWorkspaces((current) => [workspace, ...current]);
    setActiveWorkspaceId(workspace.id);
    setWorkspaceCreateOpen(false);
    setActiveTab('track');
    notify(`已新建工作空间：${workspace.name}`, 'success');
  };

  const activateWorkspace = (workspace, destination, message = '') => {
    if (recorder.isRecording && workspace.id !== activeWorkspaceId) {
      notify('请先结束当前轨迹记录，再切换工作空间', 'error');
      return false;
    }
    setActiveWorkspaceId(workspace.id);
    setActiveTab(destination);
    if (message) notify(message, 'success');
    return true;
  };

  const deleteWorkspace = (workspaceId) => {
    if (recorder.isRecording && activeWorkspaceId === workspaceId) {
      notify('当前工作空间正在记录轨迹，无法删除', 'error');
      return;
    }
    setWorkspaces((current) =>
      current.filter((workspace) => workspace.id !== workspaceId),
    );
    if (activeWorkspaceId === workspaceId) setActiveWorkspaceId(null);
  };

  const exportWorkspace = (workspace) => {
    if (!workspace?.recordedTrack?.points?.length) {
      notify('该工作空间还没有可导出的已走轨迹', 'error');
      return;
    }
    downloadGpx(
      workspace.name,
      workspace.recordedTrack.points,
      workspace.pois,
    );
    notify(
      `已导出已走轨迹与 ${workspace.pois.length} 个标注点位`,
      'success',
    );
  };

  const importTargetTrack = ({ name, points, waypoints }) => {
    if (!activeWorkspace) {
      notify('请先加载工作空间', 'error');
      return;
    }
    const batchId = Date.now();
    updateWorkspace(activeWorkspace.id, (workspace) => ({
      ...workspace,
      targetTrack: points.length
        ? createTargetTrack(points, name)
        : workspace.targetTrack,
      pois: waypoints.length
        ? [
            ...waypoints.map((waypoint, index) => ({
              ...waypoint,
              id: `gpx-${batchId}-${index}`,
            })),
            ...workspace.pois,
          ]
        : workspace.pois,
    }));
    setActiveTab('map');
  };

  const openPoiModal = () => {
    if (!activeWorkspace) {
      notify('请先新建或加载轨迹工作空间，再进行标注', 'error');
      return;
    }
    const anchor = mapApiRef.current?.getPoiAnchor();
    if (!anchor) {
      notify('地图尚未就绪，请稍后再试', 'error');
      return;
    }
    setPoiModal({ open: true, anchor });
  };

  const savePoi = (poi) => {
    if (!activeWorkspace) {
      notify('请先加载工作空间', 'error');
      return;
    }
    updateWorkspace(activeWorkspace.id, (workspace) => ({
      ...workspace,
      pois: [{ id: `poi-${Date.now()}`, ...poi }, ...workspace.pois],
    }));
    setPoiModal({ open: false, anchor: null });
    notify('标注点位已保存', 'success');
  };

  const deletePoi = (id) => {
    if (!activeWorkspace) return;
    updateWorkspace(activeWorkspace.id, (workspace) => ({
      ...workspace,
      pois: workspace.pois.filter((poi) => poi.id !== id),
    }));
  };

  const focusPoi = (poi) => {
    mapApiRef.current?.centerToPoint(poi.lat, poi.lng, 17);
    setActiveTab('map');
  };

  const startRecording = () => {
    if (!activeWorkspace) {
      notify('请先新建或加载轨迹工作空间，再开始记录', 'error');
      setActiveTab('history');
      return;
    }
    recordingWorkspaceIdRef.current = activeWorkspace.id;
    recorder.start();
    setActiveTab('map');
  };

  const finishRecording = async () => {
    const track = await recorder.finish();
    if (!track) return;
    const workspaceId =
      recordingWorkspaceIdRef.current ?? activeWorkspace?.id ?? null;
    recordingWorkspaceIdRef.current = null;
    if (!workspaceId) {
      notify('未能找到轨迹所属的工作空间', 'error');
      return;
    }
    updateWorkspace(workspaceId, (workspace) => ({
      ...workspace,
      recordedTrack: createRecordedTrack(track.points, {
        createdAt: track.createdAt,
        distanceMeters: track.distanceMeters,
        durationSeconds: track.durationSeconds,
        elevationGain: track.elevationGain,
        finishedAt: track.finishedAt,
        name: `${workspace.name} 已走轨迹`,
        startedAt: track.startedAt,
      }),
    }));
  };

  const restorePendingSnapshot = () => {
    if (!pendingSnapshot?.points?.length) return;
    let workspace = workspaces.find(
      (item) => item.id === pendingSnapshot.workspaceId,
    );
    if (!workspace) {
      workspace = createWorkspace('恢复的外出计划');
      setWorkspaces((current) => [workspace, ...current]);
    }
    setActiveWorkspaceId(workspace.id);
    recordingWorkspaceIdRef.current = workspace.id;
    recorder.restore(pendingSnapshot);
    setPendingSnapshot(null);
    setActiveTab('map');
  };

  const discardPendingSnapshot = async () => {
    await sessionStore.clear();
    setPendingSnapshot(null);
    notify('未保存轨迹已放弃', 'info');
  };

  const openOfflineMapList = () => {
    offlineReturnTabRef.current = 'settings';
    setOfflineFocusRequest({
      key: Date.now(),
      points: getWorkspaceFocusPoints(activeWorkspace),
      startPicker: false,
      workspaceId: null,
    });
    setActiveTab('offline');
  };

  const openOfflinePickerForWorkspace = () => {
    if (!activeWorkspace) {
      notify('请先加载工作空间', 'error');
      return;
    }
    offlineReturnTabRef.current = 'track';
    const existingMap = workspaceOfflineMap;
    setOfflineFocusRequest({
      initialIncludeContour: existingMap?.includeContour ?? false,
      initialName: existingMap?.name ?? '',
      initialSelection: existingMap?.points ?? [],
      initialZooms: existingMap?.zooms ?? null,
      key: Date.now(),
      points: getWorkspaceFocusPoints(activeWorkspace),
      replaceMapId: existingMap?.id ?? null,
      startPicker: true,
      workspaceId: activeWorkspace.id,
    });
    setActiveTab('offline');
  };

  const addOfflineMap = async (regionInput) => {
    const id = `offline-${Date.now()}`;
    const source = getMapSource(regionInput.sourceId);
    const { replaceMapId, ...regionData } = regionInput;
    const record = {
      ...regionData,
      id,
      createdAt: Date.now(),
      downloadedTiles: 0,
      progress: 0,
      sizeBytes: 0,
      status: 'downloading',
    };
    const replacedRegion = replaceMapId
      ? offlineMaps.find((region) => region.id === replaceMapId)
      : null;
    const urls = buildOfflineUrls({
      bounds: regionInput.bounds,
      includeContour: regionInput.includeContour,
      source,
      zooms: regionInput.zooms,
    });

    setOfflineMaps((current) => [
      record,
      ...current.filter((region) => region.id !== replaceMapId),
    ]);

    if (replacedRegion) {
      const replacedSource = getMapSource(replacedRegion.sourceId);
      const replacedUrls = buildOfflineUrls({
        bounds: replacedRegion.bounds,
        includeContour: replacedRegion.includeContour,
        source: replacedSource,
        zooms: replacedRegion.zooms,
      });
      await tileCache.deleteTiles(replacedUrls);
    }

    downloadOfflineTiles(urls, (progress) => {
      setOfflineMaps((current) =>
        current.map((region) => {
          if (region.id !== id || region.progress === progress.progress) {
            return region;
          }
          return {
            ...region,
            downloadedTiles: progress.completed,
            progress: progress.progress,
            sizeBytes: progress.bytes,
          };
        }),
      );
    })
      .then((result) => {
        const status = result.failed > 0 ? 'error' : 'ready';
        setOfflineMaps((current) =>
          current.map((region) =>
            region.id === id
              ? {
                  ...region,
                  completedAt: Date.now(),
                  downloadedTiles: result.total - result.failed,
                  failedTiles: result.failed,
                  progress: 100,
                  sizeBytes: result.bytes,
                  status,
                }
              : region,
          ),
        );
        setCacheRevision((current) => current + 1);
        notify(
          result.failed > 0
            ? `离线地图完成：${result.failed} 张瓦片失败`
            : `离线地图完成：${result.total - result.failed} 张瓦片已缓存`,
          result.failed > 0 ? 'info' : 'success',
        );
      })
      .catch(() => {
        setOfflineMaps((current) =>
          current.map((region) =>
            region.id === id ? { ...region, status: 'error' } : region,
          ),
        );
        notify('离线地图下载失败', 'error');
      });
  };

  const deleteOfflineMap = async (region) => {
    const source = getMapSource(region.sourceId);
    const urls = buildOfflineUrls({
      bounds: region.bounds,
      includeContour: region.includeContour,
      source,
      zooms: region.zooms,
    });
    await tileCache.deleteTiles(urls);
    setOfflineMaps((current) =>
      current.filter((item) => item.id !== region.id),
    );
    setCacheRevision((current) => current + 1);
  };

  const clearOfflineMaps = async () => {
    await tileCache.clearTiles();
    setOfflineMaps([]);
    setCacheRevision((current) => current + 1);
  };

  const openActiveWorkspace = () => {
    setActiveTab(activeWorkspace ? 'track' : 'history');
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-slate-950 text-slate-100">
      {activeTab !== 'offline' && (
        <AppHeader
          battery={battery}
          lowPowerEnabled={lowPowerEnabled}
          motionState={recorder.motionState}
          onWorkspaceClick={openActiveWorkspace}
          workspaceName={activeWorkspace?.name}
        />
      )}

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
            focusTrack={focusTrack}
            isActive={activeTab === 'map'}
            mapSourceId={mapSourceId}
            onContourOpacityChange={setContourOpacity}
            onLocateRequest={() => notify('正在等待 GPS 定位…', 'info')}
            onOpenPoi={openPoiModal}
            onToggleContour={setContourEnabled}
            pois={activeWorkspace?.pois ?? []}
            recordedTrack={recordedTrackForMap}
            ref={mapApiRef}
            targetTrack={activeWorkspace?.targetTrack}
          />
        </section>

        {activeTab === 'track' && (
          <WorkspaceView
            currentElevation={recorder.currentElevation}
            distanceMeters={recorder.distanceMeters}
            elevationGain={recorder.elevationGain}
            elapsedSeconds={recorder.elapsedSeconds}
            gpsState={recorder.gpsState}
            isPaused={recorder.isPaused}
            isRecording={recorder.isRecording}
            onAddPoi={openPoiModal}
            onCreateWorkspace={openWorkspaceCreate}
            onDeletePoi={deletePoi}
            onExportRecorded={() => exportWorkspace(activeWorkspace)}
            onFinish={finishRecording}
            onFocusPoi={focusPoi}
            onImportTarget={importTargetTrack}
            onOpenHistory={() => setActiveTab('history')}
            onOpenMap={() => setActiveTab('map')}
            onOpenOffline={openOfflinePickerForWorkspace}
            onPause={() => recorder.togglePause()}
            onStart={startRecording}
            offlineMap={workspaceOfflineMap}
            points={recorder.points}
            workspace={activeWorkspace}
          />
        )}

        {activeTab === 'history' && (
          <WorkspaceHistoryView
            activeWorkspaceId={activeWorkspaceId}
            onCreate={openWorkspaceCreate}
            onDelete={deleteWorkspace}
            onExport={exportWorkspace}
            onLoad={(workspace) =>
              activateWorkspace(workspace, 'map', '已加载历史轨迹工作空间')
            }
            onViewDetails={(workspace) => activateWorkspace(workspace, 'track')}
            isRecording={recorder.isRecording}
            workspaces={workspaces}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            audioKeepAliveEnabled={audioKeepAliveEnabled}
            cacheRevision={cacheRevision}
            isRecording={recorder.isRecording}
            lowPowerEnabled={lowPowerEnabled}
            offlineMapCount={offlineMaps.length}
            onAudioKeepAliveChange={setAudioKeepAliveEnabled}
            onLowPowerChange={setLowPowerEnabled}
            onOpenOfflineMaps={openOfflineMapList}
            pageHidden={recorder.pageHidden}
          />
        )}

        {activeTab === 'offline' && (
          <OfflineMapView
            focusRequest={offlineFocusRequest}
            mapSourceId={mapSourceId}
            offlineMaps={offlineMaps}
            onAddOfflineMap={addOfflineMap}
            onBack={() => setActiveTab(offlineReturnTabRef.current)}
            onClearOfflineMaps={clearOfflineMaps}
            onDeleteOfflineMap={deleteOfflineMap}
            replaceMapId={offlineFocusRequest?.replaceMapId ?? null}
            suggestedName={activeWorkspace?.name}
            workspaceId={offlineFocusRequest?.workspaceId ?? null}
          />
        )}
      </main>

      {activeTab === 'map' && (
        <div className="shrink-0 border-t border-slate-800 bg-slate-900/95 px-3 py-2">
          {activeWorkspace ? (
            <>
              <div className="mb-1.5 flex items-center justify-between gap-3 text-[10px]">
                <span className="truncate font-semibold text-emerald-400">
                  <i className="fa-solid fa-route mr-1" /> {activeWorkspace.name}
                </span>
                <span className="shrink-0 text-slate-500">
                  {recorder.isRecording
                    ? `${(recorder.distanceMeters / 1000).toFixed(2)} km · ${formatDuration(
                        recorder.elapsedSeconds,
                      )}`
                    : '等待开始记录'}
                </span>
              </div>
              <RecordingControls
                isPaused={recorder.isPaused}
                isRecording={recorder.isRecording}
                onFinish={finishRecording}
                onPause={() => recorder.togglePause()}
                onStart={startRecording}
              />
            </>
          ) : (
            <button
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-800/60 bg-amber-950/30 px-4 py-3 text-xs font-semibold text-amber-300"
              onClick={() => setActiveTab('history')}
              type="button"
            >
              <i className="fa-solid fa-folder-open" /> 未加载工作空间 · 选择或新建轨迹
            </button>
          )}
        </div>
      )}

      {activeTab !== 'offline' && (
        <BottomNav activeTab={activeTab} onChange={setActiveTab} />
      )}

      <WorkspaceCreateModal
        onClose={() => setWorkspaceCreateOpen(false)}
        onCreate={handleCreateWorkspace}
        open={workspaceCreateOpen}
      />

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
            onClick: discardPendingSnapshot,
          },
          {
            label: '恢复',
            className:
              'rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow',
            onClick: restorePendingSnapshot,
          },
        ]}
        open={Boolean(pendingSnapshot)}
        title="发现未保存轨迹"
      >
        <p>
          检测到上次未完成的轨迹（约{' '}
          {((pendingSnapshot?.totalDistance ?? 0) / 1000).toFixed(2)} km，
          {pendingSnapshot?.points?.length ?? 0} 个点），是否恢复到所属工作空间？
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
