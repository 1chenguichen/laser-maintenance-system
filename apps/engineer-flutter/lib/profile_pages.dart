import 'package:material_ui/material_ui.dart';
import 'package:url_launcher/url_launcher.dart';
import 'api.dart';
import 'common.dart';
import 'store.dart';
import 'visual_gallery.dart';

Future<void> callPhone(BuildContext context, String phone) async {
  final cleaned = phone.replaceAll(RegExp(r'[^+0-9]'), '');
  if (cleaned.isEmpty) {
    notice(context, '暂无联系电话');
    return;
  }
  try {
    if (!await launchUrl(Uri(scheme: 'tel', path: cleaned))) {
      throw const ApiFailure('当前设备无法拨打电话');
    }
  } catch (e) {
    if (context.mounted) notice(context, e);
  }
}

Future<void> openMap(BuildContext context, String address) async {
  if (address.trim().isEmpty || address == '—') {
    notice(context, '该工单尚未提供有效地址');
    return;
  }
  final yes = await confirm(context, '打开地图导航？', '将把以下服务地址交给系统地图：\n$address');
  if (!yes) return;
  try {
    if (!await launchUrl(
      Uri.https('maps.apple.com', '/', {'q': address}),
      mode: LaunchMode.externalApplication,
    )) {
      throw const ApiFailure('地图暂时无法打开');
    }
  } catch (e) {
    if (context.mounted) notice(context, e);
  }
}

class EngineerProfilePage extends StatefulWidget {
  final EngineerStore store;
  const EngineerProfilePage({super.key, required this.store});
  @override
  State<EngineerProfilePage> createState() => _EngineerProfilePageState();
}

