import 'dart:async';
import 'dart:convert';
import 'package:material_ui/material_ui.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:image_picker/image_picker.dart';
import 'api.dart';
import 'common.dart';
import 'iot_screen.dart';
import 'visual_gallery.dart';

String? deviceCode(String raw, {required String trustedHost}) {
  final value = raw.trim();
  final uuid = RegExp(
    r'^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$',
  );
  if (uuid.hasMatch(value)) return value;
  if (value.startsWith('{')) {
    try {
      final data = obj(jsonDecode(value));
      for (final key in ['deviceId', 'assetId', 'id']) {
        if (uuid.hasMatch('${data[key]}')) return '${data[key]}';
      }
    } catch (_) {}
    return null;
  }
  final uri = Uri.tryParse(value);
  if (uri == null ||
      uri.scheme != 'https' ||
      uri.host != trustedHost ||
      uri.userInfo.isNotEmpty) {
    return null;
  }
  for (final key in ['deviceId', 'assetId', 'asset', 'id']) {
    final id = uri.queryParameters[key];
    if (id != null && uuid.hasMatch(id)) return id;
  }
  return null;
}

class ScanPage extends StatefulWidget {
  final Api api;
  const ScanPage({super.key, required this.api});
  @override
  State<ScanPage> createState() => _ScanPageState();
}

class _ScanPageState extends State<ScanPage> {
  final camera = MobileScannerController(
    detectionSpeed: DetectionSpeed.noDuplicates,
    formats: [BarcodeFormat.qrCode],
  );
  final manual = TextEditingController();
  bool delivered = false, picking = false;
  String? error;
  @override
  void dispose() {
    camera.dispose();
    manual.dispose();
    super.dispose();
  }

  Future<void> accept(String value) async {
    if (delivered) return;
    final id = deviceCode(value, trustedHost: Uri.parse(widget.api.base).host);
    if (id == null) {
      setState(() => error = '未识别到本系统设备码。不会打开外部链接，也不会自动绑定设备。');
      return;
    }
    delivered = true;
    await camera.stop();
    if (mounted) Navigator.pop(context, id);
  }

