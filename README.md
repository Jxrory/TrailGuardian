# 野径户外助手 · TrailGuardian

一个面向户外徒步、越野与登山场景的 React 单页应用。以“轨迹工作空间”为单位管理每次外出计划，提供卫星地图、等高线、GPS 轨迹记录、设备方向指南针、GPX 导入导出、点位标注和独立的离线地图管理。

当前正式版本为 `1.0.0`，版本变更记录见 [VERSION.md](./VERSION.md)；面向开发 Agent 的协作约定见 [AGENTS.md](./AGENTS.md)。Android Kotlin 原生重做的功能规格见 [docs/ANDROID_NATIVE_SPEC.md](./docs/ANDROID_NATIVE_SPEC.md)。

## 功能

- **地图与等高线**：Esri 卫星底图，可调节等高线叠加强度；地图信息默认折叠，入口位于左上角。
- **设备方向指南针**：定位点显示设备朝向，支持 iPhone 罗盘与 Android absolute orientation；方向跨过正北时保持连续旋转。
- **本地等高线生成**：基于 AWS Terrain（Mapzen Terrarium）高程瓦片，在浏览器中实时生成 50 米间隔等高线；整百米等高线使用黄色强调并显示高程标注。
- **轨迹工作空间**：每次外出计划是一个独立工作空间，集中保存可选的目标运动路径、已走轨迹、标注点位和记录状态。
- **轨迹记录**：在首页和工作空间详情中开始、暂停、继续和结束记录；实时显示距离、耗时、累计爬升、当前海拔与 GPS 状态。
- **双路径区分**：目标运动路径用蓝色虚线显示，已走路径用绿色实线显示，地图左上角提供图例。
- **历史轨迹管理**：支持新建、加载、查看详情、删除和导出已走轨迹；空列表显示“空空如也”引导。
- **GPX / KML**：目标路径与 GPX `<wpt>` 标注点导入到当前工作空间；导出时生成已走轨迹和当前工作空间全部标注点。
- **标注点位**：营地、水源、危险点、观景台和通用标注点跟随工作空间保存，可在地图或详情页添加、定位和删除。
- **离线地图**：独立的地图圈选、层级选择、下载进度和删除管理，离线瓦片缓存到 IndexedDB。
- **息屏保活**：静音音频轨道和 Web Locks 组合保活，并提供低功耗/静止休眠采样策略。
- **断点恢复**：记录过程中自动保存快照及所属工作空间，意外关闭后可恢复到原工作空间。

## 技术栈

- React 19
- Vite 7
- React Leaflet 5 / Leaflet 1.9
- Tailwind CSS 4
- IndexedDB + LocalStorage
- Font Awesome 7

## 快速开始

环境要求：Node.js 20.19+ 或 22.12+，npm 10+。

```bash
npm install
npm run dev
```

默认开发地址为 `http://localhost:5173`（Vite 也会打印实际端口）。

生产构建与预览：

```bash
npm run build
npm run preview
```

## 项目结构

