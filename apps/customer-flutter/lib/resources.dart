import 'dart:async';
import 'package:material_ui/material_ui.dart';
import 'package:url_launcher/url_launcher.dart';
import 'api.dart';
import 'common.dart';
import 'visual_gallery.dart';

Future<void> callPhone(BuildContext context, String phone) async {
  final p = phone.replaceAll(RegExp(r'[^+0-9]'), '');
  if (p.isEmpty) {
    notice(context, '暂无联系电话');
    return;
  }
  try {
    if (!await launchUrl(Uri(scheme: 'tel', path: p))) {
      throw const ApiFailure('当前设备无法拨打电话');
    }
  } catch (e) {
    if (context.mounted) notice(context, e);
  }
}

Future<void> openMap(BuildContext context, String address) async {
  if (address.trim().isEmpty || address == '—') {
    notice(context, '暂无完整地址');
    return;
  }
  if (!await confirm(context, '打开地图？', address)) return;
  try {
    await launchUrl(
      Uri.https('maps.apple.com', '/', {'q': address}),
      mode: LaunchMode.externalApplication,
    );
  } catch (e) {
    if (context.mounted) notice(context, '无法打开地图，请复制地址后查看。');
  }
}

class CompanyPage extends StatelessWidget {
  final Api api;
  final String id;
  const CompanyPage({super.key, required this.api, required this.id});
  @override
  Widget build(BuildContext context) => DataPage(
    title: '服务企业资料',
    load: () async => obj(await api.call('/market/visual/company/$id')),
    content: (c, d, r) => Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        section(
          text(d['name']),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(text(d['description'], '暂无服务介绍')),
              hint(
                '服务范围：${text(d['serviceArea'])}\n服务时间：${text(d['serviceHours'])}\n地址：${text(d['address'])}',
              ),
              Wrap(
                spacing: 8,
                children: [
                  OutlinedButton(
                    onPressed: () => callPhone(c, text(d['contactPhone'], '')),
                    child: const Text('联系企业'),
                  ),
                  OutlinedButton(
                    onPressed: () => openMap(c, text(d['address'], '')),
                    child: const Text('查看地址'),
                  ),
                ],
              ),
            ],
          ),
        ),
        OutlinedButton(
          onPressed: () => openPage(
            c,
            VisualGallery(
              api: api,
              kind: 'company',
              id: text(d['id']),
              title: '企业服务与团队',
            ),
          ),
          child: const Text('查看服务与团队照片'),
        ),
      ],
    ),
  );
}

class AddressList extends StatefulWidget {
  final Api api;
  const AddressList({super.key, required this.api});
  @override
  State<AddressList> createState() => _AddressListState();
}

