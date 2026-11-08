# IoT contracts

设备标识以 identity.assets.id 为准；它与客户页面使用的 identity.resources.id 通过 tenant_id/local_id 映射，不能交换使用。

HTTP 入口：POST /iot/ingest（业务后端），或 POST /telemetry（独立 HTTP 接入进程）。请求头 X-Device-Key 是单台设备凭证，只保存哈希，不可使用二维码代替。设备不能指定任意租户。

消息 v1：{assetId, sampleId: UUID, recordedAt: ISO timestamp, values: {metricKey: finiteNumber}}。sampleId 相同且内容相同返回 duplicate；同编号不同内容拒绝。记录采集/接收双时间，旧消息不覆盖最新值。

业务侧：GET /iot/context、/iot/devices、/iot/devices/:id、/iot/devices/:id/history、/iot/alarms。平台另有 /iot/tenants、POST /iot/subscriptions。企业使用 POST /iot/devices 接入，/config 配置，/credential 轮换凭证，/members 授权员工。

个人手机号企业身份通过 workspace=tenantId 选择，必须存在服务端成员授权。企业桌面 access token 自带租户身份，不能由 workspace 改换租户。所有实时订阅重复检查账号/成员及企业开通状态。

告警转单：POST /iot/alarms/:id/ticket {city,address,note}，人工确认后生成现有平台服务单，保留告警快照并按原有三类售后路由。此入口不自动生成合同工单、不绕过合作确认与工程师资质。


列表查询：/iot/devices 接受 page、pageSize（最多100）、search、status、province，返回 devices/total/page/pageSize。/iot/alarms 带 page 时返回 alarms/total/page/pageSize，可附 deviceId。/iot/overview 接受同样的筛选，统计与地区聚合覆盖全部匹配记录，不依赖当前页。实时 watch 可携带 query 和 watchId；推送对应分页及汇总，并持续重新验证权限。

规则调整或设备停用会结束当前规则的活动告警，保留 RULE_CHANGED/DEVICE_DISABLED 原因；新规则从后续消息重新累计持续时间。设备长时间离线后恢复上报会重置持续计时，避免断连时间被误算为连续超限。

原始历史数据由独立IoTMaintenance模块按企业保留天数定期清理；告警和服务单快照不随原始样本过期删除。逐指标最近采集时间为 metricTimes，latestAt 是本设备最近一次采集时间，lastReceivedAt 是服务端接收时间。


平台汇总：GET /iot/companies（仅平台身份），接受 page/pageSize/search/status/province/companyId，返回企业级 total/online/onlineRate/alarms/offline/never/disabled。设备和统计查询支持 companyId，与原有权限范围取交集；/iot/overview 在平台身份下附带最多6台 attention，用于异常关注区域，不替代完整告警列表。


2026-11-08身份规则更新：POST /iot/mobile-login 在验证码或密码验证成功后返回 mobile.type/customer|enterprise、mobile.next、workspaces。GET /iot/mobile-context 重新查询当前授权。单企业直接进入工作台，多企业仅选择企业；普通客户没有任何设备遥测、趋势、告警访问权限，即使绑定设备或传入workspace也不能绕过。原普通客户公开指标能力停用。工程师任务诊断和企业人员授权继续保留。
