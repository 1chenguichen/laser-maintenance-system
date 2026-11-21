import 'dart:math';
import 'dart:typed_data';

import 'package:material_ui/material_ui.dart';
import 'package:image_picker/image_picker.dart';

import 'api.dart';
import 'common.dart';
import 'store.dart';
import 'order_detail.dart';
import 'resources.dart';

String newSubmissionId() {
  final bytes = List.generate(16, (_) => Random.secure().nextInt(256));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  final h = bytes.map((v) => v.toRadixString(16).padLeft(2, '0')).join();
  return '${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-${h.substring(16, 20)}-${h.substring(20)}';
}

class DraftPhoto {
  final Uint8List bytes;
  final String name;
  String? platformId, legacyUrl;
  DraftPhoto(this.bytes, this.name);
}

class RepairForm extends StatefulWidget {
  final CustomerStore store;
  final String? deviceId;
  const RepairForm({super.key, required this.store, this.deviceId});
  @override
  State<RepairForm> createState() => _RepairFormState();
}

class _RepairFormState extends State<RepairForm> {
  final key = GlobalKey<FormState>(), note = TextEditingController();
  final requestId = newSubmissionId();
  List<Json> devices = [], addresses = [], contracts = [];
  final photos = <DraftPhoto>[];
  String? device, address, contract, error;
  String fault = '其他故障', urgency = 'normal', preferredTime = 'asap';
  bool loading = true, busy = false, picking = false;
  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    note.dispose();
    super.dispose();
  }

  Future<void> load() async {
    setState(() => loading = true);
    try {
      final base = await Future.wait([
        widget.store.api.call('/customer/devices'),
        widget.store.api.call('/customer/addresses'),
      ]);
      List<Json> terms = [];
      try {
        terms = rows(await widget.store.api.call('/operations/contracts'));
      } catch (_) {
        error = '合同信息暂未读取，仍可发起平台报修；如需合同保障请重试。';
      }
      if (!mounted) return;
      setState(() {
        devices = rows(base[0]);
        addresses = rows(base[1]);
        contracts = terms;
        device ??= widget.deviceId;
        if (address != null && !addresses.any((a) => a['id'] == address)) {
          address = null;
        }
        address ??=
            addresses.where((a) => a['isDefault'] == true).firstOrNull?['id'] ??
            addresses.firstOrNull?['id'];
        if (device != null && !devices.any((d) => d['id'] == device)) {
          device = null;
          error = '设备已解绑或不属于当前客户，请重新选择。';
        }
        if (contract != null &&
            !availableContracts.any((c) => c['id'] == contract)) {
          contract = null;
        }
        loading = false;
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          error = '$e';
          loading = false;
        });
      }
    }
  }

  List<Json> get availableContracts {
    final selected = devices.where((d) => d['id'] == device).firstOrNull;
    final day = DateTime.now().toIso8601String().substring(0, 10);
    return contracts.where((c) {
      final ids = c['deviceIds'] as List? ?? [];
      return c['status'] == 'ACTIVE' &&
          text(c['startDate'], '9999').compareTo(day) <= 0 &&
          text(c['endDate'], '0000').compareTo(day) >= 0 &&
          (ids.isEmpty || ids.contains(device)) &&
          (c['serviceId'] == null || c['serviceId'] == selected?['serviceId']);
    }).toList();
  }

  Future<void> pick(ImageSource source) async {
    if (picking || photos.length >= 5) return;
    setState(() => picking = true);
    try {
      final img = await ImagePicker().pickImage(
        source: source,
        maxWidth: 1600,
        maxHeight: 1600,
        imageQuality: 80,
      );
      if (img == null) return;
      final bytes = await img.readAsBytes();
      if (bytes.length > 5 * 1024 * 1024) throw const ApiFailure('照片超过5MB');
      if (mounted) setState(() => photos.add(DraftPhoto(bytes, img.name)));
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => picking = false);
    }
  }

  Future<void> submit() async {
    if (busy || !key.currentState!.validate()) return;
    if (device == null || address == null) {
      setState(() => error = '请选择设备和上门地址');
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final ids = <String>[];
      for (final photo in photos) {
        if (contract == null) {
          photo.platformId ??= text(
            (await widget.store.api.upload(
              '/market/attachments',
              photo.bytes,
              photo.name,
            ))['id'],
            '',
          );
          ids.add(photo.platformId!);
        } else {
          photo.legacyUrl ??= text(
            (await widget.store.api.upload(
              '/customer/work-orders/photo?deviceId=$device',
              photo.bytes,
              photo.name,
            ))['url'],
            '',
          );
          ids.add(photo.legacyUrl!);
        }
      }
      final legacy = contract != null;
      final body = legacy
          ? {
              'deviceId': device,
              'addressId': address,
              'contractId': contract,
              'faultType': fault,
              'faultDescription': note.text.trim(),
              'faultPhotos': ids,
              'emergencyLevel': urgency == 'urgent' ? 5 : 0,
            }
          : {
              'deviceId': device,
              'addressId': address,
              'faultType': fault,
              'faultDescription': note.text.trim(),
              'urgency': urgency,
              'preferredTime': preferredTime,
              'clientRequestId': requestId,
              'photoIds': ids,
            };
      final result = obj(
        await widget.store.api.call(
          legacy ? '/customer/work-orders' : '/market/device-repairs',
          method: 'POST',
          body: body,
        ),
      );
      await widget.store.refresh(3);
      if (mounted) {
        Navigator.pop(context);
        await openPage(
          context,
          CustomerOrderDetail(
            store: widget.store,
            order: CustomerOrder(result, platform: !legacy),
          ),
        );
      }
    } catch (e) {
      if (mounted) setState(() => error = '$e；填写内容与照片已保留。若提示超时，请先查看订单确认结果。');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: clientAppBar(context, title: const Text('提交报修')),
    body: Form(
      key: key,
      child: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          clientHeading('把问题交给专业的人', '确认设备、描述故障，提交需求不会直接扣款。'),
          if (loading) const LinearProgressIndicator(),
          if (error != null)
            section(
              '读取与提交提示',
              Column(
                children: [
                  Text(error!),
                  if (!busy)
                    TextButton(onPressed: load, child: const Text('重新读取基础信息')),
                ],
              ),
            ),
          if (!loading) ...[
            section(
              '本次报修设备',
              DropdownButtonFormField<String>(
                initialValue: device,
                isExpanded: true,
                items: devices
                    .map(
                      (d) => DropdownMenuItem(
                        value: text(d['id']),
                        child: Text(
                          '${text(d['model'])} · ${text(d['serialNumber'])}',
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    )
                    .toList(),
                onChanged: busy
                    ? null
                    : (v) => setState(() {
                        device = v;
                        contract = null;
                      }),
                decoration: const InputDecoration(labelText: '选择设备'),
                validator: (v) => v == null ? '请选择设备' : null,
              ),
            ),
            section(
              '01 描述设备问题',
              Column(
                children: [
                  DropdownButtonFormField<String>(
                    initialValue: fault,
                    items:
                        const [
                              '激光器故障',
                              '光路故障',
                              '水路故障',
                              '气路故障',
                              '电路故障',
                              '控制系统故障',
                              '机械传动故障',
                              '冷却系统故障',
                              '除尘系统故障',
                              '其他故障',
                            ]
                            .map(
                              (v) => DropdownMenuItem(value: v, child: Text(v)),
                            )
                            .toList(),
                    onChanged: busy ? null : (v) => fault = v!,
                    decoration: const InputDecoration(labelText: '故障类型'),
                  ),
                  const SizedBox(height: 16),
                  TextFormField(
                    controller: note,
                    minLines: 4,
                    maxLines: 7,
                    maxLength: 2000,
                    decoration: const InputDecoration(
                      labelText: '故障现象、报警与发生时间',
                    ),
                    validator: (v) =>
                        (v?.trim().length ?? 0) < 5 ? '请至少填写5个字' : null,
                  ),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('紧急 · 已影响生产'),
                    value: urgency == 'urgent',
                    onChanged: busy
                        ? null
                        : (v) =>
                              setState(() => urgency = v ? 'urgent' : 'normal'),
                  ),
                  Wrap(
                    spacing: 8,
                    children: [
                      OutlinedButton.icon(
                        onPressed: busy || picking
                            ? null
                            : () => pick(ImageSource.gallery),
                        icon: const Icon(Icons.photo_library_outlined),
                        label: Text('故障图片 ${photos.length}/5'),
                      ),
                      OutlinedButton.icon(
                        onPressed: busy || picking
                            ? null
                            : () => pick(ImageSource.camera),
                        icon: const Icon(Icons.photo_camera_outlined),
                        label: const Text('拍照'),
                      ),
                    ],
                  ),
                  ...photos.asMap().entries.map(
                    (e) => ListTile(
                      leading: Image.memory(
                        e.value.bytes,
                        width: 48,
                        height: 48,
                        fit: BoxFit.cover,
                      ),
                      title: Text('故障照片 ${e.key + 1}'),
                      trailing: IconButton(
                        tooltip: '移除照片',
                        onPressed: busy
                            ? null
                            : () => setState(() => photos.removeAt(e.key)),
                        icon: const Icon(Icons.close),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            section(
              '02 上门安排',
              Column(
                children: [
                  DropdownButtonFormField<String>(
                    key: ValueKey(address),
                    initialValue: address,
                    isExpanded: true,
                    items: addresses
                        .map(
                          (a) => DropdownMenuItem(
                            value: text(a['id']),
                            child: Text(
                              '${text(a['city'])} ${text(a['detail'])}',
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        )
                        .toList(),
                    onChanged: busy ? null : (v) => setState(() => address = v),
                    decoration: const InputDecoration(labelText: '上门地址'),
                    validator: (v) => v == null ? '请先添加地址' : null,
                  ),
                  TextButton(
                    onPressed: busy
                        ? null
                        : () async {
                            await openPage(
                              context,
                              AddressList(api: widget.store.api),
                            );
                            await load();
                          },
                    child: const Text('管理或新增上门地址'),
                  ),
                  DropdownButtonFormField<String>(
                    initialValue: preferredTime,
                    items: const [
                      DropdownMenuItem(value: 'asap', child: Text('尽快安排')),
                      DropdownMenuItem(value: 'tomorrow', child: Text('明天')),
                      DropdownMenuItem(value: 'this_week', child: Text('本周内')),
                    ],
                    onChanged: busy ? null : (v) => preferredTime = v!,
                    decoration: const InputDecoration(labelText: '期望时间'),
                  ),
                ],
              ),
            ),
            section(
              '03 服务保障',
              Column(
                children: [
                  DropdownButtonFormField<String>(
                    key: ValueKey('$device-$contract'),
                    initialValue: contract,
                    isExpanded: true,
                    items: [
                      const DropdownMenuItem<String>(
                        value: null,
                        child: Text('平台安排，不使用企业合同'),
                      ),
                      ...availableContracts.map(
                        (c) => DropdownMenuItem(
                          value: text(c['id']),
                          child: Text(
                            text(c['number']),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ),
                    ],
                    onChanged: busy
                        ? null
                        : (v) => setState(() => contract = v),
                    decoration: const InputDecoration(labelText: '选择适用合同（可选）'),
                  ),
                  hint(
                    contract == null
                        ? '由平台安排服务，承接方确定后可在订单中查看。'
                        : '由对应企业按原保障与结算协议受理。',
                  ),
                ],
              ),
            ),
            FilledButton(
              onPressed: busy || devices.isEmpty || addresses.isEmpty
                  ? null
                  : submit,
              child: Text(busy ? '正在提交…' : '提交报修'),
            ),
          ],
        ],
      ),
    ),
  );
}

class ServiceRequestForm extends StatefulWidget {
  final CustomerStore store;
  final Json offer;
  const ServiceRequestForm({
    super.key,
    required this.store,
    required this.offer,
  });
  @override
  State<ServiceRequestForm> createState() => _ServiceRequestFormState();
}

class _ServiceRequestFormState extends State<ServiceRequestForm> {
  final key = GlobalKey<FormState>(),
      model = TextEditingController(),
      city = TextEditingController(),
      address = TextEditingController(),
      description = TextEditingController();
  bool busy = false;
  String? error, device;
  @override
  void initState() {
    super.initState();
    if (widget.offer['city'] != '全国') {
      city.text = text(widget.offer['city'], '');
    }
    widget.store.load('/customer/devices').then((_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    for (final c in [model, city, address, description]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> submit() async {
    if (busy || !key.currentState!.validate()) return;
    setState(() => busy = true);
    try {
      final d = obj(
        await widget.store.api.call(
          '/market/requests',
          method: 'POST',
          body: {
            'offerId': widget.offer['id'],
            'deviceRef': device ?? '',
            'deviceModel': model.text.trim(),
            'city': city.text.trim(),
            'address': address.text.trim(),
            'description': description.text.trim(),
          },
        ),
      );
      await widget.store.refresh(3);
      if (mounted) {
        Navigator.pop(context);
        await openPage(
          context,
          CustomerOrderDetail(
            store: widget.store,
            order: CustomerOrder(d, platform: true),
          ),
        );
      }
    } catch (e) {
      if (mounted) setState(() => error = '$e；内容已保留，请先核对订单后重试。');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: clientAppBar(context, title: const Text('提交服务需求')),
    body: Form(
      key: key,
      child: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          clientHeading(text(widget.offer['title']), '本次提交不会直接扣款，费用以确认报价为准。'),
          DropdownButtonFormField<String>(
            initialValue: device,
            isExpanded: true,
            items: [
              const DropdownMenuItem<String>(
                value: null,
                child: Text('未绑定，手动填写型号'),
              ),
              ...widget.store.devices.map(
                (d) => DropdownMenuItem(
                  value: text(d['id']),
                  child: Text(
                    text(d['model']),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ),
            ],
            onChanged: (v) => setState(() {
              device = v;
              final d = widget.store.devices
                  .where((d) => d['id'] == v)
                  .firstOrNull;
              if (d != null) model.text = text(d['model']);
            }),
            decoration: const InputDecoration(labelText: '选择我的设备（可选）'),
          ),
          const SizedBox(height: 16),
          ...[
            (model, '设备型号'),
            (city, '服务城市'),
            (address, '详细上门地址'),
            (description, '故障与服务需求'),
          ].map(
            (e) => Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: TextFormField(
                controller: e.$1,
                minLines: e.$1 == description ? 3 : 1,
                maxLines: e.$1 == description ? 6 : 1,
                decoration: InputDecoration(labelText: e.$2),
                validator: (v) =>
                    (v?.trim().length ?? 0) < (e.$1 == description ? 5 : 1)
                    ? '请完整填写${e.$2}'
                    : null,
              ),
            ),
          ),
          if (error != null) hint(error!),
          FilledButton(
            onPressed: busy ? null : submit,
            child: Text(busy ? '正在提交…' : '提交需求'),
          ),
        ],
      ),
    ),
  );
}
