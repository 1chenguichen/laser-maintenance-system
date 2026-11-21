import 'dart:async';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:zhixiugong_customer/api.dart';
import 'package:zhixiugong_customer/common.dart';
import 'package:zhixiugong_customer/store.dart';
import 'package:zhixiugong_customer/device_pages.dart';
import 'package:zhixiugong_customer/resources.dart';
import 'package:zhixiugong_customer/main.dart';
import 'package:zhixiugong_customer/enterprise.dart';

void main() {
  test('API rejects cleartext server address', () {
    expect(() => Api(base: 'http://example.com/api'), throwsArgumentError);
  });
  test('workspace is sent only to scoped IoT routes', () {
    final api = Api()..workspace = 'workspace-a';
    expect(api.uri('/iot/devices?search=x').queryParameters, {
      'search': 'x',
      'workspace': 'workspace-a',
    });
    expect(api.uri('/iot/mobile-context').queryParameters, isEmpty);
    expect(api.uri('/customer/devices').queryParameters, isEmpty);
    api.dispose();
  });
  test(
    'failed writes carry the session and are not automatically retried',
    () async {
      var attempts = 0;
      final api = Api(
        client: MockClient((r) async {
          attempts++;
          expect(r.headers['authorization'], 'Bearer session');
          return http.Response('{"message":"state changed"}', 409);
        }),
      );
      api.token = 'session';
      await expectLater(
        api.call(
          '/market/requests/order/action',
          method: 'POST',
          body: {'action': 'approve', 'version': 3},
        ),
        throwsA(isA<ApiFailure>().having((e) => e.status, 'status', 409)),
      );
      expect(attempts, 1);
      api.dispose();
    },
  );
  test('expired session calls logout callback', () async {
    var expired = false;
    final api = Api(
      client: MockClient(
        (_) async => http.Response('{"message":"expired"}', 401),
      ),
    )..token = 'session';
    api.onUnauthorized = () => expired = true;
    await expectLater(api.call('/auth/profile'), throwsA(isA<ApiFailure>()));
    expect(expired, true);
    api.dispose();
  });
  test(
    'cached reads deduplicate and retain data after refresh failure',
    () async {
      var count = 0, fail = false;
      final api = Api(
        client: MockClient((_) async {
          count++;
          await Future<void>.delayed(const Duration(milliseconds: 5));
          return http.Response(
            fail ? '{"message":"offline"}' : '[{"id":"device"}]',
            fail ? 503 : 200,
          );
        }),
      );
      final s = CustomerStore(api);
      await Future.wait([
        s.load('/customer/devices'),
        s.load('/customer/devices'),
      ]);
      expect(count, 1);
      fail = true;
      await s.load('/customer/devices');
      expect(s.devices.single['id'], 'device');
      expect(s.errors, isNotEmpty);
      s.clear();
      expect(s.devices, isEmpty);
      s.dispose();
      api.dispose();
    },
  );
  test('logout prevents an old request from publishing private data', () async {
    final delayed = Completer<http.Response>();
    final api = Api(client: MockClient((_) => delayed.future));
    final s = CustomerStore(api);
    final work = s.load('/customer/devices');
    s.clear();
    delayed.complete(http.Response('[{"id":"old-private"}]', 200));
    await work;
    expect(s.devices, isEmpty);
    s.dispose();
    api.dispose();
  });
  for (final sample in [
    (true, {'status': 'QUOTED'}, ['approve', 'cancel']),
    (true, {'status': 'AWAITING_ACCEPTANCE'}, ['accept-service']),
    (
      false,
      {'status': 'PENDING_PAYMENT', 'customerConfirm': false},
      ['confirm-quote'],
    ),
    (
      false,
      {'status': 'PENDING_PAYMENT', 'customerConfirm': true},
      ['pay-prepayment'],
    ),
    (false, {'status': 'PENDING_FINAL_PAYMENT'}, ['pay-final', 'refund']),
    (false, {'status': 'COMPLETED', 'reviewed': true}, ['refund']),
  ]) {
    test('customer order actions respect ${sample.$1} ${sample.$2}', () {
      expect(CustomerOrder(sample.$2, platform: sample.$1).actions, sample.$3);
    });
  }
  test('QR never opens external or executable links', () {
    expect(
      customerDeviceCode('SN-LASER-001', host: '43.139.91.94'),
      'SN-LASER-001',
    );
    expect(
      customerDeviceCode(
        'https://43.139.91.94:8441/device-scan.html?serial=SN-01',
        host: '43.139.91.94',
      ),
      'SN-01',
    );
    for (final text in [
      'https://evil.example/?serial=SN-01',
      'javascript:alert(1)',
      'file:///etc/passwd',
      'https://user:pass@43.139.91.94/?serial=SN-01',
    ]) {
      expect(customerDeviceCode(text, host: '43.139.91.94'), isNull);
    }
  });
  test(
    'invoice amount excludes pending and issued requests, but not rejected ones',
    () {
      expect(
        invoiceAvailable(
          {'id': 'bill', 'paid': 100},
          [
            {
              'kind': 'INVOICE',
              'sourceId': 'bill',
              'status': 'REQUESTED',
              'amount': 20,
            },
            {
              'kind': 'INVOICE',
              'sourceId': 'bill',
              'status': 'ISSUED',
              'amount': 30,
            },
            {
              'kind': 'INVOICE',
              'sourceId': 'bill',
              'status': 'REJECTED',
              'amount': 80,
            },
          ],
        ),
        50,
      );
    },
  );
  test('repair draft uses a valid stable UUID submission key', () {
    final a = newSubmissionId(), b = newSubmissionId();
    expect(
      a,
      matches(
        RegExp(
          r'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$',
        ),
      ),
    );
    expect(a, isNot(b));
  });
  testWidgets('five tabs keep search input and fit a narrow phone', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 740);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    var calls = 0;
    final api = Api(
      client: MockClient((r) async {
        calls++;
        return http.Response(
          r.url.path.endsWith('/profile')
              ? '{"name":"Customer","phone":"13911111111"}'
              : '[]',
          200,
        );
      }),
    );
    final s = CustomerStore(api);
    await tester.pumpWidget(
      MaterialApp(
        theme: clientTheme(),
        home: CustomerShell(store: s, onLogout: () async {}),
      ),
    );
    await tester.pumpAndSettle();
    final nav = find.byType(ClientBottomBar);
    for (final label in ['找服务', '设备', '订单', '我的']) {
      await tester.tap(find.descendant(of: nav, matching: find.text(label)));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull, reason: label);
    }
    await tester.tap(find.descendant(of: nav, matching: find.text('订单')));
    await tester.pumpAndSettle();
    final field = find.byWidgetPredicate(
      (w) => w is TextField && w.decoration?.hintText == '搜索订单、设备或服务企业',
    );
    await tester.enterText(field, 'retained');
    final before = calls;
    await tester.tap(find.descendant(of: nav, matching: find.text('首页')));
    await tester.pumpAndSettle();
    await tester.tap(find.descendant(of: nav, matching: find.text('订单')));
    await tester.pumpAndSettle();
    expect(find.text('retained'), findsOneWidget);
    expect(calls, before);
    expect(find.text('暂停', skipOffstage: false), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    s.dispose();
    api.dispose();
  });
  testWidgets('repair failure preserves text and reuses its idempotency key', (
    tester,
  ) async {
    final writes = <Json>[];
    final api = Api(
      client: MockClient((r) async {
        if (r.method == 'POST') {
          writes.add(obj(jsonDecode(r.body)));
          return http.Response('{"message":"offline"}', 503);
        }
        final Object d = r.url.path.endsWith('/devices')
            ? [
                {'id': 'device', 'model': 'Laser', 'serialNumber': 'SN'},
              ]
            : r.url.path.endsWith('/addresses')
            ? [
                {
                  'id': 'address',
                  'province': '省',
                  'city': '市',
                  'district': '区',
                  'detail': '道路1号',
                  'isDefault': true,
                },
              ]
            : [];
        return http.Response(
          jsonEncode(d),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }),
    );
    final s = CustomerStore(api);
    await tester.pumpWidget(
      MaterialApp(
        theme: clientTheme(),
        home: RepairForm(store: s, deviceId: 'device'),
      ),
    );
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextFormField), '设备发生冷却系统异常');
    await tester.scrollUntilVisible(
      find.widgetWithText(FilledButton, '提交报修'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.widgetWithText(FilledButton, '提交报修'));
    await tester.pumpAndSettle();
    expect(writes.length, 1);
    expect(writes.single['urgency'], 'normal');
    expect(writes.single['preferredTime'], 'asap');
    expect(writes.single.containsKey('contractId'), false);
    expect(find.text('设备发生冷却系统异常'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.widgetWithText(FilledButton, '提交报修'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.widgetWithText(FilledButton, '提交报修'));
    await tester.pumpAndSettle();
    expect(writes.length, 2);
    expect(writes[0]['clientRequestId'], writes[1]['clientRequestId']);
    await tester.pumpWidget(const SizedBox());
    s.dispose();
    api.dispose();
  });
  testWidgets('login failures keep input and expose safe connection details', (
    tester,
  ) async {
    final api = Api();
    await tester.pumpWidget(
      MaterialApp(
        theme: clientTheme(),
        home: CustomerLogin(
          api: api,
          onLogin: (_) async =>
              throw const ApiFailure('无法连接', null, 'iOS -1009'),
        ),
      ),
    );
    await tester.enterText(find.byType(TextField).at(0), '13911111111');
    await tester.enterText(find.byType(TextField).at(1), '000000');
    await tester.ensureVisible(find.text('登录'));
    await tester.tap(find.text('登录'));
    await tester.pumpAndSettle();
    expect(find.text('13911111111'), findsOneWidget);
    expect(find.text('查看连接详情'), findsOneWidget);
    expect(tester.takeException(), isNull);
    api.dispose();
  });
  testWidgets('enterprise viewer has no alarm mutation controls', (
    tester,
  ) async {
    final api = Api(
      client: MockClient((r) async {
        expect(r.url.queryParameters['workspace'], 'company-a');
        return http.Response(
          r.url.path.endsWith('/alarms')
              ? '{"items":[{"id":"alarm","message":"temperature"}],"total":1}'
              : '{}',
          200,
        );
      }),
    );
    await tester.pumpWidget(
      MaterialApp(
        theme: clientTheme(),
        home: EnterpriseShell(
          api: api,
          mobile: {
            'workspaces': [
              {'id': 'company-a', 'name': '企业', 'role': 'viewer'},
            ],
          },
          onLogout: () async {},
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('告警'));
    await tester.pumpAndSettle();
    expect(find.text('temperature'), findsOneWidget);
    expect(find.text('记录处理'), findsNothing);
    await tester.pumpWidget(const SizedBox());
    api.dispose();
  });
}
