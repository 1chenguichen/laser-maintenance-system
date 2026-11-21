import 'dart:convert';

import 'package:material_ui/material_ui.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:image_picker/image_picker.dart';

import 'api.dart';
import 'common.dart';
import 'store.dart';
import 'iot_screen.dart';
import 'visual_gallery.dart';
import 'resources.dart';
import 'repair_forms.dart';
export 'repair_forms.dart';

String? customerDeviceCode(String raw, {required String host}) {
  var value = raw.trim();
  if (value.length > 2048) return null;
  if (value.startsWith('{')) {
    try {
      final d = obj(jsonDecode(value));
      value = text(
        d['serialNumber'],
        text(d['serial'], text(d['deviceId'], text(d['id'], ''))),
      );
    } catch (_) {
      return null;
    }
  }
  final uri = Uri.tryParse(value);
  if (uri != null && uri.hasScheme) {
    if (uri.scheme != 'https' || uri.host != host || uri.userInfo.isNotEmpty) {
      return null;
    }
    value =
        uri.queryParameters['serial'] ??
        uri.queryParameters['sn'] ??
        uri.queryParameters['serialNumber'] ??
        uri.queryParameters['deviceId'] ??
        uri.queryParameters['id'] ??
        '';
  }
  return RegExp(r'^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$').hasMatch(value)
      ? value
      : null;
}

Future<void> scanCustomerDevice(
  BuildContext context,
  CustomerStore store,
) async {
  final value = await openPage<String>(
    context,
    CustomerScanPage(host: Uri.parse(store.api.base).host),
  );
  if (value == null || !context.mounted) return;
  await store.load('/customer/devices');
  if (!context.mounted) return;
  final device = store.devices
      .where((d) => d['id'] == value || d['serialNumber'] == value)
      .firstOrNull;
  if (device != null) {
    await openPage(context, DeviceDetail(store: store, device: device));
  } else {
    await openPage(context, BindDevicePage(store: store, serial: value));
  }
}

class CustomerScanPage extends StatefulWidget {
  final String host;
  const CustomerScanPage({super.key, required this.host});
  @override
  State<CustomerScanPage> createState() => _CustomerScanPageState();
}

class _CustomerScanPageState extends State<CustomerScanPage> {
  final controller = MobileScannerController();
  final manual = TextEditingController();
  bool done = false;
  String? error;
  void accept(String raw) {
    if (done) return;
    final value = customerDeviceCode(raw, host: widget.host);
    if (value == null) {
      setState(() => error = '未识别到本平台设备码，请使用设备序列号。');
      return;
    }
    done = true;
    Navigator.pop(context, value);
  }

  @override
  void dispose() {
    controller.dispose();
    manual.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: clientAppBar(context, title: const Text('扫一扫')),
    body: ListView(
      padding: const EdgeInsets.all(24),
      children: [
        SizedBox(
          height: 280,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: MobileScanner(
              controller: controller,
              onDetect: (capture) {
                for (final code in capture.barcodes) {
                  if (code.rawValue != null) {
                    accept(code.rawValue!);
                    break;
                  }
                }
              },
              errorBuilder: (context, error) =>
                  const Center(child: Text('相机暂不可用，请允许相机权限，或使用相册/手动输入。')),
            ),
          ),
        ),
        hint('识别二维码不会自动绑定设备或打开外部链接。'),
        OutlinedButton.icon(
          onPressed: () async {
            try {
              final photo = await ImagePicker().pickImage(
                source: ImageSource.gallery,
              );
              if (photo == null) return;
              final capture = await controller.analyzeImage(photo.path);
              final code = capture?.barcodes.firstOrNull?.rawValue;
              if (code != null) {
                accept(code);
              } else if (mounted) {
                setState(() => error = '图片中未识别到设备码');
              }
            } catch (e) {
              if (mounted) setState(() => error = '相册识别暂不可用，请手动输入。');
            }
          },
          icon: const Icon(Icons.photo_library_outlined),
          label: const Text('从相册识别'),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: manual,
          decoration: const InputDecoration(labelText: '设备序列号或设备码'),
        ),
        if (error != null) hint(error!),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: () => accept(manual.text),
          child: const Text('识别设备'),
        ),
      ],
    ),
  );
}

class BindDevicePage extends StatefulWidget {
  final CustomerStore store;
  final String serial;
  const BindDevicePage({super.key, required this.store, this.serial = ''});
  @override
  State<BindDevicePage> createState() => _BindDevicePageState();
}

