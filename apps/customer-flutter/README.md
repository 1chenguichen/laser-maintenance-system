# 智修工客户端 Flutter 0.1.0+1

原生迁移复用现有云端API、身份、设备与订单数据；不嵌入H5。

- 当前客户设计为准：蓝色#155de9、64px页头、白色内容层、五页固定导航。客户素材复用customer-app-web，不套工程师绿色。
- 首页、找服务、设备、订单、我的保留页面状态。只有首页轮播自动播放，支持暂停、离屏/后台停止。
- 手机验证码、企业账号密码登录由/iot/mobile-login验证，授权企业账号进入单独企业设备工作台；工作空间只从服务器列表选择。
- 设备档案、扫码/相册识别/手工绑定、故障照片、平台报修和有效合同报修；平台报修重试复用clientRequestId，失败保留输入。
- 平台服务单与企业维修单分别处理报价、取消、验收、演示付款、评价及退款；版本、归属和状态由服务端校验。
- 地址、合同/开票、企业资料、培训资源、服务沟通、反馈和授权设备趋势。
- 企业设备工作台含汇总趋势、分页设备/告警；告警处理遵从角色，viewer无写入入口。本轮未新增企业后台的完整成员管理、企业运营工单和监控配置编辑。

## 构建与安装

Flutter3.50.1，依赖锁定pubspec.lock。苹果iOS15+、TrollStore；安卓Android7+ARM64。独立ID com.zhixiugong.customer.pilot；显示智修工客户端·Flutter，与旧H5客户端可共存。后续Flutter界面更新通常需覆盖安装，服务器数据和业务更新直接生效。

默认API https://43.139.91.94:8441/api，iOS使用URLSession系统网络栈，保留系统证书验证，不允许不安全证书。无需电脑IP、同一局域网或访问码。

flutter analyze / flutter test --concurrency=1 / flutter build apk --release --target-platform android-arm64 --split-per-abi。CI见.github/workflows/flutter-customer.yml，苹果包为普通沙盒AOT发布构建，用TrollStore安装，并非AppStore发行签名。

真实支付、短信及系统推送未在本轮新增。付款明确标为演示；AI和人工客服回复沿用真实后台结果，不伪造模型回答。相机、相册、系统地图、Keychain、弱网和原生实机体验需手机验收。