class _EngineerProfilePageState extends State<EngineerProfilePage> {
  final name = TextEditingController(),
      cities = TextEditingController(),
      intro = TextEditingController();
  final key = GlobalKey<FormState>();
  Json? data;
  String? id, error;
  String mode = 'INDEPENDENT';
  bool loading = true, busy = false;
  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    name.dispose();
    cities.dispose();
    intro.dispose();
    super.dispose();
  }

  Future<void> load() async {
    try {
      final result = await Future.wait([
        widget.store.api.call('/market/me'),
        widget.store.api.call('/auth/profile'),
      ]);
      final d = obj(result[0]), p = obj(d['engineer']);
      if (mounted) {
        setState(() {
          data = d;
          id = text(obj(result[1])['id'], '');
          name.text = text(obj(d['person'])['name'], '');
          cities.text = (p['cities'] as List? ?? []).join('，');
          intro.text = text(p['introduction'], '');
          mode = text(
            p['mode'],
            rows(d['employers']).isEmpty ? 'INDEPENDENT' : 'ORG',
          );
          loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          error = '$e';
          loading = false;
        });
      }
    }
  }

  Future<void> submit() async {
    if (busy || !key.currentState!.validate()) return;
    if (!await confirm(
      context,
      '提交接单资料审核？',
      '更新后会重新进入审核，审核通过和技能资质齐备后才可领取对应平台任务。',
    )) {
      return;
    }
    if (!mounted) return;
    setState(() => busy = true);
    try {
      await widget.store.api.call(
        '/market/engineer-profile',
        method: 'POST',
        body: {
          'name': name.text.trim(),
          'mode': mode,
          'cities': cities.text
              .split(RegExp('[,，]'))
              .map((v) => v.trim())
              .where((v) => v.isNotEmpty)
              .toSet()
              .toList(),
          'introduction': intro.text.trim(),
        },
      );
      await widget.store.load('/market/me');
      if (mounted) {
        notice(context, '资料已提交审核');
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) setState(() => error = '$e；填写内容已保留。');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final profile = obj(data?['engineer']);
    return PopScope(
      canPop: !busy,
      child: Scaffold(
        appBar: engineerAppBar(context, title: const Text('接单资料与审核')),
        body: Form(
          key: key,
          child: ListView(
            padding: const EdgeInsets.all(24),
            children: [
              if (loading) const LinearProgressIndicator(),
              if (error != null)
                Text(error!, style: const TextStyle(color: Colors.red)),
              if (data != null) ...[
                section(
                  '审核状态',
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        {
                              'APPROVED': '已通过',
                              'PENDING': '审核中',
                              'REJECTED': '未通过',
                              'SUSPENDED': '已暂停',
                            }[profile['state']] ??
                            '尚未提交',
                      ),
                      if (profile['review_note'] != null)
                        Text(text(profile['review_note'])),
                    ],
                  ),
                ),
                DropdownButtonFormField<String>(
                  initialValue: mode,
                  decoration: const InputDecoration(labelText: '接单身份'),
                  items: [
                    const DropdownMenuItem(
                      value: 'INDEPENDENT',
                      child: Text('平台合作工程师'),
                    ),
                    if (rows(data!['employers']).isNotEmpty)
                      const DropdownMenuItem(
                        value: 'ORG',
                        child: Text('服务企业工程师'),
                      ),
                  ],
                  onChanged: busy ? null : (v) => setState(() => mode = v!),
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: name,
                  maxLength: 50,
                  decoration: const InputDecoration(labelText: '姓名'),
                  validator: (v) =>
                      (v?.trim().length ?? 0) < 2 ? '请至少填写2个字的姓名' : null,
                ),
                TextFormField(
                  controller: cities,
                  decoration: const InputDecoration(
                    labelText: '服务城市，逗号分隔，可填全国',
                  ),
                  validator: (v) {
                    final values = (v ?? '')
                        .split(RegExp('[,，]'))
                        .map((v) => v.trim())
                        .where((v) => v.isNotEmpty)
                        .toList();
                    return values.isEmpty ||
                            values.length > 20 ||
                            values.any((v) => v.length > 30)
                        ? '请填写1至20个有效城市'
                        : null;
                  },
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: intro,
                  minLines: 4,
                  maxLines: 8,
                  maxLength: 1000,
                  decoration: const InputDecoration(labelText: '服务经历与擅长领域'),
                  validator: (v) =>
                      (v?.trim().length ?? 0) < 5 ? '请至少填写5个字' : null,
                ),
                FilledButton(
                  onPressed: busy ? null : submit,
                  child: Text(busy ? '正在提交…' : '提交审核'),
                ),
                const SizedBox(height: 16),
                if (id != null && id!.isNotEmpty)
                  OutlinedButton.icon(
                    onPressed: () => openPage(
                      context,
                      VisualGallery(
                        api: widget.store.api,
                        kind: 'engineer',
                        id: id!,
                        title: '头像与技能资料',
                      ),
                    ),
                    icon: const Icon(Icons.photo_outlined),
                    label: const Text('管理头像与技能照片'),
                  ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class EarningsPage extends StatelessWidget {
  final Api api;
  const EarningsPage({super.key, required this.api});
  @override
  Widget build(BuildContext context) => DataPage(
    title: '收益与服务统计',
    load: () async => obj(await api.call('/engineer/stats')),
    content: (c, d, reload) {
      final month = obj(d['currentMonth']), next = obj(d['nextTier']);
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          section(
            '本月服务',
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '¥ ${money(d['monthlyRevenue'])}',
                  style: const TextStyle(
                    fontSize: 34,
                    fontWeight: FontWeight.w600,
                    color: brand,
                  ),
                ),
                Text('完成 ${text(d['monthlyOrders'])} 单'),
                hint('参考提成金额：¥ ${money(month['commissionAmount'])}；以企业实际结算为准。'),
              ],
            ),
          ),
          section(
            '累计服务',
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('累计收入：¥ ${money(d['totalRevenue'])}'),
                Text('累计完成：${text(d['totalOrders'])} 单'),
                Text('服务评分：${text(d['avgRating'])}'),
              ],
            ),
          ),
          if (rows(d['perService']).length > 1) ...[
            hint('多家服务企业分别计算提成，以下为服务接口返回的分项，不合并套用提成档位。'),
            ...rows(d['perService']).indexed.map(
              (e) => section(
                text(e.$2['serviceName'], '企业分项 ${e.$1 + 1}'),
                Text(
                  '本月 ${text(e.$2['monthlyOrders'])} 单 · ¥ ${money(e.$2['monthlyRevenue'])}\n参考提成 ¥ ${money(obj(e.$2['currentMonth'])['commissionAmount'])}',
                ),
              ),
            ),
          ] else ...[
            section(
              '提成档位',
              Column(
                children: rows(d['commissionTiers'])
                    .map(
                      (t) => ListTile(
                        title: Text(text(t['range'])),
                        trailing: Text(text(t['rate'])),
                      ),
                    )
                    .toList(),
              ),
            ),
            if (next.isNotEmpty) hint('距离下一档还需 ${text(next['remaining'])} 单'),
          ],
        ],
      );
    },
  );
}

