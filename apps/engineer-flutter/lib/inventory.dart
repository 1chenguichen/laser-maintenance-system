import 'package:material_ui/material_ui.dart';
import 'api.dart';
import 'store.dart';
import 'common.dart';
import 'visual_gallery.dart';
import 'order_detail.dart';

const materialStates = {
  'PENDING': '待审批',
  'APPROVED': '已批准 · 待发货',
  'SHIPPED': '在途 · 待收货',
  'RECEIVED': '已收货',
  'REJECTED': '已驳回',
};
String? materialAction(Json r) =>
    r['kind'] == 'ISSUE' && r['status'] == 'SHIPPED'
    ? 'receive'
    : r['kind'] == 'RETURN' && r['status'] == 'APPROVED'
    ? 'ship'
    : null;

class InventoryPage extends StatefulWidget {
  final EngineerStore store;
  final String? serviceId, workOrderId;
  const InventoryPage({
    super.key,
    required this.store,
    this.serviceId,
    this.workOrderId,
  });
  @override
  State<InventoryPage> createState() => _InventoryPageState();
}

class _InventoryPageState extends State<InventoryPage> {
  String? selected, error;
  List<Json> employers = [];
  Json data = {};
  bool loading = false, busy = false;
  int tab = 0;
  String search = '';
  Api get api => widget.store.api;
  @override
  void initState() {
    super.initState();
    selected = widget.serviceId;
    load();
  }

