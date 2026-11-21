import 'package:material_ui/material_ui.dart';

import 'api.dart';
import 'common.dart';
import 'store.dart';
import 'iot_screen.dart';
import 'visual_gallery.dart';
import 'resources.dart';

class CustomerOrderDetail extends StatefulWidget {
  final CustomerStore store;
  final CustomerOrder order;
  const CustomerOrderDetail({
    super.key,
    required this.store,
    required this.order,
  });
  @override
  State<CustomerOrderDetail> createState() => _CustomerOrderDetailState();
}

class _CustomerOrderDetailState extends State<CustomerOrderDetail> {
  CustomerOrder? current;
  bool loading = false, submitting = false;
  String? error;
  Api get api => widget.store.api;
  CustomerOrder get order => current ?? widget.order;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    if (loading) return;
    setState(() => loading = true);
    try {
      final data = obj(
        await api.call(
          order.platform
              ? '/market/requests/${order.id}'
              : '/customer/work-orders/${order.id}',
        ),
      );
      if (mounted) {
        setState(() {
          current = CustomerOrder(data, platform: order.platform);
          error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> execute(String action, Json values) async {
    final o = current;
    if (o == null) throw const ApiFailure('请先读取最新订单');
    try {
      if (o.platform) {
        await api.call(
          '/market/requests/${o.id}/action',
          method: 'POST',
          body: {
            'action': action == 'accept-service' ? 'confirm' : action,
            'version': o.data['version'],
            ...values,
          },
        );
      } else if (action == 'review') {
        await api.call(
          '/customer/reviews',
          method: 'POST',
          body: {'workOrderId': o.id, ...values},
        );
      } else if (action == 'refund') {
        await api.call(
          '/customer/refund',
          method: 'POST',
          body: {'workOrderId': o.id, ...values},
        );
      } else {
        final path = action == 'confirm-quote' || action == 'refuse-quote'
            ? 'confirm'
            : action;
        await api.call(
          '/customer/work-orders/${o.id}/$path',
          method: 'POST',
          body: action == 'confirm-quote'
              ? {'confirm': true}
              : action == 'refuse-quote'
              ? {'confirm': false, 'refuseReason': values['reason']}
              : values,
        );
      }
      await load();
      await widget.store.refresh(3);
    } catch (e) {
      await load();
      rethrow;
    }
  }

  Future<void> act(String action) async {
    if (current == null || loading || submitting) return;
    setState(() => submitting = true);
    try {
      if (['cancel', 'review', 'refund', 'refuse-quote'].contains(action)) {
        final ok = await openPage<bool>(
          context,
          CustomerActionForm(
            order: order,
            action: action,
            onSubmit: (d) => execute(action, d),
          ),
        );
        if (ok == true && mounted) await load();
      } else {
        final payment = action.startsWith('pay-');
        if (!await confirm(
          context,
          actionLabels[action] ?? '确认操作',
          payment
              ? '当前为演示支付接口，不产生真实扣款。是否继续更新演示订单状态？'
              : action == 'accept-service'
              ? '请先核对维修结果和完工记录，确认后完成服务验收。'
              : '请核对服务范围和费用后确认。',
        )) {
          return;
        }
        try {
          await execute(action, {});
          if (mounted) notice(context, '订单状态已更新');
        } catch (e) {
          if (mounted) notice(context, e);
        }
      }
    } finally {
      if (mounted) setState(() => submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final o = order, d = o.data, address = d['address'];
    final addressText = address is Map
        ? [
            'province',
            'city',
            'district',
            'detail',
          ].map((k) => text(address[k], '')).join(' ')
        : text(address);
    return Scaffold(
      appBar: clientAppBar(
        context,
        title: const Text('服务订单详情'),
        actions: [
          IconButton(
            tooltip: '刷新订单',
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
            if (error != null)
              section(
                '读取提示',
                Column(
                  children: [
                    Text(error!),
                    TextButton(onPressed: load, child: const Text('重新加载')),
                  ],
                ),
              ),
            Row(
              children: [
                statusTag(o.label, o.status),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    o.number,
                    textAlign: TextAlign.right,
                    style: const TextStyle(fontSize: 12, color: clientMuted),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),
            section(
              '本次服务',
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
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Text(o.title),
                  Text(
                    '履约企业：${o.provider}',
                    style: const TextStyle(color: clientMuted),
                  ),
                  const SizedBox(height: 8),
                  Text(o.description),
                ],
              ),
            ),
            if (o.actions.isNotEmpty)
              softPanel(
                Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      '当前可办理',
                      style: TextStyle(fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 12),
                    ...o.actions.map(
                      (a) => Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: ['cancel', 'refund'].contains(a)
                            ? OutlinedButton(
                                onPressed:
                                    loading || submitting || current == null
                                    ? null
                                    : () => act(a),
                                child: Text(actionLabels[a]!),
                              )
                            : FilledButton(
                                onPressed:
                                    loading || submitting || current == null
                                    ? null
                                    : () => act(a),
                                child: Text(actionLabels[a]!),
                              ),
                      ),
                    ),
                    if (!o.platform &&
                        o.status == 'PENDING_PAYMENT' &&
                        d['customerConfirm'] != true)
                      TextButton(
                        onPressed: loading || submitting
                            ? null
                            : () => act('refuse-quote'),
                        child: const Text(
                          '不接受此报价',
                          style: TextStyle(color: clientDanger),
                        ),
                      ),
                  ],
                ),
              ),
            section(
              '服务安排',
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('上门地址：$addressText'),
                  Text(
                    '工程师：${o.platform ? text(d['engineer_name']) : text(obj(d['engineer'])['name'])}',
                  ),
                  if (!o.platform)
                    TextButton(
                      onPressed: () => callPhone(
                        context,
                        text(obj(d['engineer'])['phone'], ''),
                      ),
                      child: const Text('联系工程师'),
                    ),
                  TextButton(
                    onPressed: () => openMap(context, addressText),
                    child: const Text('查看服务地址'),
                  ),
                ],
              ),
            ),
            section(
              '费用与记录',
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (o.platform)
                    Text('服务报价：¥ ${money(d['quote_amount'])}')
                  else ...[
                    Text('配件费用：¥ ${money(d['partsFee'])}'),
                    Text('人工费用：¥ ${money(d['laborFee'])}'),
                    Text('已登记定金：¥ ${money(d['prepayAmount'])}'),
                    Text('已登记尾款：¥ ${money(d['finalPaymentAmount'])}'),
                  ],
                  const SizedBox(height: 12),
                  Text(
                    text(
                      d[o.platform ? 'report' : 'repairReport'],
                      text(
                        obj(d['maintenanceRecord'])['repairContent'],
                        '暂无完工记录',
                      ),
                    ),
                  ),
                  Text(
                    '创建：${dateLabel(d[o.platform ? 'created_at' : 'createdAt'])}',
                    style: const TextStyle(fontSize: 12, color: clientMuted),
                  ),
                ],
              ),
            ),
            OutlinedButton.icon(
              onPressed: () => openPage(
                context,
                VisualGallery(
                  api: api,
                  kind: o.platform ? 'request' : 'legacy',
                  id: o.id,
                  title: '报修与完工照片',
                ),
              ),
              icon: const Icon(Icons.photo_library_outlined),
              label: const Text('查看报修与完工照片'),
            ),
            if (o.deviceId.isNotEmpty)
              OutlinedButton.icon(
                onPressed: () => openPage(
                  context,
                  IoTScreen(api: api, deviceId: o.deviceId),
                ),
                icon: const Icon(Icons.monitor_heart_outlined),
                label: const Text('查看本单设备运行数据'),
              ),
            if (!o.platform && o.status == 'COMPLETED' && d['review'] != null)
              section(
                '服务评价',
                Text(
                  '${text(obj(d['review'])['rating'])} 分 · ${text(obj(d['review'])['content'], '已评价')}',
                ),
              ),
            if (o.platform && rows(d['events']).isNotEmpty)
              section(
                '服务处理记录',
                Column(
                  children: rows(d['events'])
                      .map(
                        (e) => ListTile(
                          contentPadding: EdgeInsets.zero,
                          title: Text(text(e['note'], text(e['action']))),
                          subtitle: Text(dateLabel(e['created_at'])),
                        ),
                      )
                      .toList(),
                ),
              ),
            if (!o.platform)
              TextButton(
                onPressed: () => openPage(
                  context,
                  DataPage(
                    title: '退款申请记录',
                    load: () async {
                      try {
                        return obj(await api.call('/customer/refund/${o.id}'));
                      } on ApiFailure catch (e) {
                        if (e.status == 404) return {};
                        rethrow;
                      }
                    },
                    content: (c, d, reload) => d.isEmpty
                        ? hint('暂无退款申请')
                        : section(
                            '处理进度',
                            Text(
                              '${text(d['status'])}\n金额 ¥ ${money(d['refundAmount'])}\n${text(d['content'])}',
                            ),
                          ),
                  ),
                ),
                child: const Text('查看退款申请记录'),
              ),
          ],
        ),
      ),
    );
  }
}

