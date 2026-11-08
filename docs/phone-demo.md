# 同一 Wi-Fi 手机演示

手机与电脑连接同一个普通 Wi-Fi（访客网络可能隔离设备）。电脑保持开启，数据库、Redis 和后端预览保持运行。

双击项目根目录 `phone-preview.cmd`，启动独立的手机预览服务：

- 客户端：电脑局域网 IP 的 4101 端口。
- 工程师端：电脑局域网 IP 的 4102 端口。
- 两端接口：同一电脑的 8180 端口。

二维码、链接及本地展示页生成在 `.local-preview/phone-demo/`。其中 `index.html` 可在电脑浏览器打开，供手机扫描；手机扫码后使用浏览器打开。
二维码不含登录凭据，不会自动登录。该文件夹是演示入口资产，不属于待清理截图。

更换 Wi-Fi 或电脑 IP 后，关闭手机预览窗口，再次运行启动脚本，重新生成二维码。
关闭脚本进程会停止手机入口。现有 3100–3103 本机预览不受影响，管理后台不会通过手机脚本开放。

若二维码工具目录被删除，需要重新安装依赖；在项目根目录运行：

```powershell
$env:npm_config_cache='D:\26-10-25codex\laser-maintenance-system\.local-preview\npm-cache'
npm install --no-save --package-lock=false --ignore-scripts --prefix .local-preview/phone-tools qrcode
```

访问失败时先核对 Wi-Fi、电脑当前 IP 及后台进程；Windows 防火墙需要允许 Node.js 入站访问。无需关闭防火墙。
