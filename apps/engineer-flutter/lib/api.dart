import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;

typedef Json = Map<String, dynamic>;
Json obj(dynamic v) =>
    v is Map ? Map<String, dynamic>.from(v) : <String, dynamic>{};
List<Json> rows(dynamic v) => v is List ? v.map(obj).toList() : <Json>[];
String text(dynamic v, [String fallback = '—']) =>
    v == null || '$v'.isEmpty ? fallback : '$v';

class ApiFailure implements Exception {
  final String message;
  final int? status;
  const ApiFailure(this.message, [this.status]);
  @override
  String toString() => message;
}

class Api {
  final http.Client client;
  final String base;
  String? token;
  void Function()? onUnauthorized;
  Api({
    http.Client? client,
    this.base = const String.fromEnvironment(
      'API_BASE',
      defaultValue: 'https://43.139.91.94:8442/api',
    ),
  }) : client = client ?? http.Client() {
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
    } on http.ClientException {
      throw const ApiFailure('连接失败，请检查网络后重试');
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
  String get company =>
      text(data[platform ? 'provider_name' : 'serviceName'], '平台服务');
  String get description =>
      text(data[platform ? 'description' : 'faultDescription']);
  String get deviceId => text(data[platform ? 'device_ref' : 'deviceId'], '');
  bool get finished => ['COMPLETED', 'CANCELLED', 'REFUSED'].contains(status);
  String get label => statusNames[status] ?? status;
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
  'DISPATCHED': '待确认上门',
  'ACCEPTED': '待报价',
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