  Future<void> load() async {
    if (loading) return;
    setState(() => loading = true);
    try {
      final me = obj(await api.call('/market/me'));
      employers = rows(me['employers']);
      if (!employers.any((e) => e['id'] == selected)) {
        selected = employers.isEmpty ? null : text(employers.first['id']);
      }
      if (selected == null) {
        if (mounted) setState(() => data = {});
        return;
      }
      final result = await Future.wait(
        [
          '/operations/mobile',
          '/operations/warehouses',
          '/parts',
          '/engineer/orders?status=REPAIRING',
          '/operations/journal',
        ].map((p) => api.call(scoped(p, selected))),
      );
      if (mounted) {
        setState(() {
          data = {
            'mobile': result[0],
            'warehouses': result[1],
            'parts': result[2],
            'orders': result[3],
            'journal': result[4],
          };
          error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> form(String kind) async {
    if (selected == null || data.isEmpty) return;
    final success = await openPage<bool>(
      context,
      MaterialForm(
        api: api,
        serviceId: selected!,
        kind: kind,
        data: data,
        workOrderId: widget.workOrderId,
      ),
    );
    if (success == true) {
      await load();
      await widget.store.ordersChanged();
      if (mounted) setState(() => tab = kind == 'CONSUME' ? 2 : 1);
    }
  }

  Future<void> action(Json r) async {
    final a = materialAction(r);
    if (a == null || busy) return;
    final yes = await confirm(
      context,
      a == 'receive' ? '确认已收到配件？' : '确认配件已寄回？',
      '${text(obj(r['part'])['name'])} × ${r['quantity']}；确认后将更新库存流转状态。',
    );
    if (!yes || !mounted) return;
    setState(() => busy = true);
    try {
      await api.call(
        scoped('/operations/requests/${r['id']}/$a', selected),
        method: 'POST',
        body: {},
      );
      await load();
      if (mounted) notice(context, '操作已完成');
    } catch (e) {
      if (mounted) notice(context, '$e；请先刷新确认单据状态后再操作');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  bool matches(Json r) =>
      search.isEmpty ||
      '${r['number']} ${obj(r['part'])['name']} ${obj(r['part'])['code']} ${r['note']}'
          .toLowerCase()
          .contains(search.toLowerCase());
  Widget stock(Json r) => section(
    text(obj(r['part'])['name']),
    Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '${text(obj(r['part'])['code'])} · ${text(obj(r['part'])['unit'])}',
        ),
        const SizedBox(height: 10),
        Text(
          '可用 ${number(r['quantity']) - number(r['reservedQuantity'])}',
          style: const TextStyle(
            fontSize: 28,
            color: brand,
            fontWeight: FontWeight.w600,
          ),
        ),
        Text('在库 ${text(r['quantity'])} · 预留 ${text(r['reservedQuantity'])}'),
        TextButton.icon(
          onPressed: () => openPage(
            context,
            VisualGallery(
              api: api,
              kind: 'part',
              id: text(obj(r['part'])['id']),
              title: '配件资料',
            ),
          ),
          icon: const Icon(Icons.photo_outlined),
          label: const Text('查看配件实物与型号'),
        ),
      ],
    ),
  );
  @override
  Widget build(BuildContext context) {
    final mobile = obj(data['mobile']),
        stockRows = rows(
          mobile['inventory'],
        ).where((r) => number(r['quantity']) > 0 && matches(r)),
        requests = rows(mobile['requests']).where(matches),
        journal = rows(data['journal']).where(matches);
    return Scaffold(
      appBar: engineerAppBar(
        context,
        title: const Text('我的移动仓'),
        actions: [
          IconButton(
            tooltip: '刷新库存',
            onPressed: loading ? null : load,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: load,
        child: ListView(
          padding: const EdgeInsets.all(24),
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            if (loading || busy) const LinearProgressIndicator(minHeight: 2),
            if (error != null) section('读取提示', Text(error!)),
            if (employers.length > 1)
              DropdownButtonFormField<String>(
                key: ValueKey(selected),
                initialValue: selected,
                decoration: const InputDecoration(labelText: '当前服务企业'),
                items: employers
                    .map(
                      (e) => DropdownMenuItem(
                        value: text(e['id']),
                        child: Text(
                          text(e['name']),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    )
                    .toList(),
                onChanged: loading || busy || widget.serviceId != null
                    ? null
                    : (v) {
                        setState(() {
                          selected = v;
                          data = {};
                        });
                        load();
                      },
              ),
            if (employers.isEmpty && !loading)
              hint('平台合作身份未关联企业移动仓，请使用平台工单服务。'),
            if (data.isNotEmpty) ...[
              section(
                text(obj(mobile['warehouse'])['name'], '移动仓'),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '本人库存可用合计 ${rows(mobile['inventory']).fold<num>(0, (sum, r) => sum + number(r['quantity']) - number(r['reservedQuantity']))}',
                      style: const TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    hint('领料、寄回与收货分别确认；工单用料提交后会实际扣减库存。'),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        FilledButton.tonal(
                          onPressed: loading || busy
                              ? null
                              : () => form('ISSUE'),
                          child: const Text('申请领料'),
                        ),
                        OutlinedButton(
                          onPressed: loading || busy
                              ? null
                              : () => form('RETURN'),
                          child: const Text('申请退料'),
                        ),
                        OutlinedButton(
                          onPressed: loading || busy
                              ? null
                              : () => form('CONSUME'),
                          child: const Text('登记工单用料'),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              TextField(
                onChanged: (v) => setState(() => search = v),
                decoration: const InputDecoration(
                  prefixIcon: Icon(Icons.search),
                  hintText: '搜索配件、单据或备注',
                ),
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                children: ['库存', '领退料单', '库存流水'].indexed
                    .map(
                      (e) => ChoiceChip(
                        label: Text(e.$2),
                        selected: tab == e.$1,
                        onSelected: (_) => setState(() => tab = e.$1),
                      ),
                    )
                    .toList(),
              ),
              const SizedBox(height: 14),
              if (tab == 0) ...[
                ...stockRows.map(stock),
                if (stockRows.isEmpty) hint('暂无匹配库存。领料申请发货后，请确认收货。'),
              ],
              if (tab == 1) ...[
                ...requests.map(
                  (r) => section(
                    '${r['kind'] == 'ISSUE' ? '领料' : '退料'} · ${text(r['number'])}',
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          materialStates[r['status']] ?? text(r['status']),
                          style: const TextStyle(color: brand),
                        ),
                        Text(
                          '${text(obj(r['part'])['name'])} × ${text(r['quantity'])}',
                        ),
                        Text(
                          '${text(obj(r['sourceWarehouse'])['name'])} → ${text(obj(r['targetWarehouse'])['name'])}',
                        ),
                        if (text(r['reviewNote'], '').isNotEmpty)
                          Text(text(r['reviewNote'])),
                        if (materialAction(r) != null)
                          FilledButton(
                            onPressed: busy ? null : () => action(r),
                            child: Text(
                              materialAction(r) == 'receive' ? '确认收货' : '确认寄回',
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
                if (requests.isEmpty) hint('暂无匹配的领退料单据'),
              ],
              if (tab == 2) ...[
                ...journal.map(
                  (r) => Card(
                    child: ListTile(
                      title: Text(
                        '${text(obj(r['part'])['name'])} · ${text(r['action'])}',
                      ),
                      subtitle: Text(
                        '${dateLabel(r['createdAt'])}\n${text(r['note'], '')}',
                      ),
                      trailing: Text(
                        '${text(r['quantity'])} ${text(obj(r['part'])['unit'], '')}',
                      ),
                      onTap: r['workOrderId'] == null
                          ? null
                          : () => openPage(
                              context,
                              OrderDetail(
                                store: widget.store,
                                order: ServiceOrder({'id': r['workOrderId']}),
                              ),
                            ),
                    ),
                  ),
                ),
                if (journal.isEmpty) hint('暂无库存流转记录'),
              ],
            ],
          ],
        ),
      ),
    );
  }
}

class MaterialForm extends StatefulWidget {
  final Api api;
  final String serviceId, kind;
  final Json data;
  final String? workOrderId;
  const MaterialForm({
    super.key,
    required this.api,
    required this.serviceId,
    required this.kind,
    required this.data,
    this.workOrderId,
  });
  @override
  State<MaterialForm> createState() => _MaterialFormState();
}

class _MaterialFormState extends State<MaterialForm> {
  final key = GlobalKey<FormState>();
  final quantity = TextEditingController(text: '1'),
      note = TextEditingController();
  String? warehouse, part, order, error;
  bool busy = false;
  @override
  void initState() {
    super.initState();
    final orders = rows(widget.data['orders']);
    if (orders.any((r) => r['id'] == widget.workOrderId)) {
      order = widget.workOrderId;
    }
  }

  @override
  void dispose() {
    quantity.dispose();
    note.dispose();
    super.dispose();
  }

  List<Json> get parts => widget.kind == 'ISSUE'
      ? rows(widget.data['parts']).where((r) => r['isActive'] != false).toList()
      : rows(obj(widget.data['mobile'])['inventory'])
            .where((r) => number(r['quantity']) > number(r['reservedQuantity']))
            .map(
              (r) => {
                ...obj(r['part']),
                'available':
                    number(r['quantity']) - number(r['reservedQuantity']),
              },
            )
            .toList();
  Future<void> submit() async {
    if (busy || !key.currentState!.validate()) return;
    setState(() => busy = true);
    try {
      final body = <String, dynamic>{
        'partId': part,
        'quantity': int.parse(quantity.text),
        'note': note.text.trim(),
        if (widget.kind == 'CONSUME')
          'workOrderId': order
        else ...{
          'kind': widget.kind,
          'warehouseId': warehouse,
        },
      };
      await widget.api.call(
        scoped(
          widget.kind == 'CONSUME'
              ? '/operations/consume'
              : '/operations/requests',
          widget.serviceId,
        ),
        method: 'POST',
        body: body,
      );
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) setState(() => error = '$e；内容已保留，请先确认操作结果再重试。');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final consume = widget.kind == 'CONSUME';
    return PopScope(
      canPop: !busy,
      child: Scaffold(
        appBar: engineerAppBar(
          context,
          title: Text(
            consume
                ? '登记工单用料'
                : widget.kind == 'ISSUE'
                ? '申请领料'
                : '申请退料',
          ),
        ),
        body: Form(
          key: key,
          child: ListView(
            padding: const EdgeInsets.all(24),
            children: [
              hint(
                consume
                    ? '仅登记本人维修中工单的实际用料，提交后扣减移动仓库存。'
                    : '申请提交后由仓库审批，库存按实际发货与收货更新。',
              ),
              if (consume)
                DropdownButtonFormField<String>(
                  initialValue: order,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: '维修中工单'),
                  items: rows(widget.data['orders'])
                      .map(
                        (o) => DropdownMenuItem(
                          value: text(o['id']),
                          child: Text(
                            '${text(o['orderNo'])} · ${text(o['faultType'])}',
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      )
                      .toList(),
                  onChanged: busy ? null : (v) => setState(() => order = v),
                  validator: (v) => v == null ? '请选择维修中工单' : null,
                )
              else
                DropdownButtonFormField<String>(
                  initialValue: warehouse,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: '公司仓库'),
                  items: rows(widget.data['warehouses'])
                      .where(
                        (w) => w['kind'] == 'CENTRAL' && w['isActive'] != false,
                      )
                      .map(
                        (w) => DropdownMenuItem(
                          value: text(w['id']),
                          child: Text(
                            text(w['name']),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      )
                      .toList(),
                  onChanged: busy ? null : (v) => setState(() => warehouse = v),
                  validator: (v) => v == null ? '请选择仓库' : null,
                ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                initialValue: part,
                isExpanded: true,
                decoration: const InputDecoration(labelText: '配件'),
                items: parts
                    .map(
                      (p) => DropdownMenuItem(
                        value: text(p['id']),
                        child: Text(
                          '${text(p['name'])}${p['available'] == null ? '' : ' · 可用 ${p['available']}'}',
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    )
                    .toList(),
                onChanged: busy ? null : (v) => setState(() => part = v),
                validator: (v) => v == null ? '请选择配件' : null,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: quantity,
                enabled: !busy,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: '数量'),
                validator: (v) {
                  final n = int.tryParse(v ?? '');
                  if (n == null || n < 1 || n > 100000) return '请输入1至100000的整数';
                  final p = parts.where((r) => r['id'] == part).firstOrNull;
                  if (p?['available'] != null && n > number(p!['available'])) {
                    return '数量超过当前可用库存';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: note,
                enabled: !busy,
                maxLength: 500,
                minLines: 2,
                maxLines: 4,
                decoration: const InputDecoration(labelText: '用途或备注'),
              ),
              if (error != null)
                Text(error!, style: const TextStyle(color: Colors.red)),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: busy ? null : submit,
                child: Text(busy ? '正在提交…' : '确认提交'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