class CustomerActionForm extends StatefulWidget {
  final CustomerOrder order;
  final String action;
  final Future<void> Function(Json) onSubmit;
  const CustomerActionForm({
    super.key,
    required this.order,
    required this.action,
    required this.onSubmit,
  });
  @override
  State<CustomerActionForm> createState() => _CustomerActionFormState();
}

class _CustomerActionFormState extends State<CustomerActionForm> {
  final key = GlobalKey<FormState>(),
      note = TextEditingController(),
      amount = TextEditingController();
  double rating = 5;
  bool busy = false;
  String? error;
  @override
  void dispose() {
    note.dispose();
    amount.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    if (busy || !key.currentState!.validate()) return;
    setState(() => busy = true);
    try {
      final a = widget.action;
      final values = a == 'review'
          ? {
              'rating': rating.round(),
              'content': note.text.trim(),
              'isAnonymous': false,
            }
          : a == 'refund'
          ? {'amount': double.parse(amount.text), 'reason': note.text.trim()}
          : widget.order.platform
          ? {'note': note.text.trim()}
          : {'reason': note.text.trim()};
      await widget.onSubmit(values);
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) setState(() => error = '$e；填写内容已保留，请核对最新订单状态。');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final refund = widget.action == 'refund',
        review = widget.action == 'review',
        paid =
            number(widget.order.data['prepayAmount']) +
            number(widget.order.data['finalPaymentAmount']);
    return Scaffold(
      appBar: clientAppBar(
        context,
        title: Text(actionLabels[widget.action] ?? '拒绝报价'),
      ),
      body: Form(
        key: key,
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            section(widget.order.model, Text(widget.order.number)),
            if (review) ...[
              Text('服务评分：${rating.round()} 分'),
              Slider(
                value: rating,
                min: 1,
                max: 5,
                divisions: 4,
                label: '${rating.round()}分',
                onChanged: busy ? null : (v) => setState(() => rating = v),
              ),
            ],
            if (refund) ...[
              hint('已登记支付合计 ¥ ${money(paid)}；申请需由服务企业审核。'),
              TextFormField(
                controller: amount,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: const InputDecoration(labelText: '申请退款金额（元）'),
                validator: (v) {
                  final n = num.tryParse(v ?? '');
                  return n == null || !n.isFinite || n <= 0 || n > paid
                      ? '请输入不超过已支付金额的有效数值'
                      : null;
                },
              ),
              const SizedBox(height: 16),
            ],
            TextFormField(
              controller: note,
              minLines: 4,
              maxLines: 7,
              maxLength: 1000,
              decoration: InputDecoration(labelText: review ? '评价内容' : '请说明原因'),
              validator: (v) => (v?.trim().length ?? 0) < 2 ? '请至少填写2个字' : null,
            ),
            if (error != null)
              Text(error!, style: const TextStyle(color: clientDanger)),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: busy ? null : submit,
              child: Text(busy ? '正在提交…' : '确认提交'),
            ),
          ],
        ),
      ),
    );
  }
}
