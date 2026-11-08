# 客户端视觉素材

使用内置 image_gen 生成，原图保存在 `originals/`，网页使用 `apps/customer-app-web/media/service-visuals/` 中的 WebP。共 9 张网页图片，合计约 387 KiB；原图不在页面直接加载。

- `hero`：激光设备车间，客户端首页主视觉。
- `device-cutting`、`device-welding`、`device-marking`：三类设备的默认类型示意。
- `service-repair`、`service-maintenance`、`service-installation`、`service-inspection`：维修、保养、安装、检测场景。
- `service-welding`：焊接设备诊断专用图，与大型切割机维修图分开。六种服务分类均有独立的默认配图；同一分类的多个项目仍可共用类别图片。

完整生成提示词见 `manifest.json`。统一风格为冷中性工业摄影、蓝灰色设备、自然光、整洁车间，无品牌标识。网页图片由原图等比缩小、转换 WebP，未通过程序重绘内容。

首页和服务图不是实际企业现场、工程师案例或履约证据；设备图不代表客户所绑定设备的真实外观。界面显示“AI 场景示意”“类型示意”等标识。未知设备类型保留图标，不擅自认作某类设备。

`visual-media.js` 集中管理类型映射、图文组件和加载失败回退，`visual-media.css` 管理展示比例。图片从本地加载，非首屏图片延迟加载；首页主图优先加载。

浏览器验收：`node backend/test/visual-media.cjs`。设置 `VISUAL_SCREENSHOTS=1` 可临时保存首页、服务和设备页的检查截图，验收后清理。
