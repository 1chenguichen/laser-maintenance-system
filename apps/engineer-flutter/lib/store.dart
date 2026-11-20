import 'package:flutter/foundation.dart';
import 'api.dart';

class EngineerStore extends ChangeNotifier {
  final Api api;
  final Map<String, dynamic> data = {};
  final Map<String, String> errors = {};
  final Set<String> loading = {};
  final Map<String, Future<void>> _pending = {};
  int _epoch = 0;
  EngineerStore(this.api);
  Future<void> load(String path) =>
      _pending[path] ??= _load(path).whenComplete(() { _pending.remove(path); });
  Future<void> _load(String path) async {
    final epoch = _epoch;
    loading.add(path);
    notifyListeners();
    try {
      final value = await api.call(path);
      if (epoch != _epoch) return;
      data[path] = value;
      errors.remove(path);
    } catch (e) {
      if (epoch == _epoch) errors[path] = '$e';
    } finally {
      if (epoch == _epoch) {
        loading.remove(path);
        notifyListeners();
      }
    }
  }

  Future<void> refresh(int tab) async {
    await Future.wait(paths[tab].map(load));
  }

  static const paths = [
    ['/market/me', '/market/requests', '/engineer/orders'],
    [
      '/market/me',
      '/market/pool',
      '/engineer/grab-pool',
      '/engineer/designated-orders',
    ],
    ['/market/requests', '/engineer/orders'],
    ['/market/me', '/market/courses'],
    ['/market/me', '/engineer/status', '/engineer/stats'],
  ];
  List<ServiceOrder> get orders => [
    ...rows(
      data['/market/requests'],
    ).map((r) => ServiceOrder(r, platform: true)),
    ...rows(data['/engineer/orders']).map((r) => ServiceOrder(r)),
  ];
  Future<void> ordersChanged() async {
    await Future.wait(
      [
        '/market/requests',
        '/engineer/orders',
        '/market/pool',
        '/engineer/grab-pool',
        '/engineer/designated-orders',
        '/engineer/stats',
      ].map(load),
    );
  }

  void clear() {
    _epoch++;
    data.clear();
    errors.clear();
    loading.clear();
    _pending.clear();
    notifyListeners();
  }
}
