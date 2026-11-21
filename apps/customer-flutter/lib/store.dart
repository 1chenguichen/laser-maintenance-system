import 'package:flutter/foundation.dart';

import 'api.dart';

class CustomerOrder {
  final Json data;
  final bool platform;
  const CustomerOrder(this.data, {this.platform = false});
  String get id => text(data['id'], '');
  String get number => text(data[platform ? 'number' : 'orderNo']);
  String get status => text(data['status']);
  String get model => platform
      ? text(data['device_model'])
      : text(obj(data['device'])['model']);
  String get title =>
      text(data[platform ? 'service_title' : 'faultType'], '设备服务');
  String get provider => platform
      ? text(
          data['assigned_provider_name'],
          text(data['provider_name'], '平台服务网络'),
        )
      : text(data['serviceName'], '设备服务企业');
  String get deviceId => text(data[platform ? 'device_ref' : 'deviceId'], '');
  String get description =>
      text(data[platform ? 'description' : 'faultDescription']);
  String get label => platform
      ? const {
              'REQUESTED': '待安排',
              'ASSIGNED': '已派单',
              'ACCEPTED': '已接单',
              'QUOTED': '待确认报价',
              'APPROVED': '待开始服务',
              'IN_SERVICE': '服务中',
              'AWAITING_ACCEPTANCE': '待您验收',
              'COMPLETED': '已完成',
              'CANCELLED': '已取消',
            }[status] ??
            status
      : const {
              'PENDING': '待派单',
              'DISPATCHED': '已派单',
              'ACCEPTED': '检测报价中',
              'PENDING_PAYMENT': '待确认与支付',
              'REPAIRING': '服务中',
              'PENDING_FINAL_PAYMENT': '待结算',
              'COMPLETED': '已完成',
              'CANCELLED': '已取消',
              'REFUSED': '已拒绝',
            }[status] ??
            status;
  bool get finished => ['COMPLETED', 'CANCELLED', 'REFUSED'].contains(status);
  List<String> get actions => platform
      ? [
          if (status == 'QUOTED') 'approve',
          if (status == 'AWAITING_ACCEPTANCE') 'accept-service',
          if (['REQUESTED', 'ASSIGNED', 'ACCEPTED', 'QUOTED'].contains(status))
            'cancel',
        ]
      : [
          if (status == 'PENDING_PAYMENT' && data['customerConfirm'] != true)
            'confirm-quote',
          if (status == 'PENDING_PAYMENT' && data['customerConfirm'] == true)
            'pay-prepayment',
          if (status == 'PENDING_FINAL_PAYMENT') 'pay-final',
          if (status == 'COMPLETED' &&
              data['reviewed'] != true &&
              data['review'] == null)
            'review',
          if (['PENDING', 'DISPATCHED'].contains(status)) 'cancel',
          if ([
            'REPAIRING',
            'PENDING_FINAL_PAYMENT',
            'COMPLETED',
          ].contains(status))
            'refund',
        ];
}

const actionLabels = {
  'approve': '确认服务报价',
  'accept-service': '确认服务验收',
  'confirm-quote': '确认维修报价',
  'pay-prepayment': '演示支付定金',
  'pay-final': '验收并演示支付尾款',
  'review': '评价本次服务',
  'cancel': '取消服务需求',
  'refund': '申请退款',
};

class CustomerStore extends ChangeNotifier {
  final Api api;
  CustomerStore(this.api);
  final Map<String, dynamic> data = {};
  final Map<String, String> errors = {};
  final Set<String> loading = {};
  final Map<String, Future<void>> pending = {};
  final Map<String, DateTime> checked = {};
  int epoch = 0;
  static const paths = [
    [
      '/auth/profile',
      '/customer/devices',
      '/customer/work-orders',
      '/market/requests',
    ],
    ['/market/catalog'],
    ['/customer/devices'],
    ['/customer/work-orders', '/market/requests'],
    [
      '/auth/profile',
      '/customer/devices',
      '/customer/work-orders',
      '/market/requests',
    ],
  ];
  bool stale(String p) =>
      !checked.containsKey(p) ||
      DateTime.now().difference(checked[p]!).inSeconds > 30;
  Future<void> load(String p) {
    final generation = epoch;
    return pending[p] ??= _load(p).whenComplete(() {
      if (generation == epoch) pending.remove(p);
    });
  }

  Future<void> _load(String p) async {
    final generation = epoch;
    loading.add(p);
    notifyListeners();
    try {
      final result = await api.call(p);
      if (generation != epoch) return;
      data[p] = result;
      checked[p] = DateTime.now();
      errors.remove(p);
    } catch (e) {
      if (generation == epoch) errors[p] = '$e';
    } finally {
      if (generation == epoch) {
        loading.remove(p);
        notifyListeners();
      }
    }
  }

  Future<void> refresh(int tab) => Future.wait(paths[tab].map(load));
  List<Json> get devices => rows(data['/customer/devices']);
  List<CustomerOrder> get orders => [
    ...rows(
      data['/market/requests'],
    ).map((d) => CustomerOrder(d, platform: true)),
    ...rows(data['/customer/work-orders']).map((d) => CustomerOrder(d)),
  ];
  void clear() {
    epoch++;
    data.clear();
    errors.clear();
    loading.clear();
    pending.clear();
    checked.clear();
    api.workspace = null;
    notifyListeners();
  }
}