class _AddressListState extends State<AddressList> {
  int version = 0;
  @override
  Widget build(BuildContext context) => DataPage(
    key: ValueKey(version),
    title: '服务地址管理',
    load: () async => {
      'items': rows(await widget.api.call('/customer/addresses')),
    },
    content: (c, d, reload) => Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        FilledButton.icon(
          onPressed: () async {
            if (await openPage<bool>(c, AddressForm(api: widget.api)) == true) {
              reload();
            }
          },
          icon: const Icon(Icons.add),
          label: const Text('新增服务地址'),
        ),
        const SizedBox(height: 20),
        ...rows(d['items']).map(
          (a) => section(
            text(a['label'], '服务地址'),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${text(a['province'])} ${text(a['city'])} ${text(a['district'])}\n${text(a['detail'])}',
                ),
                if (a['isDefault'] == true)
                  const Text('默认地址', style: TextStyle(color: clientAccent)),
                Wrap(
                  spacing: 12,
                  children: [
                    TextButton(
                      onPressed: () async {
                        if (await openPage<bool>(
                              c,
                              AddressForm(api: widget.api, address: a),
                            ) ==
                            true) {
                          reload();
                        }
                      },
                      child: const Text('编辑'),
                    ),
                    TextButton(
                      onPressed: () async {
                        if (!await confirm(
                          c,
                          '删除此地址？',
                          '已关联工单的历史地址由服务端判断是否允许删除。',
                        )) {
                          return;
                        }
                        try {
                          await widget.api.call(
                            '/customer/addresses/${a['id']}',
                            method: 'DELETE',
                          );
                          await reload();
                        } catch (e) {
                          if (c.mounted) notice(c, e);
                        }
                      },
                      child: const Text(
                        '删除',
                        style: TextStyle(color: clientDanger),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
        if (rows(d['items']).isEmpty) hint('暂无服务地址，请先新增。'),
      ],
    ),
  );
}

class AddressForm extends StatefulWidget {
  final Api api;
  final Json? address;
  const AddressForm({super.key, required this.api, this.address});
  @override
  State<AddressForm> createState() => _AddressFormState();
}

class _AddressFormState extends State<AddressForm> {
  final key = GlobalKey<FormState>();
  late final fields = {
    for (final k in ['province', 'city', 'district', 'detail', 'label'])
      k: TextEditingController(text: text(widget.address?[k], '')),
  };
  late bool def = widget.address?['isDefault'] == true;
  bool busy = false;
  String? error;
  @override
  void dispose() {
    for (final c in fields.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> submit() async {
    if (busy || !key.currentState!.validate()) return;
    setState(() => busy = true);
    try {
      await widget.api.call(
        '/customer/addresses${widget.address == null ? '' : '/${widget.address!['id']}'}',
        method: widget.address == null ? 'POST' : 'PUT',
        body: {
          for (final e in fields.entries) e.key: e.value.text.trim(),
          'isDefault': def,
        },
      );
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) setState(() => error = '$e；填写内容已保留。');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: clientAppBar(
      context,
      title: Text(widget.address == null ? '新增地址' : '编辑地址'),
    ),
    body: Form(
      key: key,
      child: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          ...{
            'province': '省份',
            'city': '城市',
            'district': '区县',
            'detail': '详细门牌地址',
            'label': '地址标签（选填）',
          }.entries.map(
            (e) => Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: TextFormField(
                controller: fields[e.key],
                decoration: InputDecoration(labelText: e.value),
                validator: (v) =>
                    e.key != 'label' && (v?.trim().isEmpty ?? true)
                    ? '请填写${e.value}'
                    : null,
              ),
            ),
          ),
          SwitchListTile(
            title: const Text('设为默认地址'),
            value: def,
            onChanged: busy ? null : (v) => setState(() => def = v),
          ),
          if (error != null) hint(error!),
          FilledButton(
            onPressed: busy ? null : submit,
            child: Text(busy ? '正在保存…' : '保存地址'),
          ),
        ],
      ),
    ),
  );
}

num invoiceAvailable(Json bill, List<Json> records) =>
    number(bill['paid']) -
    records
        .where(
          (r) =>
              r['kind'] == 'INVOICE' &&
              r['sourceId'] == bill['id'] &&
              ['REQUESTED', 'ISSUED'].contains(r['status']),
        )
        .fold<num>(0, (a, b) => a + number(b['amount']));

class BusinessPage extends StatelessWidget {
  final Api api;
  const BusinessPage({super.key, required this.api});
  @override
  Widget build(BuildContext context) => DataPage(
    title: '服务合同与发票',
    load: () async {
      final r = await Future.wait([
        api.call('/operations/contracts'),
        api.call('/operations/finance'),
      ]);
      return {'contracts': r[0], 'finance': r[1]};
    },
    content: (c, d, reload) {
      final finance = obj(d['finance']),
          records = rows(finance['records']),
          eligible = rows(
            finance['bills'],
          ).where((b) => invoiceAvailable(b, records) > 0).toList();
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          clientHeading('服务保障，清楚可查', '合同权益与开票记录，集中查看。'),
          section(
            '服务合同',
            Column(
              children: [
                ...rows(d['contracts']).map(
                  (v) => ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(text(v['title'])),
                    subtitle: Text(
                      '${text(v['number'])}\n${text(v['startDate'])} 至 ${text(v['endDate'])}\n状态：${text(v['status'])} · 金额 ¥ ${money(v['amount'])}',
                    ),
                  ),
                ),
                if (rows(d['contracts']).isEmpty) hint('暂无服务合同'),
              ],
            ),
          ),
          section(
            '申请发票',
            Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                hint('仅已登记付款且仍有开票额度的单据可申请；发票由企业财务办理。'),
                FilledButton(
                  onPressed: eligible.isEmpty
                      ? null
                      : () async {
                          if (await openPage<bool>(
                                c,
                                InvoiceForm(
                                  api: api,
                                  bills: eligible,
                                  records: records,
                                ),
                              ) ==
                              true) {
                            reload();
                          }
                        },
                  child: const Text('申请开票'),
                ),
              ],
            ),
          ),
          ...records
              .where((r) => r['kind'] == 'INVOICE')
              .map(
                (r) => section(
                  text(r['title']),
                  Text(
                    '${text(r['number'])}\n开票金额：¥ ${money(r['amount'])}\n${r['status'] == 'ISSUED' ? '已登记发票' : '待财务办理'}\n税号：${text(r['taxNumber'], '个人抬头')}\n发票号码：${text(r['invoiceNumber'])}',
                  ),
                ),
              ),
        ],
      );
    },
  );
}

