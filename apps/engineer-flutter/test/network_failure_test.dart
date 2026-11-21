import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:zhixiugong_engineer/api.dart';
import 'package:zhixiugong_engineer/main.dart';
import 'package:material_ui/material_ui.dart';

void main() {
  test(
    'network failures preserve safe diagnostics without retrying login',
    () async {
      var attempts = 0;
      final api = Api(
        client: MockClient((request) async {
          attempts++;
          throw http.ClientException(
            'secret debug text bearer-token',
            request.url,
          );
        }),
      );
      await expectLater(
        api.call(
          '/identity/login',
          method: 'POST',
          body: {'phone': '13900000002', 'code': '000000'},
        ),
        throwsA(
          isA<ApiFailure>()
              .having((e) => e.diagnostic, 'diagnostic', isNotNull)
              .having(
                (e) => e.diagnostic,
                'no credentials',
                isNot(contains('bearer-token')),
              ),
        ),
      );
      expect(attempts, 1);
      api.dispose();
    },
  );
  testWidgets('failed login displays connection detail and retains input', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: LoginScreen(
          onLogin: (_, _) async {
            throw const ApiFailure(
              '暂时无法连接服务器',
              null,
              'App 当前无法使用网络（iOS -1009）',
            );
          },
        ),
      ),
    );
    await tester.enterText(find.byType(TextField).at(0), '13900000002');
    await tester.enterText(find.byType(TextField).at(1), '000000');
    await tester.ensureVisible(find.text('进入工作空间'));
    await tester.tap(find.text('进入工作空间'));
    await tester.pumpAndSettle();
    expect(find.text('暂时无法连接服务器'), findsOneWidget);
    await tester.ensureVisible(find.text('查看连接详情'));
    await tester.tap(find.text('查看连接详情'));
    await tester.pumpAndSettle();
    expect(find.textContaining('iOS -1009'), findsOneWidget);
    expect(find.text('13900000002'), findsOneWidget);
  });
}
