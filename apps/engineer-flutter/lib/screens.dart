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
  final Future<void> Function() onLogout;
  const EngineerScreen({
    super.key,
    required this.tab,
    required this.store,
    required this.onLogout,
  });
  @override
  State<EngineerScreen> createState() => _EngineerScreenState();
}

class _EngineerScreenState extends State<EngineerScreen>
    with AutomaticKeepAliveClientMixin {
  String filter = '全部', search = '';
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
      MaterialPageRoute<void>(
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
        padding: const EdgeInsets.fromLTRB(20, 14, 20, 28),
        children: [
          if (EngineerStore.paths[widget.tab].any(s.loading.contains))
            const LinearProgressIndicator(minHeight: 2),
          ...notices(),
          ...widgets,
        ],
      ),
    );
  }

  Widget heading(String title, [String? note]) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 14),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: const TextStyle(fontSize: 23, fontWeight: FontWeight.w700),
        ),
        if (note != null) ...[
          const SizedBox(height: 6),
          Text(
            note,
            style: const TextStyle(color: Colors.black54, height: 1.5),
          ),
        ],
      ],
    ),
  );
  Widget empty(String text) => Padding(
    padding: const EdgeInsets.all(28),
    child: Column(
      children: [
        const Icon(Icons.inbox_outlined, size: 40, color: Colors.grey),
        const SizedBox(height: 12),
        Text(text, textAlign: TextAlign.center),
      ],
    ),
  );
  Widget card(ServiceOrder o, {Widget? action}) => Card(
    child: InkWell(
      borderRadius: BorderRadius.circular(18),
      onTap: action == null ? () => open(o) : null,
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    o.company,
                    style: const TextStyle(fontSize: 12, color: Colors.black54),
                  ),
                ),
                Text(
                  o.label,
                  style: const TextStyle(
                    color: accent,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Text(
              o.title,
              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 6),
            Text(o.model, style: const TextStyle(color: Colors.black54)),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: Text(
                    o.number,
                    style: const TextStyle(fontSize: 11, color: Colors.grey),
                  ),
                ),
                if (action != null)
                  action
                else
                  const Icon(
                    Icons.arrow_forward_rounded,
                    color: accent,
                    size: 22,
                  ),
              ],
            ),
          ],
        ),
      ),
    ),
  );
  List<Widget> home() {
    final me = obj(s.data['/market/me']), person = obj(me['person']);
    final active = s.orders.where((o) => !o.finished).toList();
    return [
      heading('今日服务工作台', '每一次现场服务，都有清晰的下一步。'),
      ClipRRect(
        borderRadius: BorderRadius.circular(18),
        child: Image.asset(
          'assets/diagnosis.webp',
          height: 150,
          width: double.infinity,
          fit: BoxFit.cover,
        ),
      ),
      const SizedBox(height: 16),
      ListTile(
        contentPadding: EdgeInsets.zero,
        leading: const CircleAvatar(
          backgroundColor: Color(0xffe6f0e9),
          child: Icon(Icons.engineering, color: accent),
        ),
        title: Text(
          text(person['name'], '工程师'),
          style: const TextStyle(fontWeight: FontWeight.w600),
        ),
        subtitle: Text(
          rows(me['employers']).map((e) => text(e['name'])).join(' / '),
        ),
      ),
      Card(
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              metric(
                '待处理',
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
              ),
              metric(
                '服务中',
                active
                    .where(
                      (o) => ['IN_SERVICE', 'REPAIRING'].contains(o.status),
                    )
                    .length,
              ),
              metric(
                '待客户确认',
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
              ),
            ],
          ),
        ),
      ),
      heading('现场工具'),
      Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          ActionChip(
            avatar: const Icon(Icons.smart_toy_outlined, size: 18),
            label: const Text('AI 维修助手'),
            onPressed: () => openPage(context, AssistantPage(store: s)),
          ),
          ActionChip(
            avatar: const Icon(Icons.inventory_2_outlined, size: 18),
            label: const Text('我的移动仓'),
            onPressed: () => openPage(context, InventoryPage(store: s)),
          ),
          ActionChip(
            avatar: const Icon(Icons.qr_code_scanner, size: 18),
            label: const Text('扫一扫'),
            onPressed: () => scanDevice(context, s.api),
          ),
          ActionChip(
            avatar: const Icon(Icons.monitor_heart_outlined, size: 18),
            label: const Text('任务设备'),
            onPressed: () => openPage(context, DeviceListPage(api: s.api)),
          ),
          ActionChip(
            avatar: const Icon(Icons.edit_note, size: 18),
            label: const Text('维修报告助手'),
            onPressed: () => openPage(context, RepairReportPage(store: s)),
          ),
        ],
      ),
      heading('下一项任务'),
      if (active.isEmpty)
        empty('暂无待处理任务，请前往接单大厅')
      else
        ...active.take(4).map((o) => card(o)),
    ];
  }

  Widget metric(String name, int value) => Column(
    children: [
      Text(
        '$value',
        style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w600),
      ),
      const SizedBox(height: 4),
      Text(name, style: const TextStyle(fontSize: 12, color: Colors.black54)),
    ],
  );
  List<Widget> orders() {
    var all = s.orders;
    all = all
        .where(
          (o) =>
              (filter == '全部' ||
                  filter == '进行中' && !o.finished ||
                  filter == '已完成' && o.status == 'COMPLETED') &&
              (search.isEmpty ||
                  '${o.number} ${o.title} ${o.model} ${o.company}'
                      .toLowerCase()
                      .contains(search.toLowerCase())),
        )
        .toList();
    return [
      heading('我的工单', '企业任务与平台服务单，统一跟进。'),
      TextField(
        onChanged: (v) => setState(() => search = v),
        decoration: const InputDecoration(
          prefixIcon: Icon(Icons.search),
          hintText: '搜索单号、设备或服务企业',
        ),
      ),
      const SizedBox(height: 12),
      Wrap(
        spacing: 8,
        children: ['全部', '进行中', '已完成']
            .map(
              (v) => ChoiceChip(
                label: Text(v),
                selected: filter == v,
                onSelected: (_) => setState(() => filter = v),
              ),
            )
            .toList(),
      ),
      const SizedBox(height: 16),
      if (all.isEmpty) empty('没有符合条件的工单') else ...all.map((o) => card(o)),
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
      heading('接单大厅', '按企业授权、技能资质和服务区域展示可接任务。'),
      if (employers.isNotEmpty)
        DropdownButtonFormField<String>(
          initialValue: serviceId,
          decoration: const InputDecoration(labelText: '平台需求使用的服务身份'),
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
      heading('平台服务需求'),
      if (platform.isEmpty)
        empty('暂无符合接单条件的平台任务')
      else
        ...platform.map(
          (o) => card(
            o,
            action: FilledButton(
              onPressed: busy ? null : () => claim(o),
              child: const Text('领取任务'),
            ),
          ),
        ),
      heading('企业派单池'),
      if (company.isEmpty)
        empty('暂无可领取的企业工单')
      else
        ...company.map(
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
    final list = rows(s.data['/market/courses']);
    final qualifications = rows(obj(s.data['/market/me'])['qualifications']);
    return [
      heading('培训与资质', '培训、考核与接单资格，清晰可查。'),
      OutlinedButton.icon(
        onPressed: () => openPage(context, QualificationsPage(api: s.api)),
        icon: const Icon(Icons.verified_outlined),
        label: const Text('培训记录与技能资质'),
      ),
      if (qualifications.isNotEmpty)
        Card(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Wrap(
              spacing: 8,
              children: qualifications
                  .map(
                    (q) => Chip(
                      label: Text(
                        '${skillLabel(q['skill'])} · ${dateLabel(q['expires_at'])}',
                      ),
                    ),
                  )
                  .toList(),
            ),
          ),
        ),
      ...list.map(
        (course) => Card(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  text(course['title']),
                  style: const TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  '${text(course['center_name'])} · ${text(course['city'])}',
                ),
                Text(
                  '${text(course['start_date'])} · ${text(course['enrolled'])}/${text(course['capacity'])} 人',
                ),
                const SizedBox(height: 12),
                TextButton.icon(
                  onPressed: () => openPage(
                    context,
                    CourseDetailPage(store: s, id: text(course['id'])),
                  ),
                  icon: const Icon(Icons.article_outlined),
                  label: const Text('培训详情与场地'),
                ),
                FilledButton.tonal(
                  onPressed: busy || course['my_state'] != null
                      ? null
                      : () => run(() async {
                          await s.api.call(
                            '/market/courses/${course['id']}/enroll',
                            method: 'POST',
                            body: {},
                          );
                          await s.refresh(3);
                          if (mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('报名已登记，报名不等于通过考核')),
                            );
                          }
                        }),
                  child: Text(
                    course['my_state'] == null
                        ? '报名培训'
                        : enrollmentLabel(course['my_state']),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
      if (list.isEmpty) empty('暂无发布的培训'),
    ];
  }

  List<Widget> profile() {
    final me = obj(s.data['/market/me']),
        person = obj(me['person']),
        stats = obj(s.data['/engineer/stats']),
        status = obj(s.data['/engineer/status']);
    return [
      heading(text(person['name'], '工程师'), text(person['phone'])),
      Card(
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('接单状态', style: TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                children: {'ONLINE': '可接单', 'WORKING': '服务中', 'OFFLINE': '休息中'}
                    .entries
                    .map(
                      (e) => ChoiceChip(
                        label: Text(e.value),
                        selected: status['status'] == e.key,
                        onSelected: busy
                            ? null
                            : (_) => run(() async {
                                await s.api.call(
                                  '/engineer/status',
                                  method: 'PUT',
                                  body: {'status': e.key},
                                );
                                await s.load('/engineer/status');
                              }),
                      ),
                    )
                    .toList(),
              ),
            ],
          ),
        ),
      ),
      Card(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('本月服务'),
              const SizedBox(height: 12),
              Text(
                '¥ ${money(stats['monthlyRevenue'])}',
                style: const TextStyle(
                  fontSize: 32,
                  fontWeight: FontWeight.w600,
                  color: accent,
                ),
              ),
              Text(
                '本月完成 ${text(stats['monthlyOrders'])} 单 · 累计 ${text(stats['totalOrders'])} 单',
              ),
            ],
          ),
        ),
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
