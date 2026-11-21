import 'package:material_ui/material_ui.dart';
import 'api.dart';
import 'store.dart';
import 'order_detail.dart';
import 'common.dart';
import 'inventory.dart';
import 'assistant_pages.dart';
import 'profile_pages.dart';
import 'record_pages.dart';
import 'device_pages.dart';

const accent = Color(0xff176c50);

class EngineerScreen extends StatefulWidget {
  final int tab;
  final EngineerStore store;
  final bool visible;
  final void Function(int, [String?])? onNavigate;
  final String? requestedFilter;
  final int intent;
  final Future<void> Function() onLogout;
  const EngineerScreen({
    super.key,
    required this.tab,
    required this.store,
    required this.onLogout,
    this.visible = true,
    this.onNavigate,
    this.requestedFilter,
    this.intent = 0,
  });
  @override
  State<EngineerScreen> createState() => _EngineerScreenState();
}

class _EngineerScreenState extends State<EngineerScreen>
    with AutomaticKeepAliveClientMixin {
  String filter = '全部',
      search = '',
      subFilter = '全部进行中',
      source = '全部来源',
      team = '全部服务团队',
      courseQuery = '',
      courseState = '全部课程',
      poolQuery = '';
  int shown = 10;
  final companyPoolAnchor = GlobalKey();
  @override
  void initState() {
    super.initState();
    if (widget.requestedFilter != null) {
      filter = '进行中';
      subFilter = widget.requestedFilter!;
    }
  }

  @override
  void didUpdateWidget(covariant EngineerScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.intent != oldWidget.intent && widget.requestedFilter != null) {
      filter = '进行中';
      subFilter = widget.requestedFilter!;
      shown = 10;
    }
  }

  bool busy = false;
  String? serviceId;
  EngineerStore get s => widget.store;
  @override
  bool get wantKeepAlive => true;
  Future<void> run(Future<void> Function() action) async {
    if (busy) return;
    setState(() => busy = true);
    try {
      await action();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('$e')));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> open(ServiceOrder order) async {
    await Navigator.of(context).push(
      EngineerRoute<void>(
        builder: (_) => OrderDetail(store: s, order: order),
      ),
    );
  }

  List<Widget> notices() {
    return EngineerStore.paths[widget.tab]
        .where((p) => s.errors.containsKey(p))
        .map(
          (p) => Card(
            child: ListTile(
              leading: const Icon(Icons.info_outline),
              title: Text(s.errors[p]!),
              subtitle: Text(
                s.data.containsKey(p) ? '保留上次读取内容，请刷新确认当前状态' : '该部分暂未读取成功',
              ),
              trailing: IconButton(
                tooltip: '重试',
                icon: const Icon(Icons.refresh),
                onPressed: () => s.load(p),
              ),
            ),
          ),
        )
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final widgets = switch (widget.tab) {
      0 => home(),
      1 => pool(),
      2 => orders(),
      3 => courses(),
      _ => profile(),
    };
    return RefreshIndicator(
      onRefresh: () => s.refresh(widget.tab),
      child: ListView(
        key: PageStorageKey('tab-${widget.tab}'),
        physics: const AlwaysScrollableScrollPhysics(),
        padding: EdgeInsets.fromLTRB(
          MediaQuery.sizeOf(context).width < 360 ? 16 : 24,
          24,
          MediaQuery.sizeOf(context).width < 360 ? 16 : 24,
          28,
        ),
        children: [
          if (EngineerStore.paths[widget.tab].any(s.loading.contains))
            const LinearProgressIndicator(minHeight: 2),
          ...notices(),
          ...widgets,
        ],
      ),
    );
  }

  Widget heading(String title, [String? note]) => engineerHeading(title, note);
  Widget empty(String text) => Padding(
    padding: const EdgeInsets.all(28),
    child: Column(
      children: [
        const Icon(Icons.inbox_outlined, size: 40, color: engineerMuted),
        const SizedBox(height: 12),
        Text(text, textAlign: TextAlign.center),
      ],
    ),
  );
  Widget card(ServiceOrder o, {Widget? action, bool priority = false}) {
    final device = obj(o.data['device']);
    final addr = obj(o.data['address']);
    final city = text(
      o.data['city'],
      text(addr['city'], text(device['city'], '')),
    );
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: priority ? const Color(0xfffbfdfb) : Colors.white,
        border: priority
            ? Border.all(color: const Color(0xffb9d6c7))
            : const Border(bottom: BorderSide(color: engineerLine)),
        borderRadius: priority ? BorderRadius.circular(16) : null,
      ),
      child: InkWell(
        onTap: action == null ? () => open(o) : null,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: EdgeInsets.all(
            priority ? 16 : 0,
          ).copyWith(top: 16, bottom: 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      o.platform ? '设备服务 · 平台服务团队' : '设备服务 · 企业自有团队',
                      style: const TextStyle(
                        fontSize: 12,
                        color: engineerMuted,
                      ),
                    ),
                  ),
                  statusTag(o.label, o.status),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  ReferencePhoto(model: o.model),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      o.model,
                      style: const TextStyle(
                        fontSize: 16,
                        height: 1.5,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                'SN: ${text(device['serialNumber'], text(o.data['device_serial']))}',
                style: const TextStyle(fontSize: 12, color: engineerMuted),
              ),
              Text(o.title, style: const TextStyle(fontSize: 14)),
              const SizedBox(height: 8),
              Row(
                children: [
                  const Icon(Icons.location_on_outlined, size: 16),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Text(
                      '${city.isEmpty ? '' : '$city · '}${o.company}',
                      style: const TextStyle(
                        fontSize: 12,
                        color: engineerMuted,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              const Divider(height: 1),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      o.number,
                      style: const TextStyle(
                        fontSize: 10,
                        color: engineerMuted,
                      ),
                    ),
                  ),
                  if (action == null)
                    priority
                        ? FilledButton(
                            onPressed: () => open(o),
                            child: const Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  '查看任务与下一步',
                                  style: TextStyle(fontSize: 12),
                                ),
                                SizedBox(width: 8),
                                Icon(Icons.arrow_forward, size: 18),
                              ],
                            ),
                          )
                        : TextButton(
                            onPressed: () => open(o),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  o.action == null
                                      ? '查看详情'
                                      : actionNames[o.action]!,
                                  style: const TextStyle(fontSize: 12),
                                ),
                                const SizedBox(width: 6),
                                const Icon(Icons.arrow_forward, size: 18),
                              ],
                            ),
                          ),
                ],
              ),
              if (action != null)
                Align(alignment: Alignment.centerRight, child: action),
            ],
          ),
        ),
      ),
    );
  }

  Widget tool(IconData icon, String label, VoidCallback onTap) => InkWell(
    onTap: onTap,
    borderRadius: BorderRadius.circular(12),
    child: Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        border: Border.all(color: engineerLine),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, color: engineerAccent),
          const SizedBox(height: 8),
          Text(
            label,
            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
          ),
        ],
      ),
    ),
  );
  List<Widget> home() {
    final me = obj(s.data['/market/me']), person = obj(me['person']);
    final active = s.orders.where((o) => !o.finished).toList();
    const priority = [
      'REPAIRING',
      'IN_SERVICE',
      'ASSIGNED',
      'DISPATCHED',
      'APPROVED',
      'ACCEPTED',
      'REQUESTED',
      'QUOTED',
      'AWAITING_ACCEPTANCE',
      'PENDING_PAYMENT',
      'PENDING_FINAL_PAYMENT',
    ];
    int rank(ServiceOrder o) {
      final i = priority.indexOf(o.status);
      return i < 0 ? 99 : i;
    }

    active.sort((a, b) {
      final state = rank(a).compareTo(rank(b));
      if (state != 0) return state;
      final at = DateTime.tryParse(
        text(a.data[a.platform ? 'created_at' : 'createdAt']),
      );
      final bt = DateTime.tryParse(
        text(b.data[b.platform ? 'created_at' : 'createdAt']),
      );
      return (at?.millisecondsSinceEpoch ?? 0).compareTo(
        bt?.millisecondsSinceEpoch ?? 0,
      );
    });
    final counts = [
      active
          .where(
            (o) => [
              'DISPATCHED',
              'ASSIGNED',
              'ACCEPTED',
              'APPROVED',
            ].contains(o.status),
          )
          .length,
      active
          .where((o) => ['IN_SERVICE', 'REPAIRING'].contains(o.status))
          .length,
      active
          .where(
            (o) => [
              'PENDING_PAYMENT',
              'PENDING_FINAL_PAYMENT',
              'AWAITING_ACCEPTANCE',
              'QUOTED',
            ].contains(o.status),
          )
          .length,
    ];
    return [
      heading('今日服务工作台'),
      EngineerBanner(active: widget.visible),
      Padding(
        padding: const EdgeInsets.only(bottom: 20),
        child: Row(
          children: [
            ClipOval(
              child: Image.asset('assets/avatar.webp', width: 36, height: 36),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    text(person['name'], '工程师'),
                    style: const TextStyle(
                      fontSize: 18,
                      height: 28 / 18,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  Text(
                    rows(
                      me['employers'],
                    ).map((e) => text(e['name'])).join(' / '),
                    style: const TextStyle(fontSize: 12, color: engineerMuted),
                  ),
                ],
              ),
            ),
            TextButton(
              onPressed: () => openPage(context, EngineerProfilePage(store: s)),
              child: const Text('服务身份 ›', style: TextStyle(fontSize: 12)),
            ),
          ],
        ),
      ),
      Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          color: const Color(0xfff5f9f6),
          border: Border.all(color: engineerLine),
          borderRadius: BorderRadius.circular(12),
        ),
        child: IntrinsicHeight(
          child: Row(
            children: List.generate(
              3,
              (i) => Expanded(
                child: Container(
                  decoration: BoxDecoration(
                    border: i == 2
                        ? null
                        : const Border(right: BorderSide(color: engineerLine)),
                  ),
                  child: InkWell(
                    onTap: () => widget.onNavigate?.call(
                      2,
                      const ['待我处理', '服务中', '待客户确认'][i],
                    ),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 8),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${counts[i]}',
                            style: const TextStyle(
                              fontSize: 24,
                              height: 32 / 24,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(height: 12),
                          Text(
                            const ['待处理', '服务中', '待客户确认'][i],
                            style: const TextStyle(
                              fontSize: 12,
                              color: engineerMuted,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
      engineerSection(
        '下一项任务',
        trailing: TextButton(
          onPressed: () => widget.onNavigate?.call(2),
          child: const Text(
            '全部工单 ›',
            style: TextStyle(fontSize: 12, color: engineerMuted),
          ),
        ),
      ),
      if (active.isEmpty)
        empty('当前没有待履约任务')
      else
        card(active.first, priority: true),
      engineerSection('常用工具'),
      GridView.count(
        crossAxisCount: 2,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        crossAxisSpacing: 12,
        mainAxisSpacing: 12,
        childAspectRatio: MediaQuery.sizeOf(context).width < 360 ? 1.2 : 1.5,
        children: [
          tool(Icons.radar, '接单大厅', () => widget.onNavigate?.call(1)),
          tool(
            Icons.school_outlined,
            '培训与资质',
            () => widget.onNavigate?.call(3),
          ),
          tool(
            Icons.psychology_outlined,
            'AI 维修助手',
            () => openPage(context, AssistantPage(store: s)),
          ),
          tool(
            Icons.inventory_2_outlined,
            '移动仓',
            () => openPage(context, InventoryPage(store: s)),
          ),
        ],
      ),
      const SizedBox(height: 12),
      Wrap(
        spacing: 8,
        children: [
          TextButton.icon(
            onPressed: () => scanDevice(context, s.api),
            icon: const Icon(Icons.qr_code_scanner, size: 18),
            label: const Text('扫一扫'),
          ),
          TextButton.icon(
            onPressed: () => openPage(context, DeviceListPage(api: s.api)),
            icon: const Icon(Icons.monitor_heart_outlined, size: 18),
            label: const Text('任务设备'),
          ),
          TextButton.icon(
            onPressed: () => openPage(context, RepairReportPage(store: s)),
            icon: const Icon(Icons.edit_note, size: 18),
            label: const Text('维修报告'),
          ),
        ],
      ),
      if (active.length > 1) ...[
        engineerSection('其他待办'),
        ...active.skip(1).take(3).map((o) => card(o)),
      ],
    ];
  }

  List<Widget> orders() {
    if (team != '全部服务团队' && !s.orders.any((o) => o.company == team)) {
      team = '全部服务团队';
    }
    var all = s.orders.where((o) {
      final state =
          filter == '全部' ||
          filter == '进行中' && !o.finished ||
          filter == '已完成' && o.status == 'COMPLETED' ||
          filter == '已取消' && ['CANCELLED', 'REFUSED'].contains(o.status);
      final sub =
          filter != '进行中' ||
          subFilter == '全部进行中' ||
          subFilter == '待我处理' &&
              [
                'DISPATCHED',
                'ASSIGNED',
                'ACCEPTED',
                'APPROVED',
              ].contains(o.status) ||
          subFilter == '服务中' &&
              ['REPAIRING', 'IN_SERVICE'].contains(o.status) ||
          subFilter == '待客户确认' &&
              [
                'QUOTED',
                'PENDING_PAYMENT',
                'PENDING_FINAL_PAYMENT',
                'AWAITING_ACCEPTANCE',
              ].contains(o.status);
      return state &&
          sub &&
          (source == '全部来源' || (source == '平台服务') == o.platform) &&
          (team == '全部服务团队' || o.company == team) &&
          ('${o.number} ${o.title} ${o.model} ${o.company}'
              .toLowerCase()
              .contains(search.toLowerCase()));
    }).toList();
    return [
      heading('我的工单', '先处理待办，再查看服务记录。每张工单标注独立的履约企业。'),
      EngineerSegments(
        items: const ['全部', '进行中', '已完成', '已取消'],
        selected: filter,
        onChanged: (v) => setState(() {
          filter = v;
          shown = 10;
        }),
      ),
      if (filter == '进行中')
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Wrap(
            spacing: 8,
            runSpacing: 4,
            children: const ['全部进行中', '待我处理', '服务中', '待客户确认']
                .map(
                  (v) => ChoiceChip(
                    label: Text(v),
                    selected: subFilter == v,
                    onSelected: (_) => setState(() {
                      subFilter = v;
                      shown = 10;
                    }),
                  ),
                )
                .toList(),
          ),
        ),
      const SizedBox(height: 16),
      TextField(
        onChanged: (v) => setState(() {
          search = v;
          shown = 10;
        }),
        style: const TextStyle(fontSize: 16),
        decoration: const InputDecoration(hintText: '搜索设备、SN 或订单号'),
      ),
      const SizedBox(height: 8),
      Row(
        children: [
          Expanded(
            child: DropdownButtonFormField<String>(
              initialValue: source,
              isExpanded: true,
              items: const ['全部来源', '企业任务', '平台服务']
                  .map(
                    (v) => DropdownMenuItem(
                      value: v,
                      child: Text(v, style: const TextStyle(fontSize: 14)),
                    ),
                  )
                  .toList(),
              onChanged: (v) => setState(() {
                source = v!;
                shown = 10;
              }),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: DropdownButtonFormField<String>(
              initialValue: team,
              isExpanded: true,
              items: ['全部服务团队', ...s.orders.map((o) => o.company).toSet()]
                  .map(
                    (v) => DropdownMenuItem(
                      value: v,
                      child: Text(
                        v,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 14),
                      ),
                    ),
                  )
                  .toList(),
              onChanged: (v) => setState(() {
                team = v!;
                shown = 10;
              }),
            ),
          ),
        ],
      ),
      Padding(
        padding: const EdgeInsets.symmetric(vertical: 20),
        child: Text(
          '${all.length} 笔服务订单',
          style: const TextStyle(fontSize: 12, color: engineerMuted),
        ),
      ),
      if (all.isEmpty)
        empty('没有符合条件的工单')
      else
        ...all.take(shown).map((o) => card(o)),
      if (all.length > shown)
        OutlinedButton(
          onPressed: () => setState(() => shown += 10),
          child: Text('加载更多（已显示 $shown/${all.length}）'),
        ),
    ];
  }

  Future<void> refuse(ServiceOrder o) => run(() async {
    final controller = TextEditingController();
    final reason = await showDialog<String>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('拒绝本次指派'),
        content: TextField(
          controller: controller,
          maxLength: 500,
          minLines: 2,
          maxLines: 4,
          decoration: const InputDecoration(labelText: '说明原因'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(c),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () {
              if (controller.text.trim().length >= 2) {
                Navigator.pop(c, controller.text.trim());
              }
            },
            child: const Text('确认拒绝'),
          ),
        ],
      ),
    );
    if (reason == null) return;
    await s.api.call(
      '/engineer/refuse-designated/${o.id}',
      method: 'POST',
      body: {'reason': reason},
    );
    await s.refresh(1);
  });
  Future<void> claim(ServiceOrder o, {bool designated = false}) =>
      run(() async {
        final confirm = await showDialog<bool>(
          context: context,
          builder: (c) => AlertDialog(
            title: Text(designated ? '确认接受指派？' : '确认领取任务？'),
            content: Text('${o.title}\n${o.company}'),
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
        if (confirm != true) return;
        if (o.platform) {
          final employers = rows(obj(s.data['/market/me'])['employers']);
          if (serviceId == null && employers.length > 1) {
            throw const ApiFailure('请先选择本次接单的服务企业');
          }
          await s.api.call(
            '/market/requests/${o.id}/action',
            method: 'POST',
            body: {
              'action': 'claim',
              'version': o.data['version'],
              if (serviceId != null || employers.length == 1)
                'serviceId': serviceId ?? employers.first['id'],
            },
          );
        } else {
          await s.api.call(
            '/engineer/${designated ? 'accept-designated' : 'grab'}',
            method: 'POST',
            body: {'workOrderId': o.id},
          );
        }
        await s.ordersChanged();
        if (mounted) await open(o);
      });
  List<Widget> pool() {
    final employers = rows(obj(s.data['/market/me'])['employers']);
    final platform = rows(
      s.data['/market/pool'],
    ).map((r) => ServiceOrder({...r, 'status': 'REQUESTED'}, platform: true));
    final company = rows(
      s.data['/engineer/grab-pool'],
    ).map((r) => ServiceOrder(r));
    final designated = rows(
      s.data['/engineer/designated-orders'],
    ).map((r) => ServiceOrder(r));
    return [
      heading('接单大厅', '按服务城市与技能资格，领取适合的现场任务。'),
      softPanel(
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${platform.length} 项可接任务',
                    style: const TextStyle(fontSize: 22, height: 1.5),
                  ),
                  Text(
                    '接单审核：${obj(obj(s.data['/market/me'])['engineer'])['state'] == 'APPROVED' ? '已通过' : '待审核'}',
                    style: const TextStyle(color: engineerMuted),
                  ),
                ],
              ),
            ),
            TextButton(
              onPressed: () => openPage(context, EngineerProfilePage(store: s)),
              child: const Text('管理身份 ›'),
            ),
          ],
        ),
      ),
      if (employers.isNotEmpty)
        DropdownButtonFormField<String>(
          isExpanded: true,
          initialValue: serviceId,
          decoration: const InputDecoration(labelText: '开放需求使用的工作身份'),
          hint: const Text('请选择服务企业'),
          items: employers
              .map(
                (e) => DropdownMenuItem(
                  value: text(e['id']),
                  child: Text(text(e['name']), overflow: TextOverflow.ellipsis),
                ),
              )
              .toList(),
          onChanged: (v) => setState(() => serviceId = v),
        ),
      if (designated.isNotEmpty) ...[
        heading('企业指派'),
        ...designated.map(
          (o) => card(
            o,
            action: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                FilledButton(
                  onPressed: busy ? null : () => claim(o, designated: true),
                  child: const Text('接受指派'),
                ),
                TextButton(
                  onPressed: busy ? null : () => refuse(o),
                  child: const Text('拒绝本次'),
                ),
              ],
            ),
          ),
        ),
      ],
      const SizedBox(height: 16),
      Wrap(
        spacing: 8,
        children: [
          OutlinedButton(
            onPressed: () => widget.onNavigate?.call(3),
            child: const Text('培训与资质'),
          ),
          OutlinedButton(
            onPressed: () {
              final target = companyPoolAnchor.currentContext;
              if (target != null) {
                Scrollable.ensureVisible(target, duration: Duration.zero);
              }
            },
            child: const Text('企业派单'),
          ),
        ],
      ),
      const SizedBox(height: 20),
      softPanel(
        TextField(
          onChanged: (v) => setState(() => poolQuery = v),
          decoration: const InputDecoration(
            labelText: '搜索任务',
            hintText: '设备、城市或服务企业',
          ),
        ),
      ),
      engineerSection('可领取的服务需求'),
      if (platform.isEmpty)
        empty('暂无符合接单条件的平台任务')
      else
        ...platform
            .where(
              (o) => '${o.model} ${o.title} ${o.company}'
                  .toLowerCase()
                  .contains(poolQuery.toLowerCase()),
            )
            .map(
              (o) => card(
                o,
                action: FilledButton(
                  onPressed: busy ? null : () => claim(o),
                  child: const Text('领取任务'),
                ),
              ),
            ),
      KeyedSubtree(key: companyPoolAnchor, child: heading('企业派单池')),
      if (company.isEmpty)
        empty('暂无可领取的企业工单')
      else
        ...company
            .where(
              (o) => '${o.model} ${o.title} ${o.company}'
                  .toLowerCase()
                  .contains(poolQuery.toLowerCase()),
            )
            .map(
              (o) => card(
                o,
                action: FilledButton(
                  onPressed: busy ? null : () => claim(o),
                  child: const Text('领取任务'),
                ),
              ),
            ),
    ];
  }

  List<Widget> courses() {
    final list = rows(s.data['/market/courses'])
        .where(
          (c) =>
              '${c['title']} ${c['city']} ${c['center_name']}'
                  .toLowerCase()
                  .contains(courseQuery.toLowerCase()) &&
              (courseState == '全部课程' ||
                  (courseState == '已报名') == (c['my_state'] != null)),
        )
        .toList();
    final qualifications = rows(obj(s.data['/market/me'])['qualifications']);
    return [
      heading('培训与服务资质', '报名、到场培训、平台记录考核结果，通过后才获得对应接单资质。'),
      ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: Image.asset(
          'assets/service-visuals/engineer-diagnosis.webp',
          height: 140,
          width: double.infinity,
          fit: BoxFit.cover,
        ),
      ),
      const SizedBox(height: 24),
      section(
        '我的接单资质',
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (qualifications.isEmpty)
              hint('暂无有效接单资质')
            else
              ...qualifications.map(
                (q) => Text(
                  '${skillLabel(q['skill'])} · 有效至 ${dateLabel(q['expires_at']).split(' ').first}',
                ),
              ),
            TextButton(
              onPressed: () =>
                  openPage(context, QualificationsPage(api: s.api)),
              child: const Text('查看工程师服务身份'),
            ),
          ],
        ),
      ),
      const SizedBox(height: 12),
      softPanel(
        Column(
          children: [
            TextField(
              onChanged: (v) => setState(() => courseQuery = v),
              decoration: const InputDecoration(
                labelText: '查找培训',
                hintText: '课程、城市或培训地点',
              ),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: courseState,
              decoration: const InputDecoration(labelText: '报名状态'),
              items: const [
                '全部课程',
                '已报名',
                '未报名',
              ].map((v) => DropdownMenuItem(value: v, child: Text(v))).toList(),
              onChanged: (v) => setState(() => courseState = v!),
            ),
          ],
        ),
      ),
      Padding(
        padding: const EdgeInsets.only(bottom: 20),
        child: Text(
          '共 ${list.length} 门课程',
          style: const TextStyle(fontSize: 12, color: engineerMuted),
        ),
      ),
      ...list.map(
        (course) => Card(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: Image.asset(
                    'assets/service-visuals/course-practice.webp',
                    height: 132,
                    width: double.infinity,
                    fit: BoxFit.cover,
                    semanticLabel: '实训场景概念参考',
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  text(course['title']),
                  style: const TextStyle(
                    fontSize: 16,
                    height: 1.5,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  '${text(course['center_name'])} · ${text(course['city'])}',
                  style: const TextStyle(color: engineerMuted),
                ),
                Text(
                  '${text(course['start_date'])} · ${text(course['enrolled'])}/${text(course['capacity'])} 人',
                  style: const TextStyle(fontSize: 12, color: engineerMuted),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () => openPage(
                          context,
                          CourseDetailPage(store: s, id: text(course['id'])),
                        ),
                        child: const Text(
                          '培训详情与场地',
                          style: TextStyle(fontSize: 12),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: FilledButton(
                        onPressed: busy || course['my_state'] != null
                            ? null
                            : () => run(() async {
                                await s.api.call(
                                  '/market/courses/${course['id']}/enroll',
                                  method: 'POST',
                                  body: {},
                                );
                                await s.refresh(3);
                              }),
                        child: Text(
                          course['my_state'] == null
                              ? '报名培训'
                              : enrollmentLabel(course['my_state']),
                          style: const TextStyle(fontSize: 12),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
      if (list.isEmpty) empty('暂无符合条件的培训'),
    ];
  }

  Widget resource(
    IconData icon,
    String title,
    String note,
    VoidCallback action,
  ) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: InkWell(
      onTap: action,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: const Color(0xffeaf0e6),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Row(
          children: [
            Icon(icon, color: engineerAccent),
            const SizedBox(width: 20),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(fontSize: 16)),
                const SizedBox(height: 4),
                Text(
                  note,
                  style: const TextStyle(fontSize: 12, color: engineerMuted),
                ),
              ],
            ),
          ],
        ),
      ),
    ),
  );
  List<Widget> profile() {
    final me = obj(s.data['/market/me']),
        person = obj(me['person']),
        stats = obj(s.data['/engineer/stats']),
        status = obj(s.data['/engineer/status']);
    return [
      Padding(
        padding: const EdgeInsets.only(bottom: 24),
        child: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: const Color(0xff275640),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(
                Icons.business_outlined,
                color: Colors.white,
                size: 24,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    '关联服务企业',
                    style: TextStyle(fontSize: 12, color: engineerMuted),
                  ),
                  Text(
                    rows(
                      me['employers'],
                    ).map((e) => text(e['name'])).join(' / '),
                    style: const TextStyle(fontSize: 14),
                  ),
                ],
              ),
            ),
            TextButton(
              onPressed: () => openPage(context, EngineerProfilePage(store: s)),
              child: const Text('工作身份', style: TextStyle(fontSize: 12)),
            ),
          ],
        ),
      ),
      const Divider(height: 1),
      Padding(
        padding: const EdgeInsets.symmetric(vertical: 28),
        child: Row(
          children: [
            ClipOval(
              child: Image.asset('assets/avatar.webp', width: 52, height: 52),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    text(person['name'], '工程师'),
                    style: const TextStyle(
                      fontSize: 24,
                      height: 32 / 24,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  Text(
                    text(person['phone']),
                    style: const TextStyle(fontSize: 12, color: engineerMuted),
                  ),
                  const Text(
                    '企业管理的工作账号',
                    style: TextStyle(fontSize: 12, color: engineerMuted),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
      const Row(
        children: [
          Expanded(child: Text('工作状态')),
          Text(
            '状态由当前账号实时同步',
            style: TextStyle(fontSize: 12, color: engineerMuted),
          ),
        ],
      ),
      const SizedBox(height: 12),
      EngineerSegments(
        items: const ['可接单', '服务中', '休息中'],
        selected:
            const {
              'ONLINE': '可接单',
              'WORKING': '服务中',
              'OFFLINE': '休息中',
            }[status['status']] ??
            '休息中',
        onChanged: busy
            ? null
            : (v) => run(() async {
                await s.api.call(
                  '/engineer/status',
                  method: 'PUT',
                  body: {
                    'status': const {
                      '可接单': 'ONLINE',
                      '服务中': 'WORKING',
                      '休息中': 'OFFLINE',
                    }[v],
                  },
                );
                await s.load('/engineer/status');
              }),
      ),
      const SizedBox(height: 24),
      Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: const Color(0xfff7f9f5),
          border: Border.all(color: engineerLine),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Expanded(
                  child: Text(
                    '本月服务',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
                  ),
                ),
                TextButton(
                  onPressed: () => openPage(context, EarningsPage(api: s.api)),
                  child: const Text(
                    '收益明细 ↗',
                    style: TextStyle(fontSize: 12, color: engineerMuted),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  flex: 2,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        '本月收益 · 元',
                        style: TextStyle(fontSize: 12, color: engineerMuted),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        money(stats['monthlyRevenue']),
                        style: const TextStyle(
                          fontSize: 26,
                          height: 1.3,
                          color: engineerAccent,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
                Container(width: 1, height: 56, color: engineerLine),
                const SizedBox(width: 20),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        '本月订单 · 单',
                        style: TextStyle(fontSize: 12, color: engineerMuted),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        text(stats['monthlyOrders']),
                        style: const TextStyle(
                          fontSize: 26,
                          height: 1.3,
                          color: engineerAccent,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
      const SizedBox(height: 20),
      resource(
        Icons.school_outlined,
        '技能进阶',
        '培训与接单资质',
        () => widget.onNavigate?.call(3),
      ),
      resource(
        Icons.inventory_2_outlined,
        '我的移动仓',
        '配件与领退料记录',
        () => openPage(context, InventoryPage(store: s)),
      ),
      heading('服务与资料'),
      Card(
        child: Column(
          children: [
            ListTile(
              leading: const Icon(Icons.badge_outlined),
              title: const Text('接单资料与审核'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => openPage(context, EngineerProfilePage(store: s)),
            ),
            ListTile(
              leading: const Icon(Icons.account_balance_wallet_outlined),
              title: const Text('收益与提成明细'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => openPage(context, EarningsPage(api: s.api)),
            ),
            ListTile(
              leading: const Icon(Icons.history),
              title: const Text('历史服务记录'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => openPage(context, HistoryPage(store: s)),
            ),
            ListTile(
              leading: const Icon(Icons.verified_outlined),
              title: const Text('培训记录与技能资质'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => openPage(context, QualificationsPage(api: s.api)),
            ),
            ListTile(
              leading: const Icon(Icons.inventory_2_outlined),
              title: const Text('我的移动仓'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => openPage(context, InventoryPage(store: s)),
            ),
            ListTile(
              leading: const Icon(Icons.smart_toy_outlined),
              title: const Text('AI 维修助手'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => openPage(context, AssistantPage(store: s)),
            ),
            ListTile(
              leading: const Icon(Icons.contact_page_outlined),
              title: const Text('我的工程师名片'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => run(() async {
                final person = obj(await s.api.call('/auth/profile'));
                if (mounted) {
                  await openPage(
                    context,
                    EngineerCardPage(api: s.api, id: text(person['id'])),
                  );
                }
              }),
            ),
          ],
        ),
      ),
      heading('服务企业'),
      ...rows(me['employers']).map(
        (e) => Card(
          child: ListTile(
            leading: const Icon(Icons.business_outlined),
            title: Text(text(e['name'])),
            trailing: const Icon(Icons.chevron_right),
            onTap: () =>
                openPage(context, CompanyPage(api: s.api, id: text(e['id']))),
          ),
        ),
      ),
      const SizedBox(height: 18),
      OutlinedButton.icon(
        onPressed: () => run(() async {
          final confirm = await showDialog<bool>(
            context: context,
            builder: (c) => AlertDialog(
              title: const Text('退出登录？'),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(c, false),
                  child: const Text('取消'),
                ),
                FilledButton(
                  onPressed: () => Navigator.pop(c, true),
                  child: const Text('退出'),
                ),
              ],
            ),
          );
          if (confirm == true) await widget.onLogout();
        }),
        icon: const Icon(Icons.logout),
        label: const Text('退出登录'),
      ),
    ];
  }
}
