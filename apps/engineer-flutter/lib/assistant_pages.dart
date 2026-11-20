import 'dart:async';
import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';
import 'api.dart';
import 'common.dart';
import 'store.dart';

class AssistantPage extends StatefulWidget {
  final EngineerStore store;
  final String? serviceId;
  const AssistantPage({super.key, required this.store, this.serviceId});
  @override
  State<AssistantPage> createState() => _AssistantPageState();
}

class _AssistantPageState extends State<AssistantPage> {
  final input = TextEditingController(), scroll = ScrollController();
  List<Json> employers = [], messages = [];
  String? service, error;
  bool loading = true, busy = false;
  Completer<void>? abort;
  StreamSubscription<Json>? subscription;
  int generation = 0;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    try {
      final me = obj(await widget.store.api.call('/market/me'));
      employers = rows(me['employers']);
      service = employers.any((e) => e['id'] == widget.serviceId)
          ? widget.serviceId
          : employers.firstOrNull?['id'];
      if (service != null) {
        messages = widget.store.assistantThreads.putIfAbsent(
          service!,
          () => [],
        );
      }
      if (mounted) setState(() => loading = false);
    } catch (e) {
      if (mounted) {
        setState(() {
          error = '$e';
          loading = false;
        });
      }
    }
  }

  void stop() {
    generation++;
    if (abort?.isCompleted == false) abort!.complete();
    subscription?.cancel();
    if (mounted) setState(() => busy = false);
  }

  @override
  void dispose() {
    generation++;
    if (abort?.isCompleted == false) abort!.complete();
    subscription?.cancel();
    input.dispose();
    scroll.dispose();
    super.dispose();
  }

  void down() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && scroll.hasClients) {
        scroll.animateTo(
          scroll.position.maxScrollExtent,
          duration: const Duration(milliseconds: 120),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void send() {
    final query = input.text.trim();
    if (query.isEmpty || busy || service == null) return;
    if (query.length > 6000) {
      notice(context, '问题过长，请控制在6000字以内');
      return;
    }
    input.clear();
    final answer = <String, dynamic>{'role': 'assistant', 'text': ''};
    messages.addAll([
      {'role': 'user', 'text': query},
      answer,
    ]);
    setState(() {
      busy = true;
      error = null;
    });
    abort = Completer<void>();
    final epoch = ++generation;
    subscription = widget.store.api
        .chat(
          query,
          serviceId: service!,
          conversationId: widget.store.assistantConversations[service!],
          abort: abort!.future,
        )
        .listen(
          (event) {
            if (!mounted || epoch != generation) return;
            if (event['conversation_id'] is String) {
              widget.store.assistantConversations[service!] =
                  event['conversation_id'];
            }
            if (event['answer'] is String) {
              setState(
                () => answer['text'] = event['event'] == 'message_replace'
                    ? event['answer']
                    : '${answer['text']}${event['answer']}',
              );
            }
            down();
          },
          onError: (Object e) {
            if (mounted && epoch == generation) {
              setState(() {
                error = '$e';
                busy = false;
                if (answer['text'] == '') answer['text'] = '本次未生成回复，请查看上方提示。';
              });
            }
          },
          onDone: () {
            if (mounted && epoch == generation) {
              setState(() {
                busy = false;
                if (answer['text'] == '') {
                  answer['text'] = '服务未返回正文，请检查配置或稍后重试。';
                }
              });
            }
          },
        );
    down();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('AI 维修助手'),
      actions: [
        IconButton(
          tooltip: '新对话',
          onPressed: busy || service == null
              ? null
              : () async {
                  if (await confirm(context, '开始新对话？', '当前企业的本地对话记录将被清空。')) {
                    widget.store.assistantConversations.remove(service);
                    messages.clear();
                    if (mounted) setState(() {});
                  }
                },
          icon: const Icon(Icons.add_comment_outlined),
        ),
      ],
    ),
    body: Column(
      children: [
        if (loading) const LinearProgressIndicator(),
        if (employers.isNotEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 4),
            child: DropdownButtonFormField<String>(
              initialValue: service,
              isExpanded: true,
              decoration: const InputDecoration(labelText: '当前服务身份'),
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
              onChanged: busy
                  ? null
                  : (v) => setState(() {
                      service = v;
                      messages = widget.store.assistantThreads.putIfAbsent(
                        v!,
                        () => [],
                      );
                      error = null;
                    }),
            ),
          ),
        if (error != null)
          Padding(
            padding: const EdgeInsets.all(16),
            child: Text(error!, style: const TextStyle(color: Colors.red)),
          ),
        Expanded(
          child: messages.isEmpty
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(
                      service == null
                          ? '当前工作身份尚未关联企业 AI 服务。'
                          : '描述设备型号、故障表现和已做检查。\nAI 建议需要现场核实，不能替代安全操作规范。',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: Colors.black54,
                        height: 1.7,
                      ),
                    ),
                  ),
                )
              : ListView.builder(
                  controller: scroll,
                  padding: const EdgeInsets.all(20),
                  itemCount: messages.length,
                  itemBuilder: (c, i) {
                    final m = messages[i], user = m['role'] == 'user';
                    return Align(
                      alignment: user
                          ? Alignment.centerRight
                          : Alignment.centerLeft,
                      child: Container(
                        margin: const EdgeInsets.only(bottom: 12),
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: user ? const Color(0xffe3eee7) : Colors.white,
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              user ? '我' : 'AI 维修助手',
                              style: const TextStyle(
                                fontSize: 11,
                                color: Colors.grey,
                              ),
                            ),
                            const SizedBox(height: 6),
                            SelectableText(
                              text(m['text'], busy ? '正在生成…' : '未返回正文'),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
        ),
        SafeArea(
          top: false,
          minimum: const EdgeInsets.all(16),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: TextField(
                  controller: input,
                  minLines: 1,
                  maxLines: 5,
                  enabled: service != null,
                  decoration: const InputDecoration(hintText: '描述问题或补充现场信息'),
                ),
              ),
              const SizedBox(width: 10),
              IconButton.filled(
                onPressed: busy
                    ? stop
                    : service == null
                    ? null
                    : send,
                tooltip: busy ? '停止生成' : '发送',
                icon: Icon(busy ? Icons.stop_rounded : Icons.send_rounded),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}

String repairDraft(
  ServiceOrder order,
  String observed,
  String actions,
  String verified,
) =>
    '维修报告草稿（待人工核对）\n工单：${order.number}\n服务企业：${order.company}\n设备：${order.model}\n报修描述（未经现场验证）：${order.description}\n\n现场检查：${observed.trim().isEmpty ? '待补充，不能据此认定故障原因' : observed.trim()}\n实际处理与用料：${actions.trim().isEmpty ? '待补充' : actions.trim()}\n复测结果：${verified.trim().isEmpty ? '待验证，不代表维修完成' : verified.trim()}\n\n本草稿不构成维修完成确认，未自动登记用料或提交业务。';

class RepairReportPage extends StatefulWidget {
  final EngineerStore store;
  final ServiceOrder? order;
  final bool returnDraft;
  const RepairReportPage({
    super.key,
    required this.store,
    this.order,
    this.returnDraft = false,
  });
  @override
  State<RepairReportPage> createState() => _RepairReportPageState();
}

class _RepairReportPageState extends State<RepairReportPage> {
  final observed = TextEditingController(),
      actions = TextEditingController(),
      verified = TextEditingController();
  ServiceOrder? selected;
  String? draft, error;
  bool loading = false;
  @override
  void initState() {
    super.initState();
    selected = widget.order;
    load();
  }

  @override
  void dispose() {
    observed.dispose();
    actions.dispose();
    verified.dispose();
    super.dispose();
  }

  Future<void> load() async {
    setState(() => loading = true);
    await widget.store.refresh(2);
    if (mounted) {
      setState(() {
        loading = false;
        selected ??= widget.store.orders.firstOrNull;
      });
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('维修报告助手')),
    body: ListView(
      padding: const EdgeInsets.all(20),
      children: [
        if (loading) const LinearProgressIndicator(),
        hint('按工单事实与人工填写内容整理草稿，不会自动诊断或提交完工。'),
        if (widget.order == null)
          DropdownButtonFormField<String>(
            initialValue: selected?.id,
            isExpanded: true,
            decoration: const InputDecoration(labelText: '关联工单'),
            items: widget.store.orders
                .map(
                  (o) => DropdownMenuItem(
                    value: o.id,
                    child: Text(
                      '${o.number} · ${o.title}',
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                )
                .toList(),
            onChanged: (v) => setState(() {
              selected = widget.store.orders.firstWhere((o) => o.id == v);
              draft = null;
            }),
          ),
        if (selected != null)
          section('工单信息', Text('${selected!.model}\n${selected!.description}')),
        TextField(
          controller: observed,
          minLines: 2,
          maxLines: 5,
          maxLength: 1000,
          onChanged: (_) => setState(() => draft = null),
          decoration: const InputDecoration(labelText: '现场检查与发现'),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: actions,
          minLines: 2,
          maxLines: 5,
          maxLength: 1000,
          onChanged: (_) => setState(() => draft = null),
          decoration: const InputDecoration(labelText: '实际处理与用料'),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: verified,
          minLines: 2,
          maxLines: 5,
          maxLength: 1000,
          onChanged: (_) => setState(() => draft = null),
          decoration: const InputDecoration(labelText: '复测与验证结果'),
        ),
        FilledButton(
          onPressed: selected == null
              ? null
              : () => setState(
                  () => draft = repairDraft(
                    selected!,
                    observed.text,
                    actions.text,
                    verified.text,
                  ),
                ),
          child: const Text('整理报告草稿'),
        ),
        if (draft != null) ...[
          const SizedBox(height: 18),
          section('待核对草稿', SelectableText(draft!)),
          OutlinedButton.icon(
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: draft!));
              if (context.mounted) notice(context, '已复制，请核对后使用');
            },
            icon: const Icon(Icons.copy_outlined),
            label: const Text('复制草稿'),
          ),
          if (widget.returnDraft)
            FilledButton(
              onPressed: draft!.length > 3000
                  ? null
                  : () => Navigator.pop(context, draft),
              child: const Text('核对后用于完工报告'),
            ),
        ],
        if (error != null) Text(error!),
      ],
    ),
  );
}
