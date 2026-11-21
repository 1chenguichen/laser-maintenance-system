import 'package:material_ui/material_ui.dart';
import 'api.dart';
import 'store.dart';
import 'common.dart';
import 'order_detail.dart';
import 'visual_gallery.dart';
import 'profile_pages.dart';

class HistoryPage extends StatefulWidget {
  final EngineerStore store;
  const HistoryPage({super.key, required this.store});
  @override
  State<HistoryPage> createState() => _HistoryPageState();
}

class _HistoryPageState extends State<HistoryPage> {
  String state = '全部', query = '';
  bool loading = false;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    setState(() => loading = true);
    await widget.store.refresh(2);
    if (mounted) setState(() => loading = false);
  }

  @override
  Widget build(BuildContext context) {
    final list =
        widget.store.orders
            .where(
              (o) =>
                  o.finished &&
                  (state == '全部' || o.label == state) &&
                  ('${o.number} ${o.model} ${o.title} ${o.company}'
                      .toLowerCase()
                      .contains(query.toLowerCase())),
            )
            .toList()
          ..sort(
            (a, b) =>
                text(
                  b.data['completedAt'],
                  text(b.data['updated_at'], text(b.data['updatedAt'])),
                ).compareTo(
                  text(
                    a.data['completedAt'],
                    text(a.data['updated_at'], text(a.data['updatedAt'])),
                  ),
                ),
          );
    return Scaffold(
      appBar: engineerAppBar(
        context,
        title: const Text('历史服务记录'),
        actions: [
          IconButton(
            tooltip: '刷新记录',
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
            if (loading) const LinearProgressIndicator(minHeight: 2),
            TextField(
              decoration: const InputDecoration(
                labelText: '搜索工单、设备或企业',
                prefixIcon: Icon(Icons.search),
              ),
              onChanged: (v) => setState(() => query = v),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              children: ['全部', '已完成', '已取消', '已拒绝']
                  .map(
                    (v) => ChoiceChip(
                      label: Text(v),
                      selected: state == v,
                      onSelected: (_) => setState(() => state = v),
                    ),
                  )
                  .toList(),
            ),
            hint('按当前账号可查询的已结束工单显示，共 ${list.length} 条。'),
            ...widget.store.errors.values.map(
              (e) => Text(e, style: const TextStyle(color: Colors.red)),
            ),
            ...list.map(
              (o) => Card(
                child: ListTile(
                  title: Text(o.title),
                  subtitle: Text('${o.company}\n${o.number}'),
                  trailing: Text(o.label, style: const TextStyle(color: brand)),
                  isThreeLine: true,
                  onTap: () => openPage(
                    context,
                    OrderDetail(store: widget.store, order: o),
                  ),
                ),
              ),
            ),
            if (list.isEmpty && !loading) hint('暂无匹配的历史服务记录'),
          ],
        ),
      ),
    );
  }
}

class CourseDetailPage extends StatefulWidget {
  final EngineerStore store;
  final String id;
  const CourseDetailPage({super.key, required this.store, required this.id});
  @override
  State<CourseDetailPage> createState() => _CourseDetailPageState();
}

class _CourseDetailPageState extends State<CourseDetailPage> {
  Json? course;
  String? error;
  bool busy = false;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    try {
      final list = rows(await widget.store.api.call('/market/courses'));
      final d = list.where((c) => c['id'] == widget.id).firstOrNull;
      if (d == null) throw const ApiFailure('培训已下架或当前账号不可查看');
      if (mounted) {
        setState(() {
          course = d;
          error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    }
  }

  Future<void> enroll() async {
    if (busy || !await confirm(context, '确认报名培训？', '报名登记后，培训地点与考核安排以平台通知为准。')) {
      return;
    }
    if (!mounted) return;
    setState(() => busy = true);
    try {
      await widget.store.api.call(
        '/market/courses/${widget.id}/enroll',
        method: 'POST',
        body: {},
      );
      await load();
      await widget.store.refresh(3);
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = course ?? {};
    return Scaffold(
      appBar: engineerAppBar(context, title: const Text('培训详情')),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          if (course == null && error == null) const LinearProgressIndicator(),
          if (error != null)
            Text(error!, style: const TextStyle(color: Colors.red)),
          if (course != null) ...[
            section(
              text(d['title']),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('${text(d['center_name'])} · ${text(d['city'])}'),
                  hint(
                    '开始时间：${dateLabel(d['start_date'])}\n培训地址：${text(d['address'])}\n名额：${text(d['enrolled'])}/${text(d['capacity'])}',
                  ),
                  Text(text(d['description'], '暂无补充说明')),
                  const SizedBox(height: 14),
                  OutlinedButton.icon(
                    onPressed: () => openMap(context, text(d['address'], '')),
                    icon: const Icon(Icons.map_outlined),
                    label: const Text('查看培训地址'),
                  ),
                ],
              ),
            ),
            OutlinedButton.icon(
              onPressed: () => openPage(
                context,
                VisualGallery(
                  api: widget.store.api,
                  kind: 'course',
                  id: widget.id,
                  title: '培训场地与实训',
                ),
              ),
              icon: const Icon(Icons.photo_outlined),
              label: const Text('查看培训照片'),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: busy || d['my_state'] != null ? null : enroll,
              child: Text(
                busy
                    ? '正在报名…'
                    : d['my_state'] == null
                    ? '报名培训'
                    : {
                            'ENROLLED': '已报名',
                            'PASSED': '考核通过',
                            'FAILED': '考核未通过',
                          }[d['my_state']] ??
                          text(d['my_state']),
              ),
            ),
            hint('报名不代表取得接单资质，需按平台考核结果登记。'),
          ],
        ],
      ),
    );
  }
}

