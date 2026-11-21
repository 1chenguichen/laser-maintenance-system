import 'package:material_ui/material_ui.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:zhixiugong_engineer/api.dart';
import 'package:zhixiugong_engineer/main.dart';
import 'package:zhixiugong_engineer/store.dart';
import 'package:zhixiugong_engineer/order_detail.dart';
import 'package:zhixiugong_engineer/engineer_design.dart';

void main() {
  testWidgets(
    'five tabs keep their state and do not request orders again on every switch',
    (tester) async {
      var calls = 0;
      final api = Api(
        client: MockClient((r) async {
          calls++;
          return http.Response(
            r.url.path.endsWith('/me')
                ? '{"person":{"name":"Engineer"},"employers":[]}'
                : '[]',
            200,
          );
        }),
      );
      final store = EngineerStore(api);
      await tester.pumpWidget(
        MaterialApp(
          home: Workspace(store: store, onLogout: () async {}),
        ),
      );
      await tester.pumpAndSettle();
      final navigation = find.byType(EngineerBottomBar);
      await tester.tap(
        find.descendant(of: navigation, matching: find.text('工单')),
      );
      await tester.pumpAndSettle();
      final ordersCalls = calls;
      await tester.enterText(find.byType(TextField), 'retained search');
      await tester.tap(
        find.descendant(of: navigation, matching: find.text('工作台')),
      );
      await tester.pumpAndSettle();
      await tester.tap(
        find.descendant(of: navigation, matching: find.text('工单')),
      );
      await tester.pumpAndSettle();
      expect(find.text('retained search'), findsOneWidget);
      expect(calls, ordersCalls);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      store.dispose();
      api.dispose();
    },
  );
  testWidgets('quote submission failure keeps the form and user input', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: WorkForm(
          order: const ServiceOrder({
            'id': 'test',
            'status': 'ACCEPTED',
          }, platform: true),
          action: 'quote',
          onSubmit: (_) async => throw const ApiFailure('network timeout'),
        ),
      ),
    );
    await tester.enterText(find.byType(TextFormField).at(0), '250');
    await tester.enterText(find.byType(TextFormField).at(1), '检查并更换保护镜片');
    await tester.tap(find.text('确认提交'));
    await tester.pumpAndSettle();
    expect(find.text('检查并更换保护镜片'), findsOneWidget);
    expect(find.textContaining('填写内容已保留'), findsOneWidget);
    expect(find.byType(WorkForm), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
