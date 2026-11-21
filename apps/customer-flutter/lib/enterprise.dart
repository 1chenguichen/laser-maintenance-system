import 'dart:async';

import 'package:material_ui/material_ui.dart';

import 'api.dart';
import 'common.dart';
import 'iot_screen.dart';

class EnterpriseShell extends StatefulWidget {
  final Api api;
  final Json mobile;
  final Future<void> Function() onLogout;
  const EnterpriseShell({
    super.key,
    required this.api,
    required this.mobile,
    required this.onLogout,
  });
  @override
  State<EnterpriseShell> createState() => _EnterpriseShellState();
}

class _EnterpriseShellState extends State<EnterpriseShell> {
  String? workspace, error;
  Json data = {};
  List<Json> devices = [], alarms = [];
  int tab = 0, page = 1, total = 0, generation = 0;
  bool loading = false;
  final query = TextEditingController();
  Timer? timer;
  List<Json> get companies => rows(widget.mobile['workspaces']);
  Json get company =>
      companies.where((c) => c['id'] == workspace).firstOrNull ?? {};
  @override
  void initState() {
    super.initState();
    if (companies.length == 1) {
      workspace = text(companies.first['id']);
      load();
    }
    timer = Timer.periodic(const Duration(seconds: 30), (_) {
      if (ModalRoute.of(context)?.isCurrent == true &&
          WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed) {
        load();
      }
    });
  }

  @override
  void dispose() {
    timer?.cancel();
    generation++;
    query.dispose();
    super.dispose();
  }

  Future<void> load() async {
    if (workspace == null || loading) return;
    final token = ++generation;
    widget.api.workspace = workspace;
    setState(() => loading = true);
    try {
      if (tab == 0) {
        final results = await Future.wait([
          widget.api.call('/iot/overview'),
          widget.api.call('/iot/analytics'),
        ]);
        if (mounted && token == generation) {
          setState(
            () => data = {'overview': results[0], 'analytics': results[1]},
          );
        }
      } else if (tab == 1) {
        final d = obj(
          await widget.api.call(
            Uri(
              path: '/iot/devices',
              queryParameters: {
                'page': '$page',
                'pageSize': '20',
                'search': query.text,
              },
            ).toString(),
          ),
        );
        if (mounted && token == generation) {
          setState(() {
            devices = rows(d['devices']);
            total = number(d['total']).toInt();
          });
        }
      } else if (tab == 2) {
        final d = obj(
          await widget.api.call('/iot/alarms?page=$page&pageSize=20'),
        );
        if (mounted && token == generation) {
          setState(() {
            alarms = rows(d['items']).isNotEmpty
                ? rows(d['items'])
                : rows(d['alarms']);
            total = number(d['total']).toInt();
          });
        }
      }
      if (mounted && token == generation) setState(() => error = null);
    } catch (e) {
      if (mounted && token == generation) setState(() => error = '$e');
    } finally {
      if (mounted && token == generation) setState(() => loading = false);
    }
  }

  void select(int value) {
    setState(() {
      tab = value;
      page = 1;
    });
    load();
  }

  Future<void> acknowledge(Json alarm) async {
    if (!await confirm(context, '记录告警处理？', '确认后会更新企业告警处理记录，不会伪造设备恢复。')) return;
    try {
      await widget.api.call(
        '/iot/alarms/${alarm['id']}/acknowledge',
        method: 'POST',
        body: {'note': '已在企业手机工作台核实，安排后续检查。'},
      );
      await load();
    } catch (e) {
      if (mounted) notice(context, e);
    }
  }

