import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:http_parser/http_parser.dart';
import 'package:http/http.dart' as http;
import 'network_client.dart';

typedef Json = Map<String, dynamic>;
Json obj(dynamic v) =>
    v is Map ? Map<String, dynamic>.from(v) : <String, dynamic>{};
List<Json> rows(dynamic v) => v is List ? v.map(obj).toList() : <Json>[];
String text(dynamic v, [String fallback = '—']) =>
    v == null || '$v'.isEmpty ? fallback : '$v';

class ApiFailure implements Exception {
  final String message;
  final int? status;
  final String? diagnostic;
  const ApiFailure(this.message, [this.status, this.diagnostic]);
  @override
  String toString() => message;
}

class Api {
  final http.Client client;
  final http.Client Function() streamClientFactory;
  final String base;
  String? token;
  void Function()? onUnauthorized;
  Api({
    http.Client? client,
    http.Client Function()? streamClientFactory,
    this.base = const String.fromEnvironment(
      'API_BASE',
      defaultValue: 'https://43.139.91.94:8442/api',
    ),
  }) : client = client ?? createNetworkClient(),
       streamClientFactory = streamClientFactory ?? createNetworkClient {
    final u = Uri.parse(base);
    if (u.scheme != 'https' ||
        u.userInfo.isNotEmpty ||
        u.query.isNotEmpty ||
        u.fragment.isNotEmpty) {
      throw ArgumentError('HTTPS API root required');
    }
  }
  Future<dynamic> call(String path, {String method = 'GET', Json? body}) async {
    final uri = Uri.parse('$base$path');
    final request = http.Request(method, uri)
      ..headers.addAll({
        'Content-Type': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      });
    if (body != null) request.body = jsonEncode(body);
    try {
      final response = await http.Response.fromStream(
        await client.send(request).timeout(const Duration(seconds: 20)),
      ).timeout(const Duration(seconds: 20));
      dynamic data;
      try {
        data = jsonDecode(utf8.decode(response.bodyBytes));
      } catch (_) {
        throw ApiFailure('服务器返回异常，请稍后重试', response.statusCode);
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        if (response.statusCode == 401 && token != null) onUnauthorized?.call();
        final message = obj(data)['message'];
        throw ApiFailure(
          message is List ? message.join('；') : text(message, '请求失败'),
          response.statusCode,
        );
      }
      return data;
    } on TimeoutException {
      throw const ApiFailure('请求超时。请刷新确认结果，写操作不会自动重试。');
    } on http.ClientException catch (error) {
      throw ApiFailure('暂时无法连接服务器', null, networkDiagnostic(error));
    }
  }

  Uri uri(String path) => Uri.parse('$base$path');
  Future<Uint8List> image(String path) async {
    final response = await client
        .get(
          uri(path),
          headers: {if (token != null) 'Authorization': 'Bearer $token'},
        )
        .timeout(const Duration(seconds: 20));
    if (response.statusCode == 401) onUnauthorized?.call();
    if (response.statusCode != 200 ||
        !(response.headers['content-type'] ?? '').startsWith('image/')) {
      throw ApiFailure('图片暂时无法读取', response.statusCode);
    }
    return response.bodyBytes;
  }

  Future<Json> uploadVisual({
    required String kind,
    required String id,
    required String slot,
    required List<int> bytes,
    required String filename,
  }) async {
    final extension = filename.split('.').last.toLowerCase();
    if (!['jpg', 'jpeg', 'png', 'webp'].contains(extension)) {
      throw const ApiFailure('请选择 JPG、PNG 或 WebP 图片');
    }
    if (bytes.length > 5 * 1024 * 1024) {
      throw const ApiFailure('图片超过5MB，请选择较小的照片');
    }
    final request = http.MultipartRequest('POST', uri('/market/visual'))
      ..headers.addAll({if (token != null) 'Authorization': 'Bearer $token'})
      ..fields.addAll({'kind': kind, 'id': id, 'slot': slot})
      ..files.add(
        http.MultipartFile.fromBytes(
          'photo',
          bytes,
          filename: filename,
          contentType: MediaType(
            'image',
            extension == 'jpg' ? 'jpeg' : extension,
          ),
        ),
      );
    final response = await http.Response.fromStream(
      await client.send(request).timeout(const Duration(seconds: 40)),
    );
    final data = obj(jsonDecode(utf8.decode(response.bodyBytes)));
    if (response.statusCode == 401) onUnauthorized?.call();
    if (response.statusCode >= 300) {
      throw ApiFailure(text(data['message'], '图片上传失败'), response.statusCode);
    }
    return data;
  }

