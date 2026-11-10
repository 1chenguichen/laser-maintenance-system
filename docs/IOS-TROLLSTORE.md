# iOS TrollStore 局域网演示包

## 使用前提

这是客户端、工程师端的 iOS 原生 WebView 外壳，内置现有页面资源。面向已经正常安装 TrollStore 的个人测试设备；不是 App Store、TestFlight 或普通苹果开发者证书签名包。

构建要求 macOS + Xcode 的 iPhoneOS SDK。GitHub Actions 使用标准 `macos-15` runner，编译 arm64 Mach-O，以本地 ad-hoc 方式签名后生成 IPA，不需要上传 Apple 账号、证书或签名私钥。TrollStore 安装时负责相应的重签名。仍需实际安装验证，不能将云端编译通过等同于手机可运行。

当前最低部署版本设置 iOS 14.0。TrollStore 支持范围以其官方说明为准，并非任何 iOS 14 以上系统都支持。请先记录自己的 iPhone 型号、系统精确版本和 TrollStore 版本。

## GitHub 构建和下载

首次提交可在自己的 CMD 运行项目根目录 `build-ios-github.cmd`。脚本只把列明的 iOS 源码与手机端样式提交到新的隔离分支，不提交其他本地改动，也不合并 master。上传成功后：

1. 在仓库的 Actions 页面打开 **iOS TrollStore demo IPA**。
2. 若本次推送已触发构建，等待其完成；或在支持该流程的分支上选择 Run workflow。
3. `backend_url` 填电脑局域网后端根地址，例如 `http://192.168.0.100:8180`，后续也能在 App 内修改。
4. 构建成功后，在本次运行的 Artifacts 下载 `ios-trollstore-ipas-运行编号`。
5. 解压下载的 ZIP，其中应有：
   - `laser-customer-2.0.0-trollstore.ipa`
   - `laser-engineer-2.0.0-trollstore.ipa`
   - `build-report.json` 与此安装说明
6. 将 IPA 传到 iPhone 的“文件”，通过已安装的 TrollStore 打开并安装。不能用 Android APK，也不能把普通 IPA 下载当成系统直接安装。

产物设置保留 7 天，过期可重新运行。公开仓库标准 runner 的计算时间依 GitHub 当前规则免费；私有仓库额度和产物存储需查看账号计费设置，不创建大型付费 runner。

## 后端与首次启动

手机和电脑连接同一局域网，电脑的 PostgreSQL、Redis 和后端保持运行。已运行的服务不重复启动；需要启动时使用 `start-preview.cmd`。

打开 App 的“连接设置”，先测试连接，再保存。首次访问局域网或相机时，允许对应权限。电脑换 IP 后在 App 内修改后端地址；改变后端会清除本 App 的 Web 登录状态。

- 后端通常为 `http://电脑局域网IP:8180`。
- 不依赖电脑上的 3101、3102 网页服务，也不依赖 cpolar。
- 页面和图片内置，修改网页代码后需要重新构建 IPA 并覆盖安装。
- 两个 App 的账号缓存、包名和本地页面端口独立，业务数据仍由同一套后端授权。
- WKWebView 本地服务器只绑定 `127.0.0.1`，仅提供包内静态文件，不暴露电脑目录或数据库。

## 本版原生功能及限制

提供顶部返回、iOS 侧滑返回、连接设置与测试、设备二维码原生相机扫描。扫描结果交给已有客户页面识别设备，不在原生层更改业务归属。照片选择和上传继续使用 WKWebView 的系统文件选择能力，须真机实测。

不申请 TrollStore 提供的越狱、无沙盒、root 或进程注入权限；不因使用 TrollStore 而扩大业务数据权限。iOS 外壳仍按普通 App 的数据隔离设计。

相机扫描只接收包内主页面发起的请求。外部页面链接先确认再交给外部应用，不在内置 WebView 中加载任意外部网站。局域网 HTTP 仅用于演示，不代表生产部署通过安全验收。

## 需在手机确认

安装与启动；本地网络权限允许和拒绝；连接测试；客户和工程师登录；报修—指派—处理—确认的数据互通；返回和输入法；照片选择上传；相机允许、拒绝和二维码识别；切换后端清除登录；退出重开后的状态。

若安装失败，请记录 iOS 精确版本、TrollStore 错误文字与构建编号。若启动失败，区分系统拒绝启动与应用内连接错误；后者先检查电脑 IP、后端和防火墙。

## 本地维护

Windows 上先做资源、配置准备检查：

```cmd
python scripts\ios\build-ipas.py --prepare-only --output .local-preview/ios-prepare
```

macOS 上实际打包：

```sh
python3 scripts/ios/build-ipas.py --server http://192.168.0.100:8180
```

生成目录为 `outputs/ios`。原生源码 `apps/ios-shell/Main.m`；无需 Flutter、CocoaPods 或额外第三方 iOS SDK。工作流只上传 IPA 与说明，不上传数据库、环境变量文件、登录令牌、Android 签名材料或运行缓存。

参考：[TrollStore 官方项目](https://github.com/opa334/TrollStore)、[GitHub 标准托管 Runner](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)。

## 内置页面 Not found 修正

修正了 Apple 平台路径别名与真实路径比较不一致、控制字符验证脆弱的问题。AssetServer 单独抽成可共享的原生实现；云端在编译 IPA 前会用相同代码开启本地 HTTP 服务，针对实际包内页面、脚本、样式、图标字体执行读取校验，并检查符号链接越界、编码路径和 HEAD 请求。新增 `customer-asset-server-test.json`、`engineer-asset-server-test.json` 随构建产物提供。

若已有旧 IPA 显示 Not found，需安装修正后的新包；后端测试成功不等于内置页面服务正常，不能只修改连接地址来解决。