class EngineerCardPage extends StatelessWidget {
  final Api api;
  final String id;
  const EngineerCardPage({super.key, required this.api, required this.id});
  @override
  Widget build(BuildContext context) => DataPage(
    title: '工程师名片',
    load: () async => obj(await api.call('/market/visual/engineer/$id')),
    content: (c, d, reload) => Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        section(
          text(d['name']),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                obj(d['profile'])['state'] == 'APPROVED' ? '平台审核已通过' : '资料审核中',
              ),
              hint(text(obj(d['profile'])['introduction'], '暂无服务介绍')),
              Text(
                '服务城市：${(obj(d['profile'])['cities'] as List? ?? []).join('、')}',
              ),
            ],
          ),
        ),
        section(
          '技能与资质',
          Column(
            children: [
              ...rows(d['skills']).map(
                (q) => ListTile(
                  title: Text(skillLabel(q['skill'])),
                  subtitle: Text('有效至 ${dateLabel(q['expires_at'])}'),
                ),
              ),
              if (rows(d['skills']).isEmpty) hint('暂无公开技能资质'),
            ],
          ),
        ),
        ...rows(d['employers']).map(
          (e) => Card(
            child: ListTile(
              leading: const Icon(Icons.business_outlined),
              title: Text(text(e['name'])),
              trailing: const Icon(Icons.chevron_right),
              onTap: () =>
                  openPage(c, CompanyPage(api: api, id: text(e['id']))),
            ),
          ),
        ),
        OutlinedButton.icon(
          onPressed: () => openPage(
            c,
            VisualGallery(api: api, kind: 'engineer', id: id, title: '头像与技能资料'),
          ),
          icon: const Icon(Icons.photo_outlined),
          label: const Text('查看头像与技能资料'),
        ),
      ],
    ),
  );
}

class EngineerApplicationPage extends StatefulWidget {
  const EngineerApplicationPage({super.key});
  @override
  State<EngineerApplicationPage> createState() =>
      _EngineerApplicationPageState();
}

class _EngineerApplicationPageState extends State<EngineerApplicationPage> {
  final phone = TextEditingController(), code = TextEditingController();
  final api = Api();
  late final store = EngineerStore(api);
  bool busy = false, submitted = false;
  String? error;
  @override
  void dispose() {
    phone.dispose();
    code.dispose();
    api.dispose();
    store.dispose();
    super.dispose();
  }

  Future<void> next() async {
    if (busy) return;
    if (!RegExp(r'^1[3-9]\d{9}$').hasMatch(phone.text) ||
        !RegExp(r'^\d{6}$').hasMatch(code.text)) {
      setState(() => error = '请填写有效手机号和六位验证码');
      return;
    }
    setState(() => busy = true);
    try {
      final result = obj(
        await api.call(
          '/identity/login',
          method: 'POST',
          body: {'phone': phone.text, 'code': code.text, 'role': 'customer'},
        ),
      );
      api.token = result['accessToken'] as String;
      if (!mounted) return;
      await openPage(context, EngineerProfilePage(store: store));
      final me = obj(await api.call('/market/me'));
      if (mounted) setState(() => submitted = obj(me['engineer']).isNotEmpty);
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: engineerAppBar(context, title: const Text('申请成为工程师')),
    body: ListView(
      padding: const EdgeInsets.all(24),
      children: [
        hint('先验证本人手机号，再提交接单资料。申请不会授予企业数据权限，需审核和对应技能资质。'),
        if (submitted)
          section('申请资料已保存', const Text('请等待平台审核；审核通过后，返回工程师登录页使用同一手机号登录。')),
        TextField(
          controller: phone,
          keyboardType: TextInputType.phone,
          decoration: const InputDecoration(labelText: '手机号'),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: code,
          keyboardType: TextInputType.number,
          maxLength: 6,
          decoration: const InputDecoration(labelText: '验证码'),
        ),
        if (error != null)
          Text(error!, style: const TextStyle(color: Colors.red)),
        FilledButton(
          onPressed: busy ? null : next,
          child: Text(busy ? '正在验证…' : '验证并填写申请'),
        ),
        hint('当前云端演示阶段可使用000000；正式短信配置与网页端保持一致。'),
      ],
    ),
  );
}
