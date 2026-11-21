import 'dart:io';
import 'package:cupertino_http/cupertino_http.dart';
import 'package:http/http.dart' as http;
import 'package:http/io_client.dart';

http.Client createNetworkClient() {
  if (Platform.isIOS || Platform.isMacOS) {
    // Use system trust, proxy and VPN configuration. Do not override trust.
    return CupertinoClient.fromSessionConfiguration(
      URLSessionConfiguration.ephemeralSessionConfiguration(),
    );
  }
  return IOClient();
}

String networkDiagnostic(Object error) {
  if (error is NSErrorClientException) {
    final code = int.tryParse(
      RegExp(r'code=(-?\d+)').firstMatch(error.toString())?.group(1) ?? '',
    );
    final reason =
        const {
          -1001: '连接超时',
          -1003: '无法解析服务器地址',
          -1004: '无法连接服务器',
          -1005: '连接中断',
          -1009: 'App 当前无法使用网络，请检查系统网络权限或代理设置',
          -1022: '系统网络安全策略阻止连接',
          -1200: '无法建立安全连接',
          -1201: '服务器证书已过期',
          -1202: '系统不信任服务器证书',
          -1203: '服务器证书根不受信任',
          -1204: '服务器证书尚未生效',
        }[code] ??
        '系统网络请求失败';
    return '$reason（iOS $code）';
  }
  if (error is SocketException) {
    return '无法建立网络连接（Socket ${error.osError?.errorCode ?? 'unknown'}）。请检查 App 网络权限、Wi-Fi 或代理。';
  }
  if (error is HandshakeException) return 'HTTPS 握手失败，请检查系统日期和证书信任。';
  return '连接建立失败（${error.runtimeType}），请检查 App 网络权限和系统代理。';
}