class InvoiceForm extends StatefulWidget {
  final Api api;
  final List<Json> bills, records;
  const InvoiceForm({
    super.key,
    required this.api,
    required this.bills,
    required this.records,
  });
  @override
  State<InvoiceForm> createState() => _InvoiceFormState();
}

class _InvoiceFormState extends State<InvoiceForm> {
  final key = GlobalKey<FormState>(),
      title = TextEditingController(),
      tax = TextEditingController();
  String? bill, error;
  bool busy = false;
  @override
  void dispose() {
    title.dispose();
    tax.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    if (busy || !key.currentState!.validate()) return;
    final b = widget.bills.firstWhere((b) => b['id'] == bill);
    setState(() => busy = true);
    try {
      await widget.api.call(
        '/operations/invoices',
        method: 'POST',
        body: {
          'sourceType': b['sourceType'],
          'sourceId': b['id'],
          'title': title.text.trim(),
          'taxNumber': tax.text.trim(),
        },
      );
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) setState(() => error = '$e；输入已保留，请先核对申请记录。');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: clientAppBar(context, title: const Text('申请开票')),
    body: Form(
      key: key,
      child: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          DropdownButtonFormField<String>(
            initialValue: bill,
            isExpanded: true,
            decoration: const InputDecoration(labelText: '选择已付款单据'),
            items: widget.bills
                .map(
                  (b) => DropdownMenuItem(
                    value: text(b['id']),
                    child: Text(
                      '${text(b['number'])} · ¥ ${money(invoiceAvailable(b, widget.records))}',
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                )
                .toList(),
            onChanged: (v) => bill = v,
            validator: (v) => v == null ? '请选择单据' : null,
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: title,
            maxLength: 100,
            decoration: const InputDecoration(labelText: '发票抬头'),
            validator: (v) => (v?.trim().length ?? 0) < 2 ? '请至少填写2个字' : null,
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: tax,
            maxLength: 30,
            decoration: const InputDecoration(labelText: '税号（个人可不填）'),
          ),
          if (error != null) hint(error!),
          FilledButton(
            onPressed: busy ? null : submit,
            child: Text(busy ? '正在提交…' : '提交开票申请'),
          ),
        ],
      ),
    ),
  );
}

class ChatPage extends StatefulWidget {
  final Api api;
  const ChatPage({super.key, required this.api});
  @override
  State<ChatPage> createState() => _ChatPageState();
}

class _ChatPageState extends State<ChatPage> {
  List<Json> services = [], messages = [];
  String? service, error;
  final input = TextEditingController();
  Timer? timer;
  bool busy = false, reading = false;
  int generation = 0;
  @override
  void initState() {
    super.initState();
    init();
    timer = Timer.periodic(const Duration(seconds: 8), (_) {
      if (ModalRoute.of(context)?.isCurrent == true &&
          WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed) {
        load();
      }
    });
  }

  Future<void> init() async {
    try {
      services = rows(await widget.api.call('/identity/services'));
      if (services.length == 1) service = text(services.first['id']);
      if (mounted) setState(() {});
      await load();
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    }
  }

  Future<void> load() async {
    if (service == null || reading) return;
    reading = true;
    final current = ++generation, selected = service;
    try {
      final rowsValue = rows(
        await widget.api.call(scoped('/ai/chats', selected)),
      );
      if (mounted && current == generation && service == selected) {
        setState(() {
          messages = rowsValue;
          error = null;
        });
      }
    } catch (e) {
      if (mounted && current == generation) setState(() => error = '$e');
    } finally {
      if (current == generation) reading = false;
    }
  }

