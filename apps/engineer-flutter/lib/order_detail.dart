import 'dart:convert';
import 'dart:ui' as ui;
import 'package:material_ui/material_ui.dart';
import 'package:flutter/rendering.dart';
import 'package:image_picker/image_picker.dart';
import 'api.dart';
import 'store.dart';
import 'iot_screen.dart';
import 'common.dart';
import 'inventory.dart';
import 'visual_gallery.dart';
import 'profile_pages.dart';
import 'assistant_pages.dart';
import 'device_pages.dart';

class OrderDetail extends StatefulWidget {
  final EngineerStore store;
  final ServiceOrder order;
  const OrderDetail({super.key, required this.store, required this.order});
  @override
  State<OrderDetail> createState() => _OrderDetailState();
}

class _OrderDetailState extends State<OrderDetail> {
  ServiceOrder? current;
  bool loading = false, busy = false, showIoT = false;
  String? error;
  Api get api => widget.store.api;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    setState(() => loading = true);
    try {
      final data = obj(
        await api.call(
          widget.order.platform
              ? '/market/requests/${widget.order.id}'
              : '/engineer/orders/${widget.order.id}',
        ),
      );
      if (mounted) {
        setState(() {
          current = ServiceOrder(data, platform: widget.order.platform);
          error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> act() async {
    final o = current;
    if (o == null || o.action == null || busy) return;
    final action = o.action!;
    Json? values;
    if (['quote', 'complete'].contains(action)) {
      final success = await Navigator.push<bool>(
        context,
        MaterialPageRoute(
          builder: (_) => WorkForm(
            order: o,
            action: action,
            store: widget.store,
            onSubmit: (values) async {
              await api.call(
                o.platform
                    ? '/market/requests/${o.id}/action'
                    : '/engineer/orders/${o.id}/$action',
                method: 'POST',
                body: o.platform
                    ? {
                        'action': action,
                        'version': o.data['version'],
                        ...values,
                      }
                    : values,
              );
            },
          ),
        ),
      );
      if (success == true) {
        await load();
        await widget.store.ordersChanged();
      }
      return;
    } else {
      final yes = await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
          title: Text('${actionNames[action]}？'),
          content: const Text('请确认已核对设备与现场安排。'),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(c, false),
              child: const Text('取消'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(c, true),
              child: const Text('确认'),
            ),
          ],
        ),
      );
      if (yes == true) values = {};
    }
    if (values == null || !mounted) return;
    setState(() => busy = true);
    try {
      await api.call(
        o.platform
            ? '/market/requests/${o.id}/action'
            : '/engineer/orders/${o.id}/$action',
        method: 'POST',
        body: o.platform
            ? {'action': action, 'version': o.data['version'], ...values}
            : values,
      );
      await load();
      await widget.store.ordersChanged();
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('操作已完成，当前状态已更新')));
      }
    } catch (e) {
      if (mounted) {
        setState(() => error = '$e');
        await load();
        if (mounted) {
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(SnackBar(content: Text('$e，请核对最新工单状态后再操作')));
        }
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Widget block(String title, Widget content) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 12),
          content,
        ],
      ),
    ),
  );
  @override
  Widget build(BuildContext context) {
    final o = current ?? widget.order;
    final address = o.data['address'];
    final addressText = address is Map
        ? [
            'province',
            'city',
            'district',
            'detail',
          ].map((k) => text(address[k], '')).join('')
        : text(address);
    return Scaffold(
      appBar: engineerAppBar(
        context,
        title: const Text('工单详情'),
        actions: [
          IconButton(
            tooltip: '刷新',
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
            if (loading) const LinearProgressIndicator(minHeight: 2),
            if (error != null) block('读取提示', Text(error!)),
            Row(
              children: [
                statusTag(o.label, o.status),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    o.number,
                    textAlign: TextAlign.right,
                    style: const TextStyle(fontSize: 12, color: engineerMuted),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),
            section(
              '本单履约企业',
              Text(
                o.company,
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            if (o.action != null)
              softPanel(
                Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      '当前任务 · 下一步',
                      style: TextStyle(color: engineerMuted),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      const {
                        'accept': '确认接单，并核对现场服务安排',
                        'start': '核对设备与地址，开始现场服务',
                        'quote': '填写检测结果，提交本次服务报价',
                        'complete': '完成维修，并核对实际用料和验证结果',
                      }[o.action]!,
                      style: const TextStyle(fontSize: 20, height: 1.5),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      '服务企业：${o.company}',
                      style: const TextStyle(color: engineerMuted),
                    ),
                    const SizedBox(height: 20),
                    FilledButton(
                      onPressed: busy || loading || current == null
                          ? null
                          : act,
                      child: Text(busy ? '正在提交…' : actionNames[o.action]!),
                    ),
                  ],
                ),
              ),
            if (o.deviceId.isNotEmpty)
              block(
                '设备物联网',
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('按当前工单授权查看运行指标、趋势和告警。'),
                    const SizedBox(height: 12),
                    OutlinedButton.icon(
                      onPressed: () => setState(() => showIoT = !showIoT),
                      icon: Icon(
                        showIoT ? Icons.expand_less : Icons.expand_more,
                      ),
                      label: Text(showIoT ? '收起运行数据与统计图' : '展开运行数据与统计图'),
                    ),
                    if (showIoT)
                      SizedBox(
                        height: 620,
                        child: IoTScreen(
                          api: api,
                          deviceId: o.deviceId,
                          embedded: true,
                        ),
                      ),
                    TextButton(
                      onPressed: () => openPage(
                        context,
                        IoTScreen(api: api, deviceId: o.deviceId),
                      ),
                      child: const Text('打开完整设备监测 →'),
                    ),
                  ],
                ),
              ),
            block(
              '设备与现场',
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      ReferencePhoto(model: o.model, size: 64),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          o.model,
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(addressText),
                  const SizedBox(height: 8),
                  Text('客户：${text(obj(o.data['customer'])['name'])}'),
                  SelectableText(
                    '电话：${text(obj(o.data['customer'])['phone'])}',
                  ),
                ],
              ),
            ),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                ActionChip(
                  avatar: const Icon(Icons.call_outlined, size: 18),
                  label: const Text('联系客户'),
                  onPressed: () => callPhone(
                    context,
                    text(obj(o.data['customer'])['phone'], ''),
                  ),
                ),
                ActionChip(
                  avatar: const Icon(Icons.map_outlined, size: 18),
                  label: const Text('地图导航'),
                  onPressed: () => openMap(context, addressText),
                ),
                if (!o.platform && o.status == 'REPAIRING')
                  ActionChip(
                    avatar: const Icon(Icons.inventory_2_outlined, size: 18),
                    label: const Text('登记用料'),
                    onPressed: () => openPage(
                      context,
                      InventoryPage(
                        store: widget.store,
                        serviceId: o.data['serviceId'],
                        workOrderId: o.id,
                      ),
                    ),
                  ),
                ActionChip(
                  avatar: const Icon(Icons.photo_library_outlined, size: 18),
                  label: const Text('现场照片'),
                  onPressed: () => openPage(
                    context,
                    VisualGallery(
                      api: api,
                      kind: o.platform ? 'request' : 'legacy',
                      id: o.id,
                      title: '现场检测与完工照片',
                    ),
                  ),
                ),
                ActionChip(
                  avatar: const Icon(Icons.edit_note, size: 18),
                  label: const Text('整理维修报告'),
                  onPressed: () => openPage(
                    context,
                    RepairReportPage(store: widget.store, order: o),
                  ),
                ),
                ActionChip(
                  avatar: const Icon(Icons.smart_toy_outlined, size: 18),
                  label: const Text('AI 维修助手'),
                  onPressed: () => openPage(
                    context,
                    AssistantPage(
                      store: widget.store,
                      serviceId: o.platform ? null : o.data['serviceId'],
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            OutlinedButton.icon(
              onPressed: () =>
                  openPage(context, TaskDevicePage(api: api, order: o)),
              icon: const Icon(Icons.precision_manufacturing_outlined),
              label: const Text('查看设备档案与铭牌'),
            ),
            block('故障描述', Text(o.description)),
            block(
              '费用与服务记录',
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '报价金额：¥ ${money(o.data[o.platform ? 'quote_amount' : 'estimatedAmount'])}',
                  ),
                  const SizedBox(height: 8),
                  Text(
                    text(
                      o.data[o.platform ? 'report' : 'repairReport'],
                      '暂无完工记录',
                    ),
                  ),
                ],
              ),
            ),
            if (!o.platform &&
                o.data['faultPhotos'] is List &&
                (o.data['faultPhotos'] as List).isNotEmpty)
              block(
                '故障照片',
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: (o.data['faultPhotos'] as List)
                      .map((v) => Photo(value: '$v', api: api))
                      .toList(),
                ),
              ),
            if (o.platform)
              ...rows(o.data['events']).map(
                (e) => ListTile(
                  leading: const Icon(Icons.check_circle_outline, size: 20),
                  title: Text(text(e['action'])),
                  subtitle: Text(
                    '${text(e['note'], '')} · ${text(e['created_at'])}',
                  ),
                ),
              ),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }
}