class _BindDevicePageState extends State<BindDevicePage> {
  late final value = TextEditingController(text: widget.serial);
  bool busy = false;
  String? error;
  @override
  void dispose() {
    value.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    if (busy) return;
    if (value.text.trim().isEmpty) {
      setState(() => error = '请输入设备序列号');
      return;
    }
    setState(() => busy = true);
    try {
      final d = obj(
        await widget.store.api.call(
          '/customer/devices',
          method: 'POST',
          body: {'serialNumber': value.text.trim()},
        ),
      );
      await widget.store.load('/customer/devices');
      if (mounted) {
        Navigator.pop(context);
        await openPage(context, DeviceDetail(store: widget.store, device: d));
      }
    } catch (e) {
      if (mounted) setState(() => error = '$e；输入已保留。');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: clientAppBar(context, title: const Text('绑定设备')),
    body: ListView(
      padding: const EdgeInsets.all(24),
      children: [
        clientHeading('建立设备档案关联', '输入设备铭牌上的序列号。设备归属与绑定资格由服务端验证。'),
        TextField(
          controller: value,
          enabled: !busy,
          decoration: const InputDecoration(labelText: '设备序列号 / SN'),
        ),
        hint('设备需要先由服务企业登记；已绑定其他客户的设备无法重复绑定。'),
        if (error != null)
          Text(error!, style: const TextStyle(color: clientDanger)),
        FilledButton(
          onPressed: busy ? null : submit,
          child: Text(busy ? '正在绑定…' : '确认绑定'),
        ),
      ],
    ),
  );
}

class DeviceDetail extends StatelessWidget {
  final CustomerStore store;
  final Json device;
  const DeviceDetail({super.key, required this.store, required this.device});
  @override
  Widget build(BuildContext context) => DataPage(
    title: '设备详情',
    load: () async {
      final list = rows(await store.api.call('/customer/devices'));
      final d = list.where((v) => v['id'] == device['id']).firstOrNull;
      if (d == null) throw const ApiFailure('设备已解绑或当前账号无权查看');
      return d;
    },
    content: (context, d, reload) => Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        section(
          text(d['model']),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  ReferencePhoto(model: text(d['model']), size: 84),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('SN ${text(d['serialNumber'])}'),
                        Text(text(d['deviceType'])),
                        Text(text(d['serviceName'], '服务企业待确认')),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Text('购买日期：${dateLabel(d['purchaseDate']).split(' ').first}'),
              Text('保修到期：${dateLabel(d['warrantyExpire']).split(' ').first}'),
            ],
          ),
        ),
        FilledButton.icon(
          onPressed: () => openPage(
            context,
            RepairForm(store: store, deviceId: text(d['id'])),
          ),
          icon: const Icon(Icons.build_outlined),
          label: const Text('为此设备报修'),
        ),
        const SizedBox(height: 12),
        OutlinedButton(
          onPressed: () => openPage(
            context,
            VisualGallery(
              api: store.api,
              kind: 'device',
              id: text(d['id']),
              title: '设备照片与铭牌',
            ),
          ),
          child: const Text('查看设备照片与铭牌'),
        ),
        OutlinedButton(
          onPressed: () => openPage(
            context,
            IoTScreen(api: store.api, deviceId: text(d['id'])),
          ),
          child: const Text('查看设备运行数据与统计图'),
        ),
        hint('设备监测只显示已接入且当前账号有权查看的指标。未接入设备不会补造统计数据。'),
        if (d['serviceId'] != null)
          TextButton(
            onPressed: () => openPage(
              context,
              CompanyPage(api: store.api, id: text(d['serviceId'])),
            ),
            child: const Text('服务企业资料'),
          ),
        TextButton(
          onPressed: () async {
            if (!await confirm(context, '解除设备关联？', '解绑后设备档案与历史维修记录仍由服务企业保留。')) {
              return;
            }
            try {
              await store.api.call(
                '/customer/devices/${d['id']}',
                method: 'DELETE',
              );
              await store.load('/customer/devices');
              if (context.mounted) Navigator.pop(context);
            } catch (e) {
              if (context.mounted) notice(context, e);
            }
          },
          child: const Text('解除设备关联', style: TextStyle(color: clientDanger)),
        ),
      ],
    ),
  );
}

class CustomerMonitorList extends StatelessWidget {
  final Api api;
  const CustomerMonitorList({super.key, required this.api});
  @override
  Widget build(BuildContext context) => DataPage(
    title: '设备监测',
    load: () async => obj(await api.call('/iot/devices?pageSize=20')),
    content: (c, d, reload) => Column(
      children: [
        hint('仅展示当前身份授权的接入设备。'),
        ...rows(d['devices']).map(
          (item) => Card(
            child: ListTile(
              title: Text(text(item['model'])),
              subtitle: Text(
                '${text(item['serialNumber'])} · ${text(item['companyName'])}',
              ),
              trailing: const Icon(Icons.chevron_right),
              onTap: () =>
                  openPage(c, IoTScreen(api: api, deviceId: text(item['id']))),
            ),
          ),
        ),
        if (rows(d['devices']).isEmpty) hint('暂无可查看的已接入设备'),
      ],
    ),
  );
}