  Future<void> send() async {
    if (busy || service == null || input.text.trim().isEmpty) return;
    setState(() => busy = true);
    try {
      await widget.api.call(
        scoped('/ai/chat', service),
        method: 'POST',
        body: {'message': input.text.trim(), 'serviceId': service},
      );
      input.clear();
      await load();
    } catch (e) {
      if (mounted) setState(() => error = '$e；消息内容已保留，请核对聊天记录后重试。');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  void dispose() {
    timer?.cancel();
    generation++;
    input.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: clientAppBar(context, title: const Text('联系服务')),
    body: Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(16),
          child: DropdownButtonFormField<String>(
            initialValue: service,
            isExpanded: true,
            decoration: const InputDecoration(labelText: '选择服务企业'),
            items: services
                .map(
                  (s) => DropdownMenuItem(
                    value: text(s['id']),
                    child: Text(
                      text(s['name']),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                )
                .toList(),
            onChanged: busy
                ? null
                : (v) {
                    generation++;
                    setState(() {
                      service = v;
                      messages = [];
                    });
                    load();
                  },
          ),
        ),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            children: [
              if (error != null) hint(error!),
              if (service == null) hint('请先选择要联系的服务企业。'),
              ...messages.map(
                (m) => Align(
                  alignment: m['direction'] == 'INBOUND'
                      ? Alignment.centerRight
                      : Alignment.centerLeft,
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 12),
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: m['direction'] == 'INBOUND'
                          ? const Color(0xffeaf2ff)
                          : Colors.white,
                      border: Border.all(color: clientLine),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(text(m['content'])),
                  ),
                ),
              ),
            ],
          ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: input,
                    minLines: 1,
                    maxLines: 4,
                    decoration: const InputDecoration(hintText: '描述设备现象或维修需求'),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton(
                  tooltip: '发送消息',
                  onPressed: busy || service == null ? null : send,
                  icon: const Icon(Icons.send_outlined, color: clientAccent),
                ),
              ],
            ),
          ),
        ),
      ],
    ),
  );
}

class TrainingPage extends StatelessWidget {
  final Api api;
  const TrainingPage({super.key, required this.api});
  @override
  Widget build(BuildContext context) => DataPage(
    title: '培训与服务资源',
    load: () async => {'items': rows(await api.call('/market/courses'))},
    content: (c, d, r) => Column(
      children: [
        hint('查看培训资料与场地，实际报名和资格以平台审核为准。'),
        ...rows(d['items']).map(
          (course) => section(
            text(course['title']),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${text(course['center_name'])} · ${text(course['city'])}',
                ),
                Text('日期：${text(course['start_date'])}'),
                Text(text(course['description'], '暂无课程说明')),
                TextButton(
                  onPressed: () => openMap(c, text(course['address'], '')),
                  child: const Text('查看培训地址'),
                ),
                OutlinedButton(
                  onPressed: () => openPage(
                    c,
                    VisualGallery(
                      api: api,
                      kind: 'course',
                      id: text(course['id']),
                      title: '培训场地与资料',
                    ),
                  ),
                  child: const Text('查看场地资料'),
                ),
              ],
            ),
          ),
        ),
        if (rows(d['items']).isEmpty) hint('暂无已发布培训'),
      ],
    ),
  );
}

class FeedbackPage extends StatefulWidget {
  final Api api;
  const FeedbackPage({super.key, required this.api});
  @override
  State<FeedbackPage> createState() => _FeedbackPageState();
}

class _FeedbackPageState extends State<FeedbackPage> {
  final textController = TextEditingController();
  bool busy = false;
  String? error;
  @override
  void dispose() {
    textController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: clientAppBar(context, title: const Text('意见与服务反馈')),
    body: ListView(
      padding: const EdgeInsets.all(24),
      children: [
        hint('退款请从对应订单提交，便于核对实际付款。'),
        TextField(
          controller: textController,
          minLines: 5,
          maxLines: 10,
          maxLength: 2000,
          decoration: const InputDecoration(labelText: '反馈内容'),
        ),
        if (error != null) hint(error!),
        FilledButton(
          onPressed: busy
              ? null
              : () async {
                  if (textController.text.trim().length < 5) {
                    setState(() => error = '请至少填写5个字');
                    return;
                  }
                  setState(() => busy = true);
                  try {
                    await widget.api.call(
                      '/customer/complaints',
                      method: 'POST',
                      body: {
                        'complaintType': 'COMPLAINT',
                        'content': textController.text.trim(),
                        'level': 1,
                      },
                    );
                    if (context.mounted) {
                      notice(context, '反馈已提交');
                      Navigator.pop(context);
                    }
                  } catch (e) {
                    if (mounted) setState(() => error = '$e；内容已保留。');
                  } finally {
                    if (mounted) setState(() => busy = false);
                  }
                },
          child: Text(busy ? '正在提交…' : '提交反馈'),
        ),
      ],
    ),
  );
}
