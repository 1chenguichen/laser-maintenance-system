import 'package:http/http.dart' as http;

http.Client createNetworkClient() => http.Client();
String networkDiagnostic(Object error) => '浏览器无法建立连接，请检查网络和服务地址。';