class Photo extends StatelessWidget {
  final String value;
  final Api api;
  const Photo({super.key, required this.value, required this.api});
  @override
  Widget build(BuildContext context) {
    Widget image;
    if (value.startsWith('data:image/')) {
      try {
        image = Image.memory(
          base64Decode(value.split(',').last),
          fit: BoxFit.cover,
        );
      } catch (_) {
        image = const Icon(Icons.broken_image_outlined);
      }
    } else {
      final base = Uri.parse(api.base);
      final url = base.resolve(value);
      if (url.scheme != 'https' ||
          url.host != base.host ||
          url.port != base.port) {
        return const SizedBox.shrink();
      }
      image = Image.network(
        '$url',
        fit: BoxFit.cover,
        errorBuilder: (_, _, _) => const Icon(Icons.broken_image_outlined),
      );
    }
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: SizedBox(width: 100, height: 100, child: image),
    );
  }
}

class WorkForm extends StatefulWidget {
  final ServiceOrder order;
  final EngineerStore? store;
  final String action;
  final Future<void> Function(Json) onSubmit;
  const WorkForm({
    super.key,
    required this.order,
    required this.action,
    this.store,
    required this.onSubmit,
  });
  @override
  State<WorkForm> createState() => _WorkFormState();
}

class _WorkFormState extends State<WorkForm> {
  final parts = TextEditingController(),
      labor = TextEditingController(),
      note = TextEditingController();
  final key = GlobalKey<FormState>(), signature = GlobalKey();
  final strokes = <List<Offset>>[];
  final photos = <String>[];
  bool picking = false, submitting = false;
  String? error;
  @override
  void initState() {
    super.initState();
    parts.text = text(widget.order.data['partsFee'], '0');
    labor.text = text(widget.order.data['laborFee'], '0');
    note.text = text(
      widget.order.data[widget.order.platform ? 'report' : 'repairReport'],
      '',
    );
  }