  Stream<Json> chat(
    String query, {
    required String serviceId,
    String? conversationId,
    Future<void>? abort,
  }) async* {
    // Separate client permits cancellation without interrupting normal API calls.
    final transport = streamClientFactory();
    try {
      final request =
          http.AbortableRequest(
              'POST',
              uri(
                '/ai/engineer/chat?serviceId=${Uri.encodeComponent(serviceId)}',
              ),
              abortTrigger: abort,
            )
            ..headers.addAll({
              'Content-Type': 'application/json',
              if (token != null) 'Authorization': 'Bearer $token',
            })
            ..body = jsonEncode({
              'query': query,
              'conversation_id': ?conversationId,
            });
      final response = await transport
          .send(request)
          .timeout(const Duration(seconds: 30));
      if (response.statusCode < 200 || response.statusCode >= 300) {
        final body = await response.stream.bytesToString();
        if (response.statusCode == 401) onUnauthorized?.call();
        throw ApiFailure(
          response.statusCode == 503
              ? 'AI 服务暂未配置，当前无法生成回复。'
              : text(obj(jsonDecode(body))['message'], 'AI暂时无法响应'),
          response.statusCode,
        );
      }
      var data = <String>[];
      await for (final line
          in response.stream
              .timeout(const Duration(seconds: 60))
              .transform(utf8.decoder)
              .transform(const LineSplitter())) {
        if (line.startsWith('data:')) {
          data.add(line.substring(5).trimLeft());
        } else if (line.isEmpty && data.isNotEmpty) {
          final raw = data.join('\n');
          data = [];
          if (raw == '[DONE]') break;
          final event = obj(jsonDecode(raw));
          if (event['event'] == 'error') {
            throw ApiFailure(text(event['message'], 'AI响应失败'));
          }
          yield event;
        }
      }
      if (data.isNotEmpty && data.join() != '[DONE]') {
        yield obj(jsonDecode(data.join('\n')));
      }
    } on TimeoutException {
      throw const ApiFailure('AI响应超时，可保留问题后重试');
    } finally {
      transport.close();
    }
  }

  void dispose() => client.close();
}

class ServiceOrder {
  final Json data;
  final bool platform;
  const ServiceOrder(this.data, {this.platform = false});
  String get id => text(data['id'], '');
  String get number => text(data[platform ? 'number' : 'orderNo']);
  String get status => text(data['status']);
  String get title => platform
      ? text(data['service_title'], text(data['device_model']))
      : text(data['faultType'], '设备维修');
  String get model => platform
      ? text(data['device_model'])
      : text(obj(data['device'])['model']);
  String get company => platform
      ? text(
          data['assigned_provider_name'],
          text(data['provider_name'], '平台服务网络'),
        )
      : text(data['serviceName'], '企业服务');
  String get description =>
      text(data[platform ? 'description' : 'faultDescription']);
  String get deviceId => text(data[platform ? 'device_ref' : 'deviceId'], '');
  bool get finished => ['COMPLETED', 'CANCELLED', 'REFUSED'].contains(status);
  String get label =>
      platform && status == 'ACCEPTED' ? '已接单' : statusNames[status] ?? status;
  String? get action => platform
      ? {
          'ASSIGNED': 'accept',
          'ACCEPTED': 'quote',
          'APPROVED': 'start',
          'IN_SERVICE': 'complete',
        }[status]
      : {
          'DISPATCHED': 'start',
          'ACCEPTED': 'quote',
          'REPAIRING': 'complete',
        }[status];
}

const statusNames = {
  'PENDING': '待派单',
  'REQUESTED': '待领取',
  'ASSIGNED': '待接单',
  'DISPATCHED': '已派单',
  'ACCEPTED': '已上门',
  'QUOTED': '待确认报价',
  'APPROVED': '待开始服务',
  'IN_SERVICE': '服务中',
  'REPAIRING': '维修中',
  'PENDING_PAYMENT': '待客户付定金',
  'PENDING_FINAL_PAYMENT': '待客户付尾款',
  'AWAITING_ACCEPTANCE': '待客户验收',
  'COMPLETED': '已完成',
  'CANCELLED': '已取消',
  'REFUSED': '已拒绝',
};
const actionNames = {
  'accept': '确认接单',
  'start': '开始服务',
  'quote': '提交报价',
  'complete': '提交完工',
};
