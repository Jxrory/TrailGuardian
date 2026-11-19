# 野径户外助手 · TrailGuardian

一个面向户外徒步、越野与登山场景的 React 单页应用，提供卫星地图、等高线、GPS 轨迹记录、GPX 导入导出、兴趣点打点和离线瓦片缓存。

## 功能

- **地图与等高线**：Esri 卫星底图 / OpenStreetMap 标准图切换，可调节等高线叠加强度。
- **本地等高线生成**：基于 AWS Terrain（Mapzen Terrarium）高程瓦片，在浏览器中实时生成 50 米间隔等高线；整百米等高线使用黄色强调并显示高程标注。
- **轨迹记录**：实时 GPS 采样、距离、耗时、累计爬升与当前海拔统计，支持暂停/继续/结束保存。
- **GPX / KML**：导入轨迹并自动缩放地图；当前轨迹和历史轨迹可导出为 GPX。
- **路标管理**：营地、水源、危险点、观景台四类兴趣点，支持地图打点、筛选、定位和删除。
- **离线缓存**：底图、路名标注和等高线地形瓦片缓存到 IndexedDB，断网后可直接加载已缓存区域。
- **息屏保活**：静音音频轨道和 Web Locks 组合保活，并提供低功耗/静止休眠采样策略。
- **断点恢复**：记录过程中自动保存快照，意外关闭后可恢复未完成轨迹。

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
│   │   ├── AppHeader.jsx       # 电量、功耗和运动状态
│   │   ├── BottomNav.jsx
│   │   ├── MapView.jsx         # 地图、图层、轨迹线、路标和等高线 UI
│   │   ├── TrackView.jsx       # 记录统计、GPX、历史轨迹
│   │   ├── PoiView.jsx         # 路标列表与筛选
│   │   ├── SettingsView.jsx    # 保活、省电和离线瓦片下载
│   │   ├── PoiModal.jsx
│   │   └── ActionModal.jsx
│   ├── hooks
│   │   ├── useTrailRecorder.js # GPS 采样、统计、快照与前后台策略
│   │   ├── useNotifications.jsx
│   │   ├── usePersistentState.js
│   │   └── useBattery.js
│   └── services
│       ├── contourTileLayer.js # Terrarium 解码与等高线绘制
│       ├── mapLayers.js        # 底图配置、瓦片缓存和下载 URL
│       ├── storage.js          # IndexedDB 瓦片/会话存储
│       ├── gpx.js              # GPX/KML 解析和 GPX 导出
│       ├── geo.js              # 距离、时间格式化
│       └── keepAlive.js        # 音频与 Web Lock 保活
└── path/                       # 本地示例轨迹（默认被 .gitignore 忽略）
```

## 地图与等高线实现

旧版把高德 GCJ-02 底图与 OpenTopoMap 的 WGS84 地形瓦片混用，导致轨迹、底图和等高线存在坐标偏移；同时 OpenTopoMap 在当前网络环境下可能长期挂起，出现“一直加载但不出等高线”的现象。

当前实现统一使用 WGS84 图源：

- 底图：Esri World Imagery、Esri Reference Labels、OpenStreetMap。
- 等高线：AWS Terrain 的 Terrarium 高程瓦片。
- 高程解码：`elevation = R * 256 + G + B / 256 - 32768`。
- 等高线生成：浏览器内使用 Marching Squares 从高程栅格生成等值线，区分 50 米间隔线与整百米主等高线。
- 显示层级：底图 → 路名标注 → 等高线 → 轨迹/路标。

等高线不是预先绘制的图片，而是根据当前视野中的地形瓦片即时生成。初次进入或切换到未缓存区域时需要联网；生成成功的瓦片会进入 IndexedDB。

### 等高线阅读

- 白灰色细线：50 米间隔。
- 黄色线：整百米主等高线。
- 线上的 `m` 标注表示该等高线海拔，例如 `2200m`。
- 右侧面板可调整等高线透明度；提高数值可让线条更明显。

## 数据与存储

- `localStorage`
  - `trail_saved_tracks`：历史轨迹
  - `trail_pois`：兴趣点
  - `trail_map_source`：上次使用的底图
  - `trail_contour_enabled` / `trail_contour_opacity`：等高线开关和透明度
  - `trail_low_power` / `trail_audio_keepalive`：省电与保活设置
- IndexedDB：`TrailGuardianDB`
  - `tiles`：地图与高程瓦片缓存
  - `active_session`：未完成轨迹快照

所有轨迹、路标和设置都保存在浏览器本地，不会上传到服务器。

## GPX / KML

在“轨迹”页点击“导入 GPX/KML”即可加载文件。导入后会自动切换到地图并缩放到轨迹范围。历史轨迹可通过下载按钮导出为 GPX。

仓库工作区中的 `path/2022-01-15 16 54 49.gpx` 可用于本地验证 878 点轨迹导入与等高线叠加。该目录默认被 `path/.gitignore` 排除。

## 离线缓存

在“保活/离线”页：

1. 将地图移动到需要离线使用的区域。
2. 点击“批量下载当前区域离线包”。
3. 应用会缓存当前底图、路名标注和已开启的等高线高程瓦片。

单次下载上限为 900 张瓦片，视野过大时会提示先放大地图。瓦片缓存依赖各图源允许浏览器 CORS 读取；若某个瓦片源拒绝跨域，仍可在线显示，但可能无法写入离线缓存。

## 浏览器与权限

- 推荐 Chrome / Edge / Safari 的较新版本。
- 定位功能需要浏览器授权。生产环境应使用 HTTPS；`localhost` 开发环境也可正常请求定位。
- 息屏保活受移动端浏览器和系统省电策略限制，静音音频与 Web Locks 只能提高后台存活概率，不能保证所有设备完全不被系统冻结。

## 常见问题

**地图是深色空白**

检查网络是否能访问 Esri 和 AWS S3。底图完全加载前会显示深色背景。

**等高线一直显示“正在生成”**

首次加载需要请求高程瓦片并逐块计算。若网络不可达，面板会转为“地形数据加载失败，请检查网络”。确认可访问 `s3.amazonaws.com/elevation-tiles-prod`。

**等高线透明度太低**

在左上角地图面板中调高“强度”滑块，或关闭后重新开启等高线。

**GPS 没有轨迹点**

确认定位权限已开启，并在户外获得足够卫星精度。记录逻辑会过滤精度差于 50 米的点。

**离线区域无图**

离线包只覆盖下载时的视野和缩放级别。请回到对应区域并保持在已缓存层级内。

## 脚本

```bash
npm run dev      # 开发服务器
npm run build    # 生产构建
npm run preview  # 预览生产构建
```
