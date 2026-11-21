import 'dart:typed_data';
import 'package:material_ui/material_ui.dart';
import 'api.dart';
export 'engineer_design.dart';
import 'engineer_design.dart';

const brand = Color(0xff176c50);
String scoped(String path, String? serviceId) {
  if (serviceId == null || serviceId.isEmpty) return path;
  final u = Uri.parse(path);
  return u
      .replace(queryParameters: {...u.queryParameters, 'serviceId': serviceId})
      .toString();
}

String dateLabel(dynamic value) {
  final d = DateTime.tryParse('$value')?.toLocal();
  return d == null
      ? text(value)
      : '${d.year}/${d.month.toString().padLeft(2, '0')}/${d.day.toString().padLeft(2, '0')} ${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
}

num number(dynamic value) => num.tryParse('$value') ?? 0;
String money(dynamic value) {
  final parsed = num.tryParse('$value');
  if (parsed == null || !parsed.isFinite) return '—';
  final parts = parsed.toStringAsFixed(2).split('.');
  final integer = parts.first.replaceAllMapped(
    RegExp(r'(\d)(?=(\d{3})+(?!\d))'),
    (m) => '${m[1]},',
  );
  return '$integer.${parts.last}';
}

Widget section(String title, Widget child) => Card(
  child: Padding(
    padding: const EdgeInsets.all(16),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 14),
        child,
      ],
    ),
  ),
);
Widget hint(String message) => Padding(
  padding: const EdgeInsets.symmetric(vertical: 16),
  child: Text(
    message,
    style: const TextStyle(color: engineerMuted, height: 1.5),
  ),
);
Future<bool> confirm(
  BuildContext context,
  String title,
  String message,
) async =>
    await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text(title),
        content: Text(message),
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
    ) ??
    false;
void notice(BuildContext context, Object message) => ScaffoldMessenger.of(
  context,
).showSnackBar(SnackBar(content: Text('$message')));
Future<T?> openPage<T>(BuildContext context, Widget page) =>
    Navigator.push<T>(context, EngineerRoute(builder: (_) => page));

class DataPage extends StatefulWidget {
  final String title;
  final Future<Json> Function() load;
  final Widget Function(BuildContext, Json, Future<void> Function()) content;
  const DataPage({
    super.key,
    required this.title,
    required this.load,
    required this.content,
  });
  @override
  State<DataPage> createState() => _DataPageState();
}

class _DataPageState extends State<DataPage> {
  Json? data;
  String? error;
  bool loading = false;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    if (loading) return;
    setState(() => loading = true);
    try {
      final next = await widget.load();
      if (mounted) {
        setState(() {
          data = next;
          error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: engineerAppBar(
      context,
      title: Text(widget.title),
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
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          if (loading) const LinearProgressIndicator(minHeight: 2),
          if (error != null)
            section(
              '读取提示',
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(error!),
                  TextButton(onPressed: load, child: const Text('重试')),
                ],
              ),
            ),
          if (data != null)
            widget.content(context, data!, load)
          else if (loading)
            hint('正在读取…'),
        ],
      ),
    ),
  );
}

class ProtectedImage extends StatefulWidget {
  final Api api;
  final String path;
  final double height;
  const ProtectedImage({
    super.key,
    required this.api,
    required this.path,
    this.height = 160,
  });
  @override
  State<ProtectedImage> createState() => _ProtectedImageState();
}

class _ProtectedImageState extends State<ProtectedImage> {
  late Future<Uint8List> bytes;
  @override
  void initState() {
    super.initState();
    bytes = widget.api.image(widget.path);
  }

  @override
  Widget build(BuildContext context) => SizedBox(
    height: widget.height,
    child: FutureBuilder<Uint8List>(
      future: bytes,
      builder: (c, s) => s.hasData
          ? ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: Image.memory(
                s.data!,
                fit: BoxFit.cover,
                gaplessPlayback: true,
              ),
            )
          : Center(
              child: s.hasError
                  ? const Icon(Icons.broken_image_outlined)
                  : const CircularProgressIndicator(strokeWidth: 2),
            ),
    ),
  );
}

String skillLabel(dynamic value) =>
    const {
      'cutting': '激光切割',
      'welding': '激光焊接',
      'marking': '激光打标',
      'maintenance': '维保',
      'installation': '安装调试',
    }[value] ??
    text(value);
String enrollmentLabel(dynamic value) =>
    const {
      'ENROLLED': '已报名',
      'PASSED': '考核通过',
      'FAILED': '考核未通过',
      'CANCELLED': '已取消',
    }[value] ??
    text(value);
