import 'dart:convert';
import 'package:material_ui/material_ui.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:zhixiugong_engineer/api.dart';
import 'package:zhixiugong_engineer/store.dart';
import 'package:zhixiugong_engineer/main.dart';
import 'package:zhixiugong_engineer/engineer_design.dart';
import 'package:zhixiugong_engineer/order_detail.dart';
import 'package:zhixiugong_engineer/iot_screen.dart';

void main() {
  testWidgets(
    'restored mobile screens fit 320px and retain filters after tab switching',
    (tester) async {
      tester.view.physicalSize = const Size(320, 740);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final api = Api(
        client: MockClient((r) async {
          final path = r.url.path;
          final Object data = path.endsWith('/me')
              ? {
                  'person': {'name': '工程师测试', 'phone': '13900000002'},
                  'engineer': {'state': 'APPROVED'},
                  'employers': [
                    {'id': 'company', 'name': '较长的服务企业名称用于小屏显示检查'},
                  ],
                  'qualifications': [],
                }
              : path.endsWith('/engineer/orders')
              ? [
                  {
                    'id': 'active',
                    'orderNo': 'TEST-A',
                    'status': 'REPAIRING',
                    'serviceName': '较长的服务企业名称用于小屏显示检查',
                    'faultType': '保护镜片异常',
                    'device': {
                      'model': '激光焊接机 LW-500',
                      'serialNumber': 'SN-123',
                    },
                  },
                  {
                    'id': 'cancelled',
                    'orderNo': 'TEST-CANCELLED',
                    'status': 'CANCELLED',
                    'device': {'model': '激光切割机'},
                  },
                ]
              : path.endsWith('/stats')
              ? {'monthlyRevenue': 78039, 'monthlyOrders': 10}
              : path.endsWith('/status')
              ? {'status': 'ONLINE'}
              : [];
          return http.Response(
            jsonEncode(data),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }),
      );
      final store = EngineerStore(api);
      await tester.pumpWidget(
        MaterialApp(
          theme: engineerTheme(),
          home: Workspace(store: store, onLogout: () async {}),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('今日服务工作台'), findsOneWidget);
      expect(find.text('暂停'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.tap(find.text('待处理'));
      await tester.pumpAndSettle();
      expect(find.text('待我处理'), findsOneWidget);
      final nav = find.byType(EngineerBottomBar);
      for (final label in ['学习', '我的', '接单', '工单']) {
        await tester.tap(find.descendant(of: nav, matching: find.text(label)));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull, reason: label);
      }
      await tester.tap(find.text('已取消'));
      await tester.pumpAndSettle();
      expect(find.text('TEST-CANCELLED'), findsOneWidget);
      await tester.tap(find.descendant(of: nav, matching: find.text('工作台')));
      await tester.pumpAndSettle();
      await tester.tap(find.descendant(of: nav, matching: find.text('工单')));
      await tester.pumpAndSettle();
      expect(find.text('TEST-CANCELLED'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      store.dispose();
      api.dispose();
    },
  );
  testWidgets(
    'inline task monitoring mounts on demand and stops after collapse',
    (tester) async {
      var reads = 0;
      const order = {
        'id': 'order',
        'orderNo': 'TEST',
        'status': 'REPAIRING',
        'deviceId': 'device',
        'serviceName': '企业',
        'device': {'model': '激光焊接机', 'serialNumber': 'SN'},
        'customer': {'name': '客户'},
      };
      final api = Api(
        client: MockClient((r) async {
          Object data = {};
          if (r.url.path.contains('/engineer/orders/')) {
            data = order;
          } else if (r.url.path.contains('/iot/devices/device/history')) {
            data = {'points': []};
          } else if (r.url.path.contains('/iot/devices/device')) {
            reads++;
            data = {
              'model': '激光焊接机',
              'serialNumber': 'SN',
              'connectivity': 'OFFLINE',
              'metrics': [
                {'key': 'temperature', 'label': '温度', 'unit': '℃'},
                {'key': 'current', 'label': '电流', 'unit': 'A'},
              ],
              'latest': {'temperature': 30, 'current': 5},
            };
          } else if (r.url.path.contains('/iot/alarms')) {
            data = {'alarms': []};
          }
          return http.Response(
            jsonEncode(data),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }),
      );
      final store = EngineerStore(api);
      await tester.pumpWidget(
        MaterialApp(
          theme: engineerTheme(),
          home: OrderDetail(store: store, order: const ServiceOrder(order)),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byType(IoTScreen), findsNothing);
      expect(reads, 0);
      await tester.ensureVisible(find.text('展开运行数据与统计图'));
      await tester.tap(find.text('展开运行数据与统计图'));
      await tester.pumpAndSettle();
      expect(find.byType(IoTScreen), findsOneWidget);
      expect(reads, 1);
      expect(tester.takeException(), isNull);
      await tester.ensureVisible(find.text('收起运行数据与统计图'));
      await tester.tap(find.text('收起运行数据与统计图'));
      await tester.pumpAndSettle();
      expect(find.byType(IoTScreen), findsNothing);
      await tester.pump(const Duration(seconds: 16));
      expect(reads, 1);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      store.dispose();
      api.dispose();
    },
  );
}
