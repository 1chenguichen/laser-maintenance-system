import 'package:material_ui/material_ui.dart';

import 'api.dart';
import 'common.dart';
import 'store.dart';
import 'device_pages.dart';
import 'order_detail.dart';
import 'resources.dart';

const categories = {
  '': '全部服务',
  'cutting': '激光切割',
  'welding': '激光焊接',
  'marking': '激光打标',
  'maintenance': '设备保养',
  'inspection': '设备检测',
  'installation': '安装调试',
};
Widget customerOrderCard(
  BuildContext context,
  CustomerStore store,
  CustomerOrder order,
) => Card(
  child: InkWell(
    onTap: () =>
        openPage(context, CustomerOrderDetail(store: store, order: order)),
    borderRadius: BorderRadius.circular(16),
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  order.provider,
                  style: const TextStyle(fontSize: 12, color: clientMuted),
                ),
              ),
              statusTag(order.label, order.status),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              ReferencePhoto(model: order.model),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  order.model,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(order.title),
          const SizedBox(height: 10),
          const Divider(),
          Row(
            children: [
              Expanded(
                child: Text(
                  order.number,
                  style: const TextStyle(fontSize: 11, color: clientMuted),
                ),
              ),
              TextButton(
                onPressed: () => openPage(
                  context,
                  CustomerOrderDetail(store: store, order: order),
                ),
                child: const Text('查看进度 →', style: TextStyle(fontSize: 12)),
              ),
            ],
          ),
        ],
      ),
    ),
  ),
);
Widget customerDeviceCard(BuildContext context, CustomerStore store, Json d) =>
    Card(
      child: ListTile(
        contentPadding: const EdgeInsets.all(16),
        leading: ReferencePhoto(model: text(d['model'])),
        title: Text(
          text(d['model']),
          style: const TextStyle(fontWeight: FontWeight.w600),
        ),
        subtitle: Text(
          '${text(d['serialNumber'])}\n${text(d['serviceName'], '服务企业待确认')}',
        ),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => openPage(context, DeviceDetail(store: store, device: d)),
      ),
    );

class CustomerScreen extends StatefulWidget {
  final CustomerStore store;
  final int tab;
  final bool visible;
  final ValueChanged<int> onNavigate;
  final Future<void> Function() onLogout;
  const CustomerScreen({
    super.key,
    required this.store,
    required this.tab,
    required this.visible,
    required this.onNavigate,
    required this.onLogout,
  });
  @override
  State<CustomerScreen> createState() => _CustomerScreenState();
}

