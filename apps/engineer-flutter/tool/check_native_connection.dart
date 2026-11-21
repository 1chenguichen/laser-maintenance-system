import 'dart:io';
import 'package:zhixiugong_engineer/network_client.dart';

Future<void> main() async {
  if (!Platform.isMacOS) throw StateError('Run on Apple build host');
  final client = createNetworkClient();
  try {
    // No credentials or state-changing request: this route intentionally has no GET.
    final response = await client
        .get(Uri.parse('https://43.139.91.94:8442/api/identity/login'))
        .timeout(const Duration(seconds: 25));
    if (response.statusCode != 404 ||
        !(response.headers['content-type'] ?? '').contains(
          'application/json',
        )) {
      throw StateError(
        'Unexpected API connection response: ${response.statusCode}',
      );
    }
    stdout.writeln('APPLE_NATIVE_HTTPS_CONNECTION_OK');
  } finally {
    client.close();
  }
}