  Future<void> gallery() async {
    if (picking || delivered) return;
    setState(() => picking = true);
    try {
      final image = await ImagePicker().pickImage(source: ImageSource.gallery);
      if (image != null) {
        final result = await camera.analyzeImage(image.path);
        final value = result?.barcodes
            .map((b) => b.rawValue)
            .whereType<String>()
            .firstOrNull;
        if (value == null) throw const ApiFailure('图片中未识别到二维码');
        await accept(value);
      }
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => picking = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('扫一扫')),
    body: ListView(
      padding: const EdgeInsets.all(20),
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(18),
          child: SizedBox(
            height: 300,
            child: MobileScanner(
              controller: camera,
              onDetect: (capture) {
                final value = capture.barcodes
                    .map((b) => b.rawValue)
                    .whereType<String>()
                    .firstOrNull;
                if (value != null) accept(value);
              },
              errorBuilder: (c, e) => ColoredBox(
                color: Colors.black,
                child: Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(
                      '相机暂不可用。请在系统设置中允许相机权限，或使用相册、手动输入。',
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: Colors.white),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
        hint('扫描设备二维码；只展示当前工程师被授权的任务设备数据。'),
        if (error != null)
          Text(error!, style: const TextStyle(color: Colors.red)),
        OutlinedButton.icon(
          onPressed: picking ? null : gallery,
          icon: const Icon(Icons.photo_library_outlined),
          label: Text(picking ? '正在识别…' : '从相册识别'),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: manual,
          minLines: 1,
          maxLines: 3,
          decoration: const InputDecoration(labelText: '设备编号或本系统二维码链接'),
        ),
        const SizedBox(height: 12),
        FilledButton(
          onPressed: () => accept(manual.text),
          child: const Text('查看授权设备'),
        ),
      ],
    ),
  );
}

Future<void> scanDevice(BuildContext context, Api api) async {
  final id = await openPage<String>(context, ScanPage(api: api));
  if (id != null && context.mounted) {
    await openPage(context, IoTScreen(api: api, deviceId: id));
  }
}

class DeviceListPage extends StatefulWidget {
  final Api api;
  const DeviceListPage({super.key, required this.api});
  @override
  State<DeviceListPage> createState() => _DeviceListPageState();
}

class _DeviceListPageState extends State<DeviceListPage> {
  List<Json> devices = [];
  int page = 1, total = 0;
  String search = '', status = '', error = '';
  bool loading = false;
  Timer? debounce;
  int generation = 0;
  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    generation++;
    debounce?.cancel();
    super.dispose();
  }

  Future<void> load() async {
    final epoch = ++generation;
    setState(() => loading = true);
    try {
      final d = obj(
        await widget.api.call(
          '/iot/devices?page=$page&pageSize=20&search=${Uri.encodeComponent(search)}${status.isEmpty ? '' : '&connectivity=$status'}',
        ),
      );
      if (mounted && epoch == generation) {
        setState(() {
          devices = rows(d['devices']);
          total = number(d['total']).toInt();
          error = '';
        });
      }
    } catch (e) {
      if (mounted && epoch == generation) setState(() => error = '$e');
    } finally {
      if (mounted && epoch == generation) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('任务设备监控'),
      actions: [
        IconButton(
          tooltip: '扫码查看设备',
          onPressed: () => scanDevice(context, widget.api),
          icon: const Icon(Icons.qr_code_scanner),
        ),
        IconButton(
          tooltip: '刷新设备',
          onPressed: load,
          icon: const Icon(Icons.refresh),
        ),
      ],
    ),
    body: RefreshIndicator(
      onRefresh: load,
      child: ListView(
        padding: const EdgeInsets.all(20),
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          hint('这里只显示当前任务授权的设备；任务结束后权限会按服务端规则收回。'),
          TextField(
            decoration: const InputDecoration(
              labelText: '搜索设备型号或序列号',
              prefixIcon: Icon(Icons.search),
            ),
            onChanged: (v) {
              search = v;
              page = 1;
              debounce?.cancel();
              debounce = Timer(const Duration(milliseconds: 350), load);
            },
          ),
          const SizedBox(height: 16),
          if (loading) const LinearProgressIndicator(minHeight: 2),
          if (error.isNotEmpty)
            Text(error, style: const TextStyle(color: Colors.red)),
          ...devices.map(
            (d) => Card(
              child: ListTile(
                isThreeLine: true,
                title: Text(text(d['model'])),
                subtitle: Text(
                  '${text(d['serialNumber'])}\n${text(d['companyName'])} · ${text(d['city'])}',
                ),
                trailing: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      {
                            'ONLINE': '在线',
                            'OFFLINE': '离线',
                            'NEVER': '未上报',
                            'DISABLED': '已停用',
                          }[d['connectivity']] ??
                          text(d['connectivity']),
                      style: const TextStyle(color: brand, fontSize: 12),
                    ),
                    if (number(d['alarmCount']) > 0)
                      Text(
                        '${d['alarmCount']} 条告警',
                        style: const TextStyle(
                          color: Colors.orange,
                          fontSize: 11,
                        ),
                      ),
                  ],
                ),
                onTap: () => openPage(
                  context,
                  IoTScreen(api: widget.api, deviceId: text(d['id'])),
                ),
              ),
            ),
          ),
          if (devices.isEmpty && !loading && error.isEmpty)
            hint('暂无可查看的任务设备，请先接单或调整搜索。'),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('共 $total 台 · 第 $page 页'),
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
        ],
      ),
    ),
  );
}

class TaskDevicePage extends StatelessWidget {
  final Api api;
  final ServiceOrder order;
  const TaskDevicePage({super.key, required this.api, required this.order});
  @override
  Widget build(BuildContext context) {
    final d = obj(order.data['device']);
    return Scaffold(
      appBar: AppBar(title: const Text('设备档案')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          section(
            order.model,
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('服务企业：${order.company}'),
                hint(
                  '设备序列号：${text(order.platform ? order.data['device_serial'] : d['serialNumber'], text(d['serial_number']))}\n设备类型：${text(d['deviceType'], text(order.data['category']))}\n设备品牌：${text(d['brand'])}\n保障到期：${text(d['warrantyExpire'])}',
                ),
                Text('关联工单：${order.number}'),
              ],
            ),
          ),
          section('本次报修', Text(order.description)),
          if (order.deviceId.isNotEmpty) ...[
            OutlinedButton.icon(
              onPressed: () => openPage(
                context,
                IoTScreen(api: api, deviceId: order.deviceId),
              ),
              icon: const Icon(Icons.monitor_heart_outlined),
              label: const Text('查看授权运行数据'),
            ),
            OutlinedButton.icon(
              onPressed: () => openPage(
                context,
                VisualGallery(
                  api: api,
                  kind: 'device',
                  id: order.deviceId,
                  title: '设备实物与铭牌',
                ),
              ),
              icon: const Icon(Icons.photo_outlined),
              label: const Text('设备实物与铭牌'),
            ),
          ],
          hint('此档案来自当前工单授权信息；无权查看或未接入监控的设备不会显示其他企业数据。'),
        ],
      ),
    );
  }
}
