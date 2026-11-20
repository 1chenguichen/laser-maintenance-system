# 智修工工程师 Flutter 实机测试版

此项目为工程师端首批原生迁移，复用现有 HTTPS API、身份、企业隔离与物联网数据；不嵌入 H5。独立包名 `com.zhixiugong.engineer.pilot`，可与当前 H5 App 共存。

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

当前是实机验收版，不是全部移动业务迁移完成。AI助手、移动仓领退料、消息推送、地图导航、原生扫码及其他二级页面尚未迁移；平台完工附件当前API未提供工程师上传通路，未伪造或借用客户权限接口。客户端及两个管理端继续使用现有版本。

真实短信/支付未接入，沿用现有演示登录。手机实际启动、Keychain、相册、签名、弱网与前后台体验需真机确认。自动化已覆盖API鉴权与并发、状态动作、保留页面、失败保留表单等；云端只读联调已通过登录、五页数据、工单详情和授权设备指标。没有修改既有云端工单来假装完成端到端验收。
