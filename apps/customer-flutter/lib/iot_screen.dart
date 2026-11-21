import 'dart:async';
import 'dart:math' as math;

import 'package:material_ui/material_ui.dart';

import 'api.dart';
import 'common.dart';

class IoTScreen extends StatefulWidget {
  final Api api;
  final String deviceId;
  final bool embedded;
  const IoTScreen({
    super.key,
    required this.api,
    required this.deviceId,
    this.embedded = false,
  });
  @override
  State<IoTScreen> createState() => _IoTScreenState();
}

class _IoTScreenState extends State<IoTScreen> {
  Json? device;
  List<Json> points = [], alarms = [];
  String? metric, error;
  int hours = 24;
  bool loading = false;
  Timer? timer;
  @override
  void initState() {
    super.initState();
    load();
    timer = Timer.periodic(const Duration(seconds: 15), (_) {
      if (ModalRoute.of(context)?.isCurrent == true &&
          WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed) {
        load();
      }
    });
  }

  @override
  void dispose() {
    timer?.cancel();
    super.dispose();
  }

  Future<void> load() async {
    if (loading) return;
    setState(() => loading = true);
    try {
      final d = obj(await widget.api.call('/iot/devices/${widget.deviceId}'));
      final metrics = rows(d['metrics']);
      metric ??= metrics.isEmpty ? null : text(metrics.first['key']);
      final values = await Future.wait([
        if (metric != null)
          widget.api.call(
            '/iot/devices/${widget.deviceId}/history?hours=$hours&metric=${Uri.encodeComponent(metric!)}',
          )
        else
          Future.value(<String, dynamic>{}),
        widget.api.call(
          '/iot/alarms?deviceId=${widget.deviceId}&page=1&pageSize=10',
        ),
      ]);
      if (mounted) {
        setState(() {
          device = d;
          points = rows(obj(values[0])['points']);
          alarms = rows(obj(values[1])['alarms']);
          error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = device ?? {}, metrics = rows(d['metrics']);
    return Scaffold(
      appBar: widget.embedded
          ? null
          : clientAppBar(
              context,
              title: const Text('设备运行数据'),
              actions: [
                IconButton(
                  tooltip: '刷新',
                  onPressed: loading ? null : load,
                  icon: const Icon(Icons.refresh),
                ),
              ],
            ),
      body: ListView(
        padding: EdgeInsets.all(widget.embedded ? 16 : 24),
        children: [
          if (loading) const LinearProgressIndicator(),
          if (error != null)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Text(error!),
              ),
            ),
          Text(
            text(d['model'], '设备诊断'),
            style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 8),
          Text('SN ${text(d['serialNumber'])}'),
          Text(
            '${text(d['companyName'])} · ${const {'ONLINE': '在线', 'OFFLINE': '离线', 'NEVER': '未上报', 'DISABLED': '已停用'}[d['connectivity']] ?? text(d['connectivity'])}',
          ),
          if (d['simulated'] == true) const Text('模拟设备 · 与四端使用同一套数据'),
          if (d['dataStale'] == true)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Text(
                '当前为最近留存记录，不代表设备此刻的状态。',
                style: TextStyle(color: Colors.orange),
              ),
            ),
          const SizedBox(height: 18),
          LayoutBuilder(
            builder: (context, constraints) => Wrap(
              spacing: 12,
              runSpacing: 12,
              children: metrics
                  .map(
                    (m) => SizedBox(
                      width: (constraints.maxWidth - 12) / 2,
                      child: Card(
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(text(m['label'])),
                              const SizedBox(height: 8),
                              Text(
                                '${text(obj(d['latest'])[m['key']])} ${text(m['unit'], '')}',
                                style: const TextStyle(
                                  fontSize: 22,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  )
                  .toList(),
            ),
          ),
          const SizedBox(height: 18),
          if (metrics.isNotEmpty)
            DropdownButtonFormField<String>(
              initialValue: metric,
              items: metrics
                  .map(
                    (m) => DropdownMenuItem(
                      value: text(m['key']),
                      child: Text(
                        '${text(m['label'])}（${text(m['unit'], '')}）',
                      ),
                    ),
                  )
                  .toList(),
              onChanged: (v) {
                metric = v;
                load();
              },
              decoration: const InputDecoration(labelText: '趋势指标'),
            ),
          const SizedBox(height: 12),
          DropdownButtonFormField<int>(
            initialValue: hours,
            decoration: const InputDecoration(labelText: '时间范围'),
            items: const [
              DropdownMenuItem(value: 24, child: Text('最近24小时')),
              DropdownMenuItem(value: 168, child: Text('最近7天')),
              DropdownMenuItem(value: 720, child: Text('最近30天')),
            ],
            onChanged: loading
                ? null
                : (value) {
                    hours = value ?? 24;
                    load();
                  },
          ),
          const SizedBox(height: 18),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: points.isEmpty
                  ? const SizedBox(
                      height: 180,
                      child: Center(child: Text('所选时间段暂无监测数据')),
                    )
                  : Column(
                      children: [
                        SizedBox(
                          height: 200,
                          child: CustomPaint(
                            painter: TrendPainter(points),
                            child: const SizedBox.expand(),
                          ),
                        ),
                        Text(
                          '${text(points.first['at'])} — ${text(points.last['at'])}',
                          style: const TextStyle(
                            fontSize: 10,
                            color: clientMuted,
                          ),
                        ),
                      ],
                    ),
            ),
          ),
          const Text(
            '设备告警',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
          ),
          ...alarms.map(
            (a) => ListTile(
              leading: const Icon(Icons.warning_amber, color: Colors.orange),
              title: Text(text(a['label'], text(a['metric']))),
              subtitle: Text(dateLabel(a['startedAt'])),
            ),
          ),
          if (alarms.isEmpty && device != null)
            const Padding(padding: EdgeInsets.all(20), child: Text('暂无告警记录')),
          const Text(
            '每15秒读取最新数据；设备未上报时不会生成虚假波动。',
            style: TextStyle(fontSize: 12, color: clientMuted),
          ),
        ],
      ),
    );
  }
}

class TrendPainter extends CustomPainter {
  final List<Json> points;
  TrendPainter(this.points);
  @override
  void paint(Canvas canvas, Size size) {
    final values = points
        .map((p) => num.tryParse('${p['value']}')?.toDouble())
        .whereType<double>()
        .toList();
    if (values.isEmpty) return;
    final min = values.reduce(math.min),
        max = values.reduce(math.max),
        range = max - min == 0 ? 1.0 : max - min;
    const left = 42.0;
    final width = size.width - left - 8, height = size.height - 26;
    final axis = Paint()
      ..color = const Color(0xffe5ebe7)
      ..strokeWidth = 1;
    for (var i = 0; i < 4; i++) {
      final y = i * height / 3;
      canvas.drawLine(Offset(left, y), Offset(size.width, y), axis);
      final t = TextPainter(
        text: TextSpan(
          text: (max - range * i / 3).toStringAsFixed(1),
          style: const TextStyle(fontSize: 10, color: clientMuted),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      t.paint(canvas, Offset(0, y));
    }
    final coords = List.generate(
      values.length,
      (i) => Offset(
        left +
            (values.length == 1 ? width / 2 : i * width / (values.length - 1)),
        height - (values[i] - min) / range * height,
      ),
    );
    final path = Path()..moveTo(coords.first.dx, coords.first.dy);
    for (var i = 1; i < coords.length; i++) {
      final a = coords[i - 1], b = coords[i], x = (a.dx + b.dx) / 2;
      path.cubicTo(x, a.dy, x, b.dy, b.dx, b.dy);
    }
    canvas.drawPath(
      path,
      Paint()
        ..color = const Color(0xff155de9)
        ..strokeWidth = 2.5
        ..style = PaintingStyle.stroke,
    );
    if (coords.length == 1) {
      canvas.drawCircle(
        coords.first,
        3,
        Paint()..color = const Color(0xff155de9),
      );
    }
  }

  @override
  bool shouldRepaint(covariant TrendPainter old) => old.points != points;
}