class QualificationsPage extends StatelessWidget {
  final Api api;
  const QualificationsPage({super.key, required this.api});
  @override
  Widget build(BuildContext context) => DataPage(
    title: '培训记录与技能资质',
    load: () async => obj(await api.call('/market/me')),
    content: (c, d, reload) => Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        section(
          '当前技能资质',
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ...rows(d['qualifications']).map(
                (q) => ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(
                    {
                          'cutting': '激光切割',
                          'welding': '激光焊接',
                          'marking': '激光打标',
                          'maintenance': '维保',
                          'installation': '安装调试',
                        }[q['skill']] ??
                        text(q['skill']),
                  ),
                  subtitle: Text('有效至 ${dateLabel(q['expires_at'])}'),
                  trailing: Text(
                    DateTime.tryParse(
                              '${q['expires_at']}',
                            )?.isAfter(DateTime.now()) ==
                            true
                        ? '有效'
                        : '已到期',
                    style: const TextStyle(color: brand),
                  ),
                ),
              ),
              if (rows(d['qualifications']).isEmpty) hint('暂无已登记技能资质'),
            ],
          ),
        ),
        section(
          '报名与考核记录',
          Column(
            children: [
              ...rows(d['enrollments']).map(
                (e) => ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(text(e['title'])),
                  subtitle: Text(text(e['center_name'])),
                  trailing: Text(
                    {
                          'ENROLLED': '已报名',
                          'PASSED': '已通过',
                          'FAILED': '未通过',
                          'CANCELLED': '已取消',
                        }[e['state']] ??
                        text(e['state']),
                  ),
                ),
              ),
              if (rows(d['enrollments']).isEmpty) hint('暂无培训报名记录'),
            ],
          ),
        ),
      ],
    ),
  );
}

class CompanyPage extends StatelessWidget {
  final Api api;
  final String id;
  const CompanyPage({super.key, required this.api, required this.id});
  @override
  Widget build(BuildContext context) => DataPage(
    title: '服务企业资料',
    load: () async => obj(await api.call('/market/visual/company/$id')),
    content: (c, d, reload) => Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        section(
          text(d['name']),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(text(d['description'], '暂无服务介绍')),
              hint(
                '服务范围：${text(d['serviceArea'])}\n服务时间：${text(d['serviceHours'])}\n企业地址：${text(d['address'])}',
              ),
              Wrap(
                spacing: 8,
                children: [
                  FilledButton.tonalIcon(
                    onPressed: () => callPhone(c, text(d['contactPhone'], '')),
                    icon: const Icon(Icons.call_outlined),
                    label: const Text('联系企业'),
                  ),
                  OutlinedButton.icon(
                    onPressed: () => openMap(c, text(d['address'], '')),
                    icon: const Icon(Icons.map_outlined),
                    label: const Text('查看地址'),
                  ),
                ],
              ),
            ],
          ),
        ),
        OutlinedButton.icon(
          onPressed: () => openPage(
            c,
            VisualGallery(
              api: api,
              kind: 'company',
              id: text(d['id']),
              title: '企业服务与团队',
            ),
          ),
          icon: const Icon(Icons.photo_outlined),
          label: const Text('查看服务与团队照片'),
        ),
      ],
    ),
  );
}
