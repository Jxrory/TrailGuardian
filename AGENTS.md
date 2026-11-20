# TrailGuardian Agent 协作约定

本文件面向在本仓库工作的开发 Agent。开始修改前先阅读本文件、`VERSION.md` 和 `README.md`，并以当前代码实现为准。涉及 Android Kotlin 原生重做时，还必须先阅读 `docs/ANDROID_NATIVE_SPEC.md`。

## Android 原生重做

- 目标形态为仅 Android 的 Kotlin + Jetpack Compose 原生 App；当前 React / Web 版本是实现行为和交互语义的基线。
- 重做规格、数据模型、记录算法、地图/离线地图规则和验收标准以 `docs/ANDROID_NATIVE_SPEC.md` 为准。
- Android 后台轨迹必须使用前台定位服务并持久化点位，不得移植静音音频、Web Locks 或“页面隐藏后停止采样”的 Web 保活方案。
- Web 端的 LocalStorage / IndexedDB 不会被 Android 自动读取；无损迁移需要先设计导出导入格式。
- 迁移完成前不要删除或弱化 Web 版本，除非用户明确要求下线。

## 项目定位

- 产品名称：野径户外助手 / TrailGuardian。
- 技术栈：React 19、Vite 7、React Leaflet 5、Leaflet 1.9、Tailwind CSS 4。
- 形态：面向手机的户外轨迹单页应用。
- 核心模型：每次外出计划对应一个“轨迹工作空间”，所有记录、路径和点位都必须归属于工作空间。
- 当前正式版本：`1.0.0`。

## 常用命令

```bash
npm install
npm run dev
npm run build
npm run preview
```

- 手机联调需要监听局域网时使用：`npm run dev -- --host 0.0.0.0 --port 5173`。
- 仓库没有自动化测试套件。完成修改后至少执行 `npm run build` 和 `git diff --check`。
- 涉及手机布局、地图或传感器时，优先额外使用移动端视口做实际渲染验证。

## 目录与职责

- `src/App.jsx`：应用状态、页面切换和跨模块业务编排。
- `src/components/MapView.jsx`：地图底图、等高线、路径、点位、定位指南针和地图浮层。
- `src/components/WorkspaceView.jsx`：当前工作空间详情、记录控制和离线地图入口。
- `src/components/WorkspaceHistoryView.jsx`：历史工作空间管理。
- `src/components/OfflineMapView.jsx`：离线地图圈选、层级下载和列表管理。
- `src/hooks/useTrailRecorder.js`：GPS 采样、轨迹统计、快照与前后台策略。
- `src/hooks/useCompassHeading.js`：设备方向传感器、权限请求和航向平滑。
- `src/services/`：地图、存储、GPX/KML、工作空间、离线地图等领域逻辑。
- `src/styles.css`：Tailwind 引入、Leaflet 覆盖样式和自定义地图标记样式。

## 产品与交互习惯

- UI 文案使用简体中文，代码标识符保持英文。
- 保持现有深色 slate / emerald 视觉体系，不引入与现有界面冲突的配色或组件库。
- 地图信息入口固定在左上角，默认折叠；右上角只保留定位和打点等地图操作。
- 目标运动路径使用蓝色虚线，已走路径使用绿色实线，颜色语义不得反转。
- 没有加载工作空间时，不提供轨迹记录、目标路径或点位写入操作。
- 底部导航固定为“地图 / 轨迹 / 历史轨迹 / 设置”。
- 手机交互优先，按钮触控区域、浮层遮挡和窄屏布局必须实际检查。
- 图标优先复用 Font Awesome 和现有样式，不额外引入图标依赖。

## 地图与传感器约束

- 当前只保留 Esri 卫星底图和 Esri 标注图层。
- 不要重新引入 OSM 官方瓦片，除非已在目标浏览器上验证可以稳定加载且符合使用政策。
- 本地存储中可能残留旧值 `osm`；读取时必须通过 `getMapSource()` 回退到 Esri。
- 指南针方向只能使用设备方向传感器：iPhone 使用 `webkitCompassHeading`，Android 使用 absolute orientation。
- GPS 只负责位置、速度和海拔，不得用 GPS 行驶方向模拟“手机面向方向”。
- 设备方向角度可能跨越 `0°/360°`。更新 CSS 旋转时必须使用连续展开角度或最短角差，不得直接对归一化角度做 transition。
- 设备方向权限必须由用户手势触发；权限不可用或拒绝时保持未知方向。
- 地图底图、路名、等高线、轨迹和图标的显示顺序不得改变。

## 数据与兼容性

- LocalStorage 键名是持久化接口，未经迁移方案不得重命名或改变结构。
- 关键键包括 `trail_workspaces`、`trail_active_workspace_id`、`trail_offline_maps`、`trail_map_source` 和等高线/省电设置。
- 工作空间结构：`{ id, name, createdAt, updatedAt, targetTrack, recordedTrack, pois }`。
- IndexedDB 中 `tiles` 保存地图和高程瓦片，`active_session` 保存未完成轨迹快照。
- 修改数据结构时必须保留旧数据迁移逻辑，并在 `VERSION.md` 的“兼容性”中记录。
- 删除工作空间、离线地图或瓦片前必须考虑正在进行中的记录和当前加载状态。

## 代码习惯

- 先阅读相关实现和调用链，再做最小范围修改；不做与当前需求无关的重构。
- 使用 `apply_patch` 修改文件，不使用覆盖式脚本重写源码。
- 除非必要，不添加解释性注释；让命名和结构表达意图。
- 复用既有工具函数、组件和样式体系，避免引入重复抽象。
- 不新增依赖，除非现有能力确实无法完成任务。
- 不添加版权或许可证头。
- 不修复未被要求处理的无关问题；发现时在最终说明中提示即可。
- 修改后不要重复读取文件验证补丁是否生效，依赖工具结果和最终构建。

## 验证习惯

- 先做与改动最接近的验证，再做生产构建。
- 地图和布局改动至少检查：初始折叠状态、展开状态、窄屏遮挡、图源加载。
- 指南针改动至少验证：未知方向、普通方向、跨正北、权限不可用。
- 手势和地图交互改动应使用移动端触控视口检查。
- 发现构建或验证中的无关失败，不擅自扩大修改范围。

## 版本、提交与推送

- 发布版本使用语义化版本号，并同步更新 `VERSION.md`、`package.json`、`package-lock.json`。
- 新功能、修复和兼容性变化必须写入 `VERSION.md`。
- 提交信息使用中文，建议前缀为 `feat:`、`fix:`、`docs:`、`refactor:`、`chore:`。
- 默认直接在用户当前分支工作；只有用户明确要求时才创建新分支。
- 只有在用户明确要求“提交/推送”时才执行 `git commit` 或 `git push`。
- 提交前检查 `git status`，只暂存本次任务相关文件，并再次执行构建与 `git diff --check`。
- 推送后确认工作区干净，并在最终回复中报告提交哈希和推送结果。

## 文档维护

- 功能、命令、数据结构或已知限制变化时同步更新 `README.md`。
- 用户可见版本变化同步更新 `VERSION.md`。
- 长期有效的开发习惯变更同步更新本文件。
- 临时调试信息、个人路径和一次性测试数据不得写入长期文档。