class _CustomerScreenState extends State<CustomerScreen>
    with AutomaticKeepAliveClientMixin {
  CustomerStore get s => widget.store;
  String query = '', state = '全部', category = '';
  final city = TextEditingController();
  bool pendingOnly = false;
  int limit = 10;
  @override
  bool get wantKeepAlive => true;
  @override
  void dispose() {
    city.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final children = switch (widget.tab) {
      0 => home(),
      1 => services(),
      2 => devices(),
      3 => orders(),
      _ => profile(),
    };
    return RefreshIndicator(
      onRefresh: () => s.refresh(widget.tab),
      child: ListView(
        key: PageStorageKey('customer-tab-${widget.tab}'),
        padding: EdgeInsets.fromLTRB(
          MediaQuery.sizeOf(context).width < 360 ? 16 : 24,
          24,
          MediaQuery.sizeOf(context).width < 360 ? 16 : 24,
          28,
        ),
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          if (CustomerStore.paths[widget.tab].any(s.loading.contains))
            const LinearProgressIndicator(minHeight: 2),
          ...CustomerStore.paths[widget.tab]
              .where(s.errors.containsKey)
              .map(
                (p) => section(
                  '读取提示',
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(s.errors[p]!),
                      Text(
                        s.data.containsKey(p) ? '保留上次读取结果，请刷新确认。' : '本次尚未读取成功。',
                      ),
                      TextButton(
                        onPressed: () => s.load(p),
                        child: const Text('重新加载'),
                      ),
                    ],
                  ),
                ),
              ),
          ...children,
        ],
      ),
    );
  }

  List<Widget> home() {
    final user = obj(s.data['/auth/profile']),
        active = s.orders.where((o) => !o.finished).toList(),
        todo = s.orders
            .where(
              (o) => o.actions.any(
                (a) => [
                  'approve',
                  'accept-service',
                  'confirm-quote',
                  'pay-prepayment',
                  'pay-final',
                  'review',
                ].contains(a),
              ),
            )
            .toList();
    return [
      clientHeading('设备与服务', '您好，${text(user['name'], '欢迎回来')}'),
      ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: ColoredBox(
          color: const Color(0xffeaf2ff),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ClientBanner(active: widget.visible),
              const Padding(
                padding: EdgeInsets.fromLTRB(16, 0, 16, 14),
                child: Text('连接设备与专业服务', style: TextStyle(color: clientAccent)),
              ),
            ],
          ),
        ),
      ),
      const SizedBox(height: 16),
      Row(
        children: [
          Expanded(
            child: quick(
              Icons.build_outlined,
              '设备报修',
              '已有设备售后',
              () => openPage(context, RepairForm(store: s)),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: quick(
              Icons.qr_code_scanner,
              '扫一扫',
              '识别与绑定',
              () => scanCustomerDevice(context, s),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: quick(
              Icons.support_agent,
              '联系服务',
              '沟通维修需求',
              () => openPage(context, ChatPage(api: s.api)),
            ),
          ),
        ],
      ),
      clientSection('待您确认'),
      section(
        '',
        todo.isEmpty
            ? const ListTile(
                leading: Icon(Icons.check_circle_outline),
                title: Text('暂时没有待确认事项'),
                subtitle: Text('新的报价和服务进度会在这里显示。'),
              )
            : Column(
                children: todo
                    .take(4)
                    .map(
                      (o) => ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: const Icon(Icons.notifications_none),
                        title: Text(actionLabels[o.actions.first] ?? '查看服务'),
                        subtitle: Text(o.model),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () => openPage(
                          context,
                          CustomerOrderDetail(store: s, order: o),
                        ),
                      ),
                    )
                    .toList(),
              ),
      ),
      clientSection(
        '我的设备',
        trailing: TextButton(
          onPressed: () => widget.onNavigate(2),
          child: const Text('全部设备 ›'),
        ),
      ),
      if (s.devices.isEmpty)
        section(
          '绑定设备，开启售后服务',
          OutlinedButton(
            onPressed: () => openPage(context, BindDevicePage(store: s)),
            child: const Text('绑定第一台设备'),
          ),
        )
      else
        ...s.devices.take(3).map((d) => customerDeviceCard(context, s, d)),
      clientSection(
        '正在进行的服务',
        trailing: TextButton(
          onPressed: () => widget.onNavigate(3),
          child: const Text('全部订单 ›'),
        ),
      ),
      if (active.isEmpty)
        hint('当前没有进行中的服务')
      else
        ...active.take(3).map((o) => customerOrderCard(context, s, o)),
    ];
  }

  Widget quick(
    IconData icon,
    String title,
    String note,
    VoidCallback action,
  ) => InkWell(
    onTap: action,
    borderRadius: BorderRadius.circular(12),
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 16),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: clientLine),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        children: [
          Icon(icon, color: clientAccent),
          const SizedBox(height: 8),
          Text(
            title,
            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
          ),
          const SizedBox(height: 4),
          Text(note, style: const TextStyle(color: clientMuted, fontSize: 10)),
        ],
      ),
    ),
  );
  Future<void> catalog() async {
    final p = Uri(
      path: '/market/catalog',
      queryParameters: {
        if (city.text.trim().isNotEmpty) 'city': city.text.trim(),
        if (category.isNotEmpty) 'category': category,
      },
    ).toString();
    await s.load(p);
    if (mounted) setState(() => catalogPath = p);
  }

  String catalogPath = '/market/catalog';
  List<Widget> services() {
    final list = rows(s.data[catalogPath]);
    return [
      clientHeading('找售后服务', '维修、保养与检测，按设备需求选择。'),
      ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: Image.asset(
          'assets/service-visuals/iot-network.webp',
          height: 124,
          fit: BoxFit.cover,
        ),
      ),
      const SizedBox(height: 20),
      Row(
        children: [
          Expanded(
            child: TextField(
              controller: city,
              onSubmitted: (_) => catalog(),
              decoration: const InputDecoration(
                labelText: '服务城市',
                hintText: '城市或全国',
              ),
            ),
          ),
          const SizedBox(width: 8),
          FilledButton(onPressed: catalog, child: const Text('查找')),
        ],
      ),
      const SizedBox(height: 12),
      Wrap(
        spacing: 6,
        runSpacing: 4,
        children: categories.entries
            .map(
              (e) => ChoiceChip(
                label: Text(e.value),
                selected: category == e.key,
                onSelected: (_) {
                  setState(() => category = e.key);
                  catalog();
                },
              ),
            )
            .toList(),
      ),
      if (s.loading.contains(catalogPath))
        const LinearProgressIndicator(minHeight: 2),
      if (s.errors[catalogPath] != null) hint(s.errors[catalogPath]!),
      clientSection('适合你的设备服务'),
      ...list.map(
        (offer) => Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  text(offer['title']),
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                hint(
                  '${text(offer['provider_name'], '平台服务网络')} · ${text(offer['city'])}',
                ),
                Text(text(offer['description'], '服务范围以项目说明及确认报价为准。')),
                const SizedBox(height: 12),
                Row(
                  children: [
                    if (offer['tenant_id'] != null)
                      Expanded(
                        child: TextButton(
                          onPressed: () => openPage(
                            context,
                            CompanyPage(
                              api: s.api,
                              id: text(offer['tenant_id']),
                            ),
                          ),
                          child: const Text('服务企业资料'),
                        ),
                      ),
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () => openPage(
                          context,
                          ServiceRequestForm(store: s, offer: offer),
                        ),
                        child: const Text('咨询服务 →'),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
      if (list.isEmpty && !s.loading.contains(catalogPath))
        hint('暂无匹配服务，请调整城市或类别。'),
    ];
  }

  List<Widget> devices() {
    final list = s.devices
        .where(
          (d) => '${d['model']} ${d['serialNumber']} ${d['serviceName']}'
              .toLowerCase()
              .contains(query.toLowerCase()),
        )
        .toList();
    return [
      clientHeading('我的设备', '设备资料与售后记录，随时查看。'),
      Row(
        children: [
          Expanded(
            child: TextField(
              onChanged: (v) => setState(() => query = v),
              decoration: const InputDecoration(
                prefixIcon: Icon(Icons.search),
                hintText: '搜索型号或序列号',
              ),
            ),
          ),
          const SizedBox(width: 8),
          IconButton(
            tooltip: '扫一扫',
            onPressed: () => scanCustomerDevice(context, s),
            icon: const Icon(Icons.qr_code_scanner),
          ),
        ],
      ),
      const SizedBox(height: 12),
      OutlinedButton.icon(
        onPressed: () => openPage(context, BindDevicePage(store: s)),
        icon: const Icon(Icons.add),
        label: const Text('绑定设备'),
      ),
      Padding(
        padding: const EdgeInsets.symmetric(vertical: 16),
        child: Text(
          '共 ${list.length} 台设备',
          style: const TextStyle(color: clientMuted, fontSize: 12),
        ),
      ),
      ...list.take(limit).map((d) => customerDeviceCard(context, s, d)),
      if (list.isEmpty) hint('暂无匹配设备，绑定后即可查看档案和发起报修。'),
      if (list.length > limit)
        TextButton(
          onPressed: () => setState(() => limit += 10),
          child: const Text('加载更多'),
        ),
    ];
  }

  List<Widget> orders() {
    final list = s.orders
        .where(
          (o) =>
              (state == '全部' ||
                  state == '进行中' && !o.finished ||
                  state == '已完成' && o.status == 'COMPLETED' ||
                  state == '已取消' &&
                      ['CANCELLED', 'REFUSED'].contains(o.status)) &&
              (!pendingOnly ||
                  o.actions.any((a) => a != 'cancel' && a != 'refund')) &&
              '${o.number} ${o.model} ${o.title} ${o.provider}'
                  .toLowerCase()
                  .contains(query.toLowerCase()),
        )
        .toList();
    return [
      clientHeading('服务订单', '查看服务进度，处理报价与服务确认。'),
      ClientSegments(
        items: const ['全部', '进行中', '已完成', '已取消'],
        selected: state,
        onChanged: (v) => setState(() {
          state = v;
          limit = 10;
        }),
      ),
      const SizedBox(height: 12),
      TextField(
        onChanged: (v) => setState(() {
          query = v;
          limit = 10;
        }),
        decoration: const InputDecoration(hintText: '搜索订单、设备或服务企业'),
      ),
      CheckboxListTile(
        contentPadding: EdgeInsets.zero,
        title: const Text('只看待我确认'),
        value: pendingOnly,
        onChanged: (v) => setState(() => pendingOnly = v ?? false),
      ),
      Text(
        '${list.length} 笔服务订单',
        style: const TextStyle(fontSize: 12, color: clientMuted),
      ),
      const SizedBox(height: 16),
      ...list.take(limit).map((o) => customerOrderCard(context, s, o)),
      if (list.isEmpty) hint('暂无匹配订单'),
      if (list.length > limit)
        OutlinedButton(
          onPressed: () => setState(() => limit += 10),
          child: const Text('加载更多'),
        ),
    ];
  }

  List<Widget> profile() {
    final user = obj(s.data['/auth/profile']);
    return [
      Row(
        children: [
          ClipOval(
            child: Image.asset('assets/avatar.webp', width: 56, height: 56),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  text(user['name'], '客户'),
                  style: const TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                Text(
                  text(user['phone']),
                  style: const TextStyle(color: clientMuted),
                ),
              ],
            ),
          ),
        ],
      ),
      const SizedBox(height: 24),
      softPanel(
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceAround,
          children: [
            stat('我的设备', s.devices.length, () => widget.onNavigate(2)),
            stat('服务订单', s.orders.length, () => widget.onNavigate(3)),
            stat(
              '进行中',
              s.orders.where((o) => !o.finished).length,
              () => widget.onNavigate(3),
            ),
          ],
        ),
      ),
      Card(
        child: Column(
          children: [
            menu(
              Icons.location_on_outlined,
              '服务地址管理',
              () => openPage(context, AddressList(api: s.api)),
            ),
            menu(
              Icons.description_outlined,
              '服务合同与发票',
              () => openPage(context, BusinessPage(api: s.api)),
            ),
            menu(
              Icons.support_agent,
              '联系服务',
              () => openPage(context, ChatPage(api: s.api)),
            ),
            menu(
              Icons.school_outlined,
              '培训与服务资源',
              () => openPage(context, TrainingPage(api: s.api)),
            ),
            menu(
              Icons.devices_outlined,
              '设备监测',
              () => openPage(context, CustomerMonitorList(api: s.api)),
            ),
            menu(
              Icons.feedback_outlined,
              '意见与服务反馈',
              () => openPage(context, FeedbackPage(api: s.api)),
            ),
          ],
        ),
      ),
      const SizedBox(height: 20),
      OutlinedButton.icon(
        onPressed: () async {
          if (await confirm(context, '退出登录？', '退出后需要重新登录才能查看设备与服务记录。')) {
            await widget.onLogout();
          }
        },
        icon: const Icon(Icons.logout),
        label: const Text('退出登录'),
      ),
    ];
  }

  Widget menu(IconData icon, String name, VoidCallback action) => ListTile(
    leading: Icon(icon, color: clientAccent),
    title: Text(name),
    trailing: const Icon(Icons.chevron_right, size: 20),
    onTap: action,
  );
  Widget stat(String name, int value, VoidCallback action) => InkWell(
    onTap: action,
    child: Column(
      children: [
        Text(
          '$value',
          style: const TextStyle(
            fontSize: 26,
            fontWeight: FontWeight.w600,
            color: clientAccent,
          ),
        ),
        Text(name, style: const TextStyle(fontSize: 12, color: clientMuted)),
      ],
    ),
  );
}