  Widget metric(String name, dynamic value, String unit) => Expanded(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(name, style: const TextStyle(color: clientMuted, fontSize: 12)),
        const SizedBox(height: 8),
        Text(
          '${text(value)} $unit',
          style: const TextStyle(
            fontSize: 24,
            fontWeight: FontWeight.w600,
            color: clientAccent,
          ),
        ),
      ],
    ),
  );
  Widget chart(String title, List<Json> rowsValue, String key) => section(
    title,
    rowsValue.isEmpty
        ? hint('所选范围暂无统计数据')
        : Column(
            children: [
              SizedBox(
                height: 180,
                child: CustomPaint(
                  painter: TrendPainter(
                    rowsValue
                        .map(
                          (r) => {
                            'at': r['at'] ?? r['day'],
                            'value': number(r[key]),
                          },
                        )
                        .toList(),
                  ),
                  child: const SizedBox.expand(),
                ),
              ),
              hint('统计由企业授权范围内的同一套设备数据汇总。'),
            ],
          ),
  );
  @override
  Widget build(BuildContext context) {
    final overview = obj(data['overview']),
        summary = obj(overview['summary']),
        analytics = obj(data['analytics']);
    return Scaffold(
      appBar: clientAppBar(
        context,
        title: const Text('企业设备工作台'),
        actions: [
          IconButton(
            tooltip: '刷新企业数据',
            onPressed: loading ? null : load,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: load,
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            DropdownButtonFormField<String>(
              initialValue: workspace,
              isExpanded: true,
              items: companies
                  .map(
                    (c) => DropdownMenuItem(
                      value: text(c['id']),
                      child: Text(
                        text(c['name']),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  )
                  .toList(),
              onChanged: loading
                  ? null
                  : (v) {
                      generation++;
                      setState(() {
                        workspace = v;
                        data = {};
                        devices = [];
                        alarms = [];
                        page = 1;
                      });
                      load();
                    },
              decoration: const InputDecoration(labelText: '选择授权企业工作空间'),
            ),
            const SizedBox(height: 12),
            Text(
              '当前权限：${const {'admin': '企业设备管理', 'operator': '告警处理', 'viewer': '仅查看'}[company['role']] ?? '待选择'}',
              style: const TextStyle(color: clientMuted),
            ),
            const SizedBox(height: 16),
            ClientSegments(
              items: const ['总览', '设备', '告警'],
              selected: const ['总览', '设备', '告警'][tab],
              onChanged: loading
                  ? null
                  : (v) => select(const ['总览', '设备', '告警'].indexOf(v)),
            ),
            const SizedBox(height: 20),
            if (loading) const LinearProgressIndicator(minHeight: 2),
            if (error != null)
              section(
                '读取提示',
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(error!),
                    TextButton(onPressed: load, child: const Text('重新加载')),
                  ],
                ),
              ),
            if (workspace == null) hint('请选择服务端授予的企业工作空间。'),
            if (tab == 0 && data.isNotEmpty) ...[
              section(
                '企业设备情况',
                Column(
                  children: [
                    Row(
                      children: [
                        metric('设备资产', overview['inventoryCount'], '台'),
                        metric('接入监测', overview['connectedCount'], '台'),
                      ],
                    ),
                    const SizedBox(height: 20),
                    Row(
                      children: [
                        metric('当前在线', summary['online'], '台'),
                        metric('未恢复告警', summary['alarms'], '条'),
                      ],
                    ),
                  ],
                ),
              ),
              chart('近24小时上报趋势', rows(analytics['activity']), 'total'),
              chart('近7日设备接入趋势', rows(analytics['growth']), 'total'),
              chart('近7日告警趋势', rows(analytics['alarms']), 'total'),
            ],
            if (tab == 1) ...[
              TextField(
                controller: query,
                onSubmitted: (_) {
                  page = 1;
                  load();
                },
                decoration: InputDecoration(
                  labelText: '搜索设备型号或SN',
                  suffixIcon: IconButton(
                    tooltip: '搜索设备',
                    onPressed: () {
                      page = 1;
                      load();
                    },
                    icon: const Icon(Icons.search),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              ...devices.map(
                (d) => Card(
                  child: ListTile(
                    title: Text(text(d['model'])),
                    subtitle: Text(
                      '${text(d['serialNumber'])}\n${text(d['city'])} · ${const {'ONLINE': '在线', 'OFFLINE': '离线', 'NEVER': '未上报', 'DISABLED': '已停用'}[d['connectivity']] ?? text(d['connectivity'])}',
                    ),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => openPage(
                      context,
                      IoTScreen(api: widget.api, deviceId: text(d['id'])),
                    ),
                  ),
                ),
              ),
              if (devices.isEmpty &&
                  !loading &&
                  workspace != null &&
                  error == null)
                hint('当前筛选范围暂无接入设备'),
            ],
            if (tab == 2) ...[
              ...alarms.map(
                (a) => section(
                  text(a['label'], text(a['metric'])),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('设备：${text(a['model'], text(a['serialNumber']))}'),
                      Text(
                        '触发：${dateLabel(a['startedAt'] ?? a['started_at'])}',
                      ),
                      Text(
                        a['recoveredAt'] != null
                            ? '状态：已恢复'
                            : a['acknowledgedAt'] != null
                            ? '状态：已记录处理，待设备恢复'
                            : '状态：未处理',
                      ),
                      if (['admin', 'operator'].contains(company['role']) &&
                          a['acknowledgedAt'] == null &&
                          a['recoveredAt'] == null)
                        TextButton(
                          onPressed: () => acknowledge(a),
                          child: const Text('记录处理'),
                        ),
                    ],
                  ),
                ),
              ),
              if (alarms.isEmpty && !loading && error == null)
                hint('当前范围暂无告警记录'),
            ],
            if (tab != 0 && workspace != null)
              Row(
                children: [
                  Expanded(
                    child: Text(
                      '共 $total 条 · 第 $page 页',
                      style: const TextStyle(fontSize: 12, color: clientMuted),
                    ),
                  ),
                  IconButton(
                    tooltip: '上一页',
                    onPressed: loading || page <= 1
                        ? null
                        : () {
                            page--;
                            load();
                          },
                    icon: const Icon(Icons.chevron_left),
                  ),
                  IconButton(
                    tooltip: '下一页',
                    onPressed: loading || page * 20 >= total
                        ? null
                        : () {
                            page++;
                            load();
                          },
                    icon: const Icon(Icons.chevron_right),
                  ),
                ],
              ),
            const SizedBox(height: 24),
            OutlinedButton(
              onPressed: widget.onLogout,
              child: const Text('退出企业身份'),
            ),
          ],
        ),
      ),
    );
  }
}
