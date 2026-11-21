import 'package:material_ui/material_ui.dart';
import 'package:image_picker/image_picker.dart';

import 'api.dart';
import 'common.dart';

const slotLabels = {
  'overview': '设备全貌',
  'nameplate': '设备铭牌',
  'component': '关键部件',
  'REPORTED': '报修照片',
  'DIAGNOSIS': '检测照片',
  'AFTER': '完工照片',
  'portrait': '本人头像',
  'skill': '技能与服务资料',
  'team': '服务团队',
  'workshop': '维修车间',
  'product': '配件实物',
  'packaging': '配件包装',
  'label': '型号标签',
  'cover': '课程封面',
  'venue': '培训地点',
  'practice': '实训现场',
};

class VisualGallery extends StatefulWidget {
  final Api api;
  final String kind, id, title;
  const VisualGallery({
    super.key,
    required this.api,
    required this.kind,
    required this.id,
    this.title = '照片与资料',
  });
  @override
  State<VisualGallery> createState() => _VisualGalleryState();
}

class _VisualGalleryState extends State<VisualGallery> {
  Json? data;
  String? error;
  bool busy = false, loading = false;
  String? slot;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    if (loading) return;
    setState(() => loading = true);
    try {
      final d = obj(
        await widget.api.call(
          '/market/visual?kind=${widget.kind}&id=${Uri.encodeComponent(widget.id)}',
        ),
      );
      if (mounted) {
        setState(() {
          data = d;
          error = null;
          final slots = (d['uploadSlots'] as List? ?? []).cast<String>();
          slot = slots.contains(slot)
              ? slot
              : (slots.isEmpty ? null : slots.first);
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> upload(ImageSource source) async {
    if (busy || slot == null) return;
    setState(() => busy = true);
    try {
      final image = await ImagePicker().pickImage(
        source: source,
        maxWidth: 1600,
        maxHeight: 1600,
        imageQuality: 80,
      );
      if (image != null) {
        await widget.api.uploadVisual(
          kind: widget.kind,
          id: widget.id,
          slot: slot!,
          bytes: await image.readAsBytes(),
          filename: image.name,
        );
        await load();
      }
    } catch (e) {
      if (mounted) setState(() => error = '$e；请刷新列表确认上传结果，系统不会自动重复上传。');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> remove(Json item) async {
    if (busy || !await confirm(context, '删除这张照片？', '删除后该资料中的图片将被移除。')) return;
    setState(() => busy = true);
    try {
      await widget.api.call('/market/visual/${item['id']}', method: 'DELETE');
      await load();
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = data ?? {},
        items = rows(d['items']),
        slots = (d['uploadSlots'] as List? ?? []).cast<String>();
    return Scaffold(
      appBar: clientAppBar(
        context,
        title: Text(widget.title),
        actions: [
          IconButton(
            tooltip: '刷新照片',
            onPressed: loading ? null : load,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          if (loading || busy) const LinearProgressIndicator(minHeight: 2),
          if (error != null)
            Text(error!, style: const TextStyle(color: Colors.red)),
          if (d['canUpload'] == true && slots.isNotEmpty) ...[
            DropdownButtonFormField<String>(
              key: ValueKey(slot),
              initialValue: slot,
              decoration: const InputDecoration(labelText: '照片类别'),
              items: slots
                  .map(
                    (v) => DropdownMenuItem(
                      value: v,
                      child: Text(slotLabels[v] ?? v),
                    ),
                  )
                  .toList(),
              onChanged: busy ? null : (v) => setState(() => slot = v),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: FilledButton.tonalIcon(
                    onPressed: busy ? null : () => upload(ImageSource.camera),
                    icon: const Icon(Icons.photo_camera_outlined),
                    label: const Text('拍照'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: busy ? null : () => upload(ImageSource.gallery),
                    icon: const Icon(Icons.photo_library_outlined),
                    label: const Text('相册'),
                  ),
                ),
              ],
            ),
            hint('图片只用于当前资料，上传与删除权限由服务端核验。'),
          ],
          ...items.map(
            (item) => section(
              slotLabels[item['slot']] ?? '资料照片',
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  ProtectedImage(
                    key: ValueKey(item['id']),
                    api: widget.api,
                    path: item['source'] == 'attachment'
                        ? '/market/attachments/${item['id']}'
                        : '/market/visual/${item['id']}/content',
                    height: 240,
                  ),
                  Text(
                    dateLabel(item['created_at']),
                    style: const TextStyle(fontSize: 12, color: clientMuted),
                  ),
                  if (item['canDelete'] == true)
                    TextButton.icon(
                      onPressed: busy ? null : () => remove(item),
                      icon: const Icon(Icons.delete_outline),
                      label: const Text('删除照片'),
                    ),
                ],
              ),
            ),
          ),
          if (items.isEmpty && !loading) hint('暂无已上传的照片。'),
        ],
      ),
    );
  }
}