```text
.
├── index.html                  # Vite 入口
├── public/favicon.svg
├── src
│   ├── App.jsx                 # 应用状态、页签与业务流程编排
│   ├── main.jsx
│   ├── styles.css              # Tailwind 与 Leaflet 全局样式
│   ├── components
│   │   ├── AppHeader.jsx       # 当前工作空间、电量与运动状态
│   │   ├── BottomNav.jsx       # 地图 / 轨迹 / 历史轨迹 / 设置
│   │   ├── MapView.jsx         # 地图、目标路径、已走路径、点位和等高线
│   │   ├── WorkspaceView.jsx   # 当前工作空间详情与记录控制
│   │   ├── WorkspaceHistoryView.jsx # 历史工作空间加载、删除和导出
│   │   ├── WorkspaceCreateModal.jsx
│   │   ├── RecordingControls.jsx
│   │   ├── OfflineMapView.jsx   # 离线地图列表、圈选和层级下载
│   │   ├── SettingsView.jsx    # 保活、省电与离线地图入口
│   │   ├── PoiModal.jsx
│   │   └── ActionModal.jsx
│   ├── hooks
│   │   ├── useTrailRecorder.js # GPS 采样、统计、快照与前后台策略
│   │   ├── useCompassHeading.js # 设备方向传感器、权限与航向平滑
│   │   ├── useNotifications.jsx
│   │   ├── usePersistentState.js
│   │   └── useBattery.js
│   └── services
│       ├── contourTileLayer.js # Terrarium 解码与等高线绘制
│       ├── mapLayers.js        # 底图配置、瓦片缓存和下载 URL
│       ├── storage.js          # IndexedDB 瓦片/会话存储
│       ├── gpx.js              # GPX/KML 解析和 GPX 导出
│       ├── workspaces.js       # 工作空间模型、统计与旧数据迁移
│       ├── offlineMaps.js      # 离线区域、层级瓦片计划和下载
│       ├── geo.js              # 距离、时间格式化
│       └── keepAlive.js        # 音频与 Web Lock 保活
└── path/                       # 本地示例轨迹（默认被 .gitignore 忽略）
```

## 地图与等高线实现

旧版把高德 GCJ-02 底图与 OpenTopoMap 的 WGS84 地形瓦片混用，导致轨迹、底图和等高线存在坐标偏移；同时 OpenTopoMap 在当前网络环境下可能长期挂起，出现“一直加载但不出等高线”的现象。

当前实现统一使用 WGS84 图源：

- 底图：Esri World Imagery 与 Esri Reference Labels。
- 等高线：AWS Terrain 的 Terrarium 高程瓦片。
- 高程解码：`elevation = R * 256 + G + B / 256 - 32768`。
- 等高线生成：浏览器内使用 Marching Squares 从高程栅格生成等值线，区分 50 米间隔线与整百米主等高线。
- 显示层级：底图 → 路名标注 → 等高线 → 轨迹/路标。

等高线不是预先绘制的图片，而是根据当前视野中的地形瓦片即时生成。初次进入或切换到未缓存区域时需要联网；生成成功的瓦片会进入 IndexedDB。

OpenStreetMap 官方瓦片在当前浏览器验证环境中请求会长期挂起，部分客户端还会收到访问拦截瓦片，因此 1.0.0 已移除 OSM 图层与图源切换入口，仅保留 Esri 卫星底图。旧本地设置中的 `osm` 会自动回退为 Esri。

### 等高线阅读

- 白灰色细线：50 米间隔。
- 黄色线：整百米主等高线。
- 线上的 `m` 标注表示该等高线海拔，例如 `2200m`。
- 右侧面板可调整等高线透明度；提高数值可让线条更明显。

## 数据与存储

- `localStorage`
  - `trail_workspaces`：全部轨迹工作空间（目标路径、已走轨迹和标注点位）
  - `trail_active_workspace_id`：当前加载的工作空间
  - `trail_offline_maps`：离线地图区域、层级和下载状态
  - `trail_map_source`：上次使用的底图
  - `trail_contour_enabled` / `trail_contour_opacity`：等高线开关和透明度
  - `trail_low_power` / `trail_audio_keepalive`：省电与保活设置
- IndexedDB：`TrailGuardianDB`
  - `tiles`：地图与高程瓦片缓存
  - `active_session`：未完成轨迹快照

旧版的 `trail_saved_tracks` 与 `trail_pois` 会在首次启动时迁移为工作空间，原键不再作为当前数据源。所有工作空间、点位、离线地图和设置都保存在浏览器本地，不会上传到服务器。

## GPX / KML

在“轨迹”页的“目标运动路径”卡片中导入 GPX/KML。目标路径是可选的，不导入也可以直接记录已走路径。重新导入会替换当前目标路径；文件中的标注点会加入当前工作空间。导入轨迹点后会自动切换到地图并缩放到目标路径范围。

