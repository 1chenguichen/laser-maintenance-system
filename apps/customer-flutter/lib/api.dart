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
  String? workspace;
  void Function()? onUnauthorized;
  Api({
    http.Client? client,
    http.Client Function()? streamClientFactory,
    this.base = const String.fromEnvironment(
      'API_BASE',
      defaultValue: 'https://43.139.91.94:8441/api',
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
    final uri = this.uri(path);
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

  Uri uri(String path) {
    final value = Uri.parse('$base$path');
    return workspace != null &&
            path.startsWith('/iot/') &&
            !path.startsWith('/iot/mobile-')
        ? value.replace(
            queryParameters: {
              ...value.queryParameters,
              'workspace': workspace!,
            },
          )
        : value;
  }

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

  Future<Json> upload(String path, List<int> bytes, String filename) async {
    if (bytes.length > 5 * 1024 * 1024) throw const ApiFailure('图片超过5MB');
    final ext = filename.split('.').last.toLowerCase();
    if (!['jpg', 'jpeg', 'png', 'webp'].contains(ext)) {
      throw const ApiFailure('请选择JPG、PNG或WebP图片');
    }
    final request = http.MultipartRequest('POST', uri(path))
      ..headers.addAll({if (token != null) 'Authorization': 'Bearer $token'})
      ..files.add(
        http.MultipartFile.fromBytes(
          'photo',
          bytes,
          filename: filename,
          contentType: MediaType('image', ext == 'jpg' ? 'jpeg' : ext),
        ),
      );
    final response = await http.Response.fromStream(
      await client.send(request).timeout(const Duration(seconds: 30)),
    ).timeout(const Duration(seconds: 30));
    final data = obj(jsonDecode(utf8.decode(response.bodyBytes)));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      if (response.statusCode == 401) onUnauthorized?.call();
      throw ApiFailure(
        text(data['message'], '上传失败，请刷新确认结果'),
        response.statusCode,
      );
    }
    return data;
  }

  void dispose() => client.close();
}