  @override
  void dispose() {
    parts.dispose();
    labor.dispose();
    note.dispose();
    super.dispose();
  }

  Future<void> photo([ImageSource source = ImageSource.gallery]) async {
    if (picking || photos.length >= 2) return;
    setState(() => picking = true);
    try {
      final file = await ImagePicker().pickImage(
        source: source,
        imageQuality: 40,
        maxWidth: 960,
        maxHeight: 960,
      );
      if (file != null) {
        final bytes = await file.readAsBytes();
        if (bytes.length > 450000) throw const ApiFailure('图片仍然过大，请选择较小的照片');
        if (mounted) {
          setState(
            () => photos.add('data:image/jpeg;base64,${base64Encode(bytes)}'),
          );
        }
      }
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => picking = false);
    }
  }

  Future<void> submit() async {
    if (submitting || !key.currentState!.validate()) return;
    Json body = {};
    if (widget.action == 'quote') {
      final a = double.parse(parts.text), b = double.parse(labor.text);
      if (a + b <= 0 && widget.order.data['contractId'] == null) {
        setState(() => error = '报价总额必须大于0');
        return;
      }
      body = widget.order.platform
          ? {'amount': a + b, 'note': note.text}
          : {'partsFee': a, 'laborFee': b};
    } else if (widget.order.platform) {
      body = {'report': note.text};
    } else {
      if (strokes.every((s) => s.isEmpty)) {
        setState(() => error = '请客户签名确认后提交');
        return;
      }
      final boundary =
          signature.currentContext!.findRenderObject() as RenderRepaintBoundary;
      final image = await boundary.toImage(pixelRatio: 1);
      final png = await image.toByteData(format: ui.ImageByteFormat.png);
      image.dispose();
      if (png == null) return;
      body = {
        'partsFee': double.tryParse(parts.text) ?? 0,
        'laborFee': double.tryParse(labor.text) ?? 0,
        'repairReport': note.text,
        'signatureUrl':
            'data:image/png;base64,${base64Encode(png.buffer.asUint8List())}',
        'onSitePhotos': [
          ...((widget.order.data['onSitePhotos'] as List?) ?? []),
          ...photos,
        ],
      };
    }
    if (jsonEncode(body).length > 1700000) {
      setState(() => error = '附件总量过大，请减少照片后提交');
      return;
    }
    if (!mounted) return;
    setState(() => submitting = true);
    try {
      await widget.onSubmit(body);
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) setState(() => error = '$e；填写内容已保留。请确认工单状态后重试。');
    } finally {
      if (mounted) setState(() => submitting = false);
    }
  }

  String? money(String? v) {
    if (v == null || !RegExp(r'^\d{1,7}(\.\d{1,2})?$').hasMatch(v)) {
      return '请输入最多两位小数的非负金额';
    }
    return null;
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: engineerAppBar(context, title: Text(actionNames[widget.action]!)),
    body: Form(
      key: key,
      child: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          if (widget.action == 'quote') ...[
            TextFormField(
              controller: parts,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              decoration: InputDecoration(
                labelText: widget.order.platform ? '服务报价（元）' : '配件费（元）',
              ),
              validator: money,
            ),
            const SizedBox(height: 16),
            if (!widget.order.platform)
              TextFormField(
                controller: labor,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: const InputDecoration(labelText: '人工费（元）'),
                validator: money,
              ),
            const SizedBox(height: 16),
          ],
          if (widget.action == 'complete' && widget.store != null)
            OutlinedButton.icon(
              onPressed: submitting
                  ? null
                  : () async {
                      final draft = await openPage<String>(
                        context,
                        RepairReportPage(
                          store: widget.store!,
                          order: widget.order,
                          returnDraft: true,
                        ),
                      );
                      if (draft != null && mounted) {
                        setState(() => note.text = draft);
                      }
                    },
              icon: const Icon(Icons.edit_note),
              label: const Text('根据现场记录整理报告'),
            ),
          TextFormField(
            controller: note,
            minLines: 4,
            maxLines: 8,
            maxLength: widget.action == 'quote' ? 1000 : 3000,
            decoration: InputDecoration(
              labelText: widget.action == 'quote' ? '报价说明' : '维修内容与验证结果',
            ),
            validator: (v) =>
                v == null || v.trim().length < 5 ? '请至少填写5个字' : null,
          ),
          if (widget.action == 'complete' && !widget.order.platform) ...[
            const SizedBox(height: 16),
            const Text('客户签名确认', style: TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 10),
            RepaintBoundary(
              key: signature,
              child: Container(
                height: 180,
                color: Colors.white,
                child: GestureDetector(
                  onPanStart: (d) =>
                      setState(() => strokes.add([d.localPosition])),
                  onPanUpdate: (d) =>
                      setState(() => strokes.last.add(d.localPosition)),
                  child: CustomPaint(
                    painter: SignaturePainter(strokes),
                    size: Size.infinite,
                  ),
                ),
              ),
            ),
            TextButton(
              onPressed: () => setState(strokes.clear),
              child: const Text('清除签名'),
            ),
            OutlinedButton.icon(
              onPressed: picking || photos.length >= 2 ? null : photo,
              icon: const Icon(Icons.add_photo_alternate_outlined),
              label: Text('添加维修照片（${photos.length}/2）'),
            ),
            TextButton.icon(
              onPressed: picking || photos.length >= 2
                  ? null
                  : () => photo(ImageSource.camera),
              icon: const Icon(Icons.photo_camera_outlined),
              label: const Text('拍摄维修照片'),
            ),
            if (photos.isNotEmpty) const Text('已添加照片；若提交失败，请留在此页保留填写内容。'),
          ],
          if (error != null)
            Text(error!, style: const TextStyle(color: Colors.red)),
          const SizedBox(height: 20),
          FilledButton(
            onPressed: submitting ? null : submit,
            child: Text(submitting ? '正在提交…' : '确认提交'),
          ),
        ],
      ),
    ),
  );
}

class SignaturePainter extends CustomPainter {
  final List<List<Offset>> strokes;
  SignaturePainter(this.strokes);
  @override
  void paint(Canvas c, Size s) {
    final p = Paint()
      ..color = Colors.black
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round;
    for (final points in strokes) {
      for (var i = 1; i < points.length; i++) {
        c.drawLine(points[i - 1], points[i], p);
      }
    }
  }

  @override
  bool shouldRepaint(covariant SignaturePainter old) => true;
}