### GPX 标注点

- 导入 GPX 时，轨迹点读取 `<trkpt>`，独立标注点读取顶层 `<wpt>`。
- 标注点的 `name`、`cmt`、`desc`、`sym`、`type` 会转换为应用内的路标；根据关键词自动识别营地、水源、危险点和观景台，无法识别的标注归入“其他标注”。
- 导入成功后，标注点进入当前工作空间的 `pois`，可在工作空间详情中定位或删除。
- 导出 GPX 时，当前全部路标会写成标准 `<wpt>`，与 `<trk>` 并列；每条路标包含名称、备注、`sym`、`type`，存在高程和时间时也会一并写入。
- 导出已走轨迹时会携带当前工作空间的全部标注点，而不是所有历史工作空间的点位。

仓库工作区中的 `path/2022-01-15 16 54 49.gpx` 可用于本地验证 878 个轨迹点和 1 个 `<wpt>` 标注点的导入。该目录默认被 `path/.gitignore` 排除。

## 离线缓存

离线地图从“设置 → 离线地图”进入，与保活设置分开管理：

1. 点击“添加”，进入“选择下载区域”；也可从工作空间详情的“下载离线地图”按钮直接进入，并自动定位、显示目标路径。
2. 在地图上点击至少 3 个点圈定区域，支持撤销、下一步和重置。
3. 填写离线地图名称，勾选 1 - 18 级下载层级，可选同时下载等高线高程数据。
4. 确认后在列表中查看瓦片数量、预计体积、下载进度和完成状态；可删除单个区域或清空全部离线地图。

当前工作空间已有已下载的离线地图时，工作空间详情中的按钮会变为“重新下载”，并预填原区域、名称和层级；确认后会替换旧离线包，避免重复堆积。

单次离线包上限为 6000 张瓦片，选区过大或层级过多时会阻止下载。瓦片缓存依赖各图源允许浏览器 CORS 读取；若某个瓦片源拒绝跨域，仍可在线显示，但可能无法写入离线缓存。

## 浏览器与权限

- 推荐 Chrome / Edge / Safari 的较新版本。
- 定位功能需要浏览器授权。生产环境应使用 HTTPS；`localhost` 开发环境也可正常请求定位。
- 设备方向指南针需要“运动与设备方向”权限，并依赖手机传感器。坐标定位仍由 GPS 提供，指南针方向不会使用 GPS 行驶方向替代。
- 息屏保活受移动端浏览器和系统省电策略限制，静音音频与 Web Locks 只能提高后台存活概率，不能保证所有设备完全不被系统冻结。

## 常见问题

**地图是深色空白**

检查网络是否能访问 Esri 和 AWS S3。底图完全加载前会显示深色背景。OSM 图层已移除，当前仅提供 Esri 卫星底图。

**指南针箭头方向不变化**

确认已允许浏览器访问设备方向权限，并确认手机具备罗盘传感器。iPhone 首次点击页面时通常会出现权限提示；若使用局域网 HTTP 地址，浏览器可能限制传感器或定位权限，建议改用 HTTPS。

**等高线一直显示“正在生成”**

首次加载需要请求高程瓦片并逐块计算。若网络不可达，面板会转为“地形数据加载失败，请检查网络”。确认可访问 `s3.amazonaws.com/elevation-tiles-prod`。

**等高线透明度太低**

在左上角地图面板中调高“强度”滑块，或关闭后重新开启等高线。

**GPS 没有轨迹点**

确认定位权限已开启，并在户外获得足够卫星精度。记录逻辑会过滤精度差于 50 米的点。

**离线区域无图**

离线包只覆盖圈选范围与所选层级。请回到对应区域并保持在已缓存层级内；删除离线地图会同时删除该区域对应瓦片。

## 脚本

```bash
npm run dev      # 开发服务器
npm run build    # 生产构建
npm run preview  # 预览生产构建
```
