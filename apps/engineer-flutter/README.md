# 智修工工程师 Flutter 实机测试版

此项目为工程师端原生迁移（0.2.0+3），复用现有 HTTPS API、身份、企业隔离与物联网数据；不嵌入 H5。独立包名 `com.zhixiugong.engineer.pilot`，可与当前 H5 App 共存。

## 本轮范围

- 登录及系统安全存储会话；退出或会话失效清空页面数据。
- 工作台、接单、工单、学习、我的五个保留状态的主页面。
- 企业抢单/指派接受、平台接单；企业和平台两套状态流分别处理。
- 工单详情、开始服务、报价、完工报告；企业完工签名和最多两张压缩相册照片。
- 培训列表与报名、工程师状态及收益读取。
- 当前任务设备的指标、平滑趋势图、24小时/7天/30天选择与告警；15秒读取，后台暂停，保留权限限制。

写操作不自动重试；报价/完工请求失败保留输入，409由服务端拒绝过期状态。超过30秒的数据在再次进入页面时更新，同时保留已显示内容。后端无数据时显示空状态，不补造曲线。

## 开发

锁定 Flutter 3.50.1、Dart 3.14，依赖版本见 pubspec.lock。现有 SDK 位于仓库忽略的 `.local-preview/flutter-tools/flutter`。

在本目录运行 `flutter pub get`、`flutter analyze`、`flutter test --concurrency=1`。接口默认 `https://43.139.91.94:8442/api`，可通过 `--dart-define=API_BASE=https://.../api` 设置，禁止明文 HTTP 和证书校验绕过。

运行 `flutter run` 进行本地热重载。Android `flutter build apk --release --target-platform android-arm64 --split-per-abi`；iOS 需 macOS，CI工作流 `.github/workflows/flutter-engineer.yml` 提供普通沙盒AOT包及TrollStore归档。

## 安装与边界

iOS最低15.0；IPA仅用于现有TrollStore测试路径，不是App Store/普通侧载签名。Android产物在本机使用稳定演示证书重签后交付；商用发行需单独正式签名管理。

Flutter代码变更通常需要覆盖安装；后端逻辑与数据更新仍直接生效。不要将现有H5的云端更新机制误认为Flutter热更新。

当前是实机验收版。AI助手（流式、停止、新对话及按企业隔离）、移动仓领退料/收货/寄回/工单用料/库存流水、接单资料与申请审核、收益明细、历史服务、培训详情与报名记录、工程师名片、企业资料、受权照片图库、设备档案、相机扫码/相册识别/手动输入、电话和地图入口均为 Flutter 页面或系统原生能力。平台及企业现场照片使用现有 market/visual 权限接口，不借用客户上传权限。

后台未配置模型密钥时AI明确提示不可用，不生成伪回复。当前保持原业务的刷新机制，没有接入 APNs/FCM 系统推送（需要独立平台配置）；不能把页面迁移称为系统推送已交付。客户端及两个管理端继续使用现有版本。

真实短信/支付未接入，沿用现有演示登录。手机实际启动、Keychain、相册、签名、弱网与前后台体验需真机确认。14项自动化已覆盖API鉴权与并发、状态动作、保留页面、失败保留表单、扫码链接校验、仓储企业范围及SSE分段解析等；云端只读联调已通过登录、五页数据、工单详情和授权设备指标。没有修改既有云端工单来假装完成端到端验收。


## 页面对应（工程师端）

| 原页面 | Flutter 页面 |
|---|---|
| workbench / opportunities / platform-orders / learning / profile | 保留状态的五个主页面 |
| tasks / grab / platform-order / task-detail | 统一工单列表、企业/平台接单及各自详情流程 |
| quote / signature | 报价、完工报告及客户签名 |
| inventory | 移动仓、领退料、收发确认、工单消耗与流水 |
| ai-assistant / repair-assist | 流式AI对话、人工事实报告整理 |
| market-profile / register | 接单资料与审核、工程师申请 |
| stats / history | 收益提成明细、历史服务记录 |
| company / engineer-info | 企业资料、工程师名片与照片 |
| device-detail / iot/monitor | 当前任务设备档案、监控、趋势与授权图库 |
| visual-gallery相关入口 | 原生受权图库，拍摄/相册上传及本人有权删除 |

扫码不会打开任意外链或改变设备归属；仍由后端校验当前任务权限。iOS15+/Android7+ARM64最低要求保持不变。用新包覆盖现有Flutter试用版即可，不覆盖H5版。

## 0.2.1 登录连接兼容性修复

iOS 改用 Dart 官方 cupertino_http（Foundation URLSession），沿用系统证书验证以及代理/VPN配置；普通请求、上传、图片和AI流式请求使用同一客户端选择规则。登录失败可展开无凭据的系统错误详情。编译与 Apple 主机联网验证不替代出问题 iPhone 的覆盖安装验收。
