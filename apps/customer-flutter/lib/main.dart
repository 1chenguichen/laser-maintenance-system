import 'package:material_ui/material_ui.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'api.dart';
import 'common.dart';
import 'store.dart';
import 'screens.dart';
import 'enterprise.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const CustomerApp());
}

class CustomerApp extends StatefulWidget {
  const CustomerApp({super.key});
  @override
  State<CustomerApp> createState() => _CustomerAppState();
}

class _CustomerAppState extends State<CustomerApp> {
  final api = Api();
  final nav = GlobalKey<NavigatorState>();
  late final store = CustomerStore(api);
  final secure = const FlutterSecureStorage();
  Json mobile = {};
  bool ready = false, logged = false;
  @override
  void initState() {
    super.initState();
    api.onUnauthorized = logout;
    restore();
  }

  Future<void> restore() async {
    try {
      api.token = await secure.read(key: 'customer_flutter_session');
      if (api.token != null) {
        mobile = obj(await api.call('/iot/mobile-context'));
        logged = true;
      }
    } catch (_) {
      api.token = null;
    }
    if (mounted) setState(() => ready = true);
  }

  Future<void> login(Json body) async {
    final result = obj(
      await api.call('/iot/mobile-login', method: 'POST', body: body),
    );
    final token = result['accessToken'];
    if (token is! String) throw const ApiFailure('登录响应异常');
    await secure.write(key: 'customer_flutter_session', value: token);
    api.token = token;
    mobile = obj(result['mobile']);
    store.data['/auth/profile'] = obj(result['user']);
    if (mounted) setState(() => logged = true);
  }

  Future<void> logout() async {
    api.token = null;
    store.clear();
    try {
      await secure.delete(key: 'customer_flutter_session');
    } catch (_) {}
    if (mounted) {
      setState(() => logged = false);
      nav.currentState?.popUntil((r) => r.isFirst);
    }
  }

  @override
  void dispose() {
    store.dispose();
    api.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    title: '智修工 · 客户端',
    navigatorKey: nav,
    locale: const Locale('zh', 'CN'),
    supportedLocales: const [Locale('zh', 'CN'), Locale('en', 'US')],
    localizationsDelegates: GlobalMaterialLocalizations.delegates,
    builder: (context, child) {
      // mobile_scanner still depends on legacy material.
      // ignore: deprecated_member_use
      final bridge = MaterialUiCompatibilityBridge(child: child!);
      return Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 460),
          child: MediaQuery(
            data: MediaQuery.of(context).copyWith(
              size: Size(
                MediaQuery.sizeOf(context).width > 460
                    ? 460
                    : MediaQuery.sizeOf(context).width,
                MediaQuery.sizeOf(context).height,
              ),
            ),
            child: bridge,
          ),
        ),
      );
    },
    theme: clientTheme(),
    home: !ready
        ? const Scaffold(body: Center(child: CircularProgressIndicator()))
        : !logged
        ? CustomerLogin(api: api, onLogin: login)
        : mobile['type'] == 'enterprise'
        ? EnterpriseShell(api: api, mobile: mobile, onLogout: logout)
        : CustomerShell(store: store, onLogout: logout),
  );
}

class CustomerLogin extends StatefulWidget {
  final Api api;
  final Future<void> Function(Json) onLogin;
  const CustomerLogin({super.key, required this.api, required this.onLogin});
  @override
  State<CustomerLogin> createState() => _CustomerLoginState();
}

class _CustomerLoginState extends State<CustomerLogin> {
  final phone = TextEditingController(),
      code = TextEditingController(),
      username = TextEditingController(),
      password = TextEditingController();
  String mode = '验证码登录';
  bool busy = false, show = false;
  String? error, detail;
  @override
  void dispose() {
    for (final c in [phone, code, username, password]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> submit() async {
    if (mode == '验证码登录' &&
        (!RegExp(r'^1[3-9]\d{9}$').hasMatch(phone.text) ||
            !RegExp(r'^\d{6}$').hasMatch(code.text))) {
      setState(() => error = '请输入有效手机号和六位验证码');
      return;
    }
    if (mode == '密码登录' &&
        (username.text.trim().isEmpty || password.text.isEmpty)) {
      setState(() => error = '请输入账号和密码');
      return;
    }
    setState(() {
      busy = true;
      error = null;
      detail = null;
    });
    try {
      await widget.onLogin(
        mode == '验证码登录'
            ? {
                'mode': 'code',
                'phone': phone.text,
                'code': code.text,
                'role': 'customer',
              }
            : {
                'mode': 'password',
                'username': username.text.trim(),
                'password': password.text,
              },
      );
    } catch (e) {
      if (mounted) {
        setState(() {
          error = '$e';
          detail = e is ApiFailure ? e.diagnostic : null;
        });
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> send() async {
    if (!RegExp(r'^1[3-9]\d{9}$').hasMatch(phone.text)) {
      setState(() => error = '请先输入有效手机号');
      return;
    }
    setState(() => busy = true);
    try {
      await widget.api.call(
        '/identity/send-code',
        method: 'POST',
        body: {'phone': phone.text},
      );
      if (mounted) notice(context, '当前为演示环境，可使用验证码 000000');
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(28, 36, 28, 28),
        children: [
          Row(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: Image.asset('assets/brand.png', width: 40, height: 40),
              ),
              const SizedBox(width: 12),
              const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '智修工',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                  ),
                  Text(
                    '设备服务',
                    style: TextStyle(fontSize: 12, color: clientMuted),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 40),
          const Text(
            '设备售后 · 随时在身边',
            style: TextStyle(fontSize: 12, color: clientAccent),
          ),
          const SizedBox(height: 14),
          const Text(
            '设备服务，\n从这里开始',
            style: TextStyle(
              fontSize: 30,
              height: 1.4,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 14),
          const Text(
            '登录后进入你的服务首页或企业工作台。',
            style: TextStyle(color: clientMuted),
          ),
          const SizedBox(height: 28),
          ClientSegments(
            items: const ['验证码登录', '密码登录'],
            selected: mode,
            onChanged: busy
                ? null
                : (v) => setState(() {
                    mode = v;
                    error = null;
                  }),
          ),
          const SizedBox(height: 20),
          if (mode == '验证码登录') ...[
            TextField(
              controller: phone,
              keyboardType: TextInputType.phone,
              autofillHints: const [AutofillHints.telephoneNumber],
              decoration: const InputDecoration(labelText: '手机号'),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: code,
                    keyboardType: TextInputType.number,
                    maxLength: 6,
                    decoration: const InputDecoration(
                      labelText: '验证码',
                      counterText: '',
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                TextButton(
                  onPressed: busy ? null : send,
                  child: const Text('获取验证码'),
                ),
              ],
            ),
          ] else ...[
            TextField(
              controller: username,
              autofillHints: const [AutofillHints.username],
              decoration: const InputDecoration(labelText: '登录账号'),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: password,
              obscureText: !show,
              autofillHints: const [AutofillHints.password],
              decoration: InputDecoration(
                labelText: '密码',
                suffixIcon: IconButton(
                  tooltip: show ? '隐藏密码' : '显示密码',
                  onPressed: () => setState(() => show = !show),
                  icon: Icon(
                    show
                        ? Icons.visibility_off_outlined
                        : Icons.visibility_outlined,
                  ),
                ),
              ),
            ),
          ],
          const SizedBox(height: 20),
          if (error != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(error!, style: const TextStyle(color: clientDanger)),
            ),
          if (detail != null)
            ExpansionTile(
              title: const Text('查看连接详情'),
              children: [SelectableText(detail!)],
            ),
          FilledButton(
            onPressed: busy ? null : submit,
            child: Text(busy ? '正在登录…' : '登录'),
          ),
          if (mode == '验证码登录')
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Text(
                '演示体验 · 验证码 000000',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 12, color: clientMuted),
              ),
            ),
          TextButton(
            onPressed: busy
                ? null
                : () => notice(context, '使用手机号验证码登录即可进入现有服务；新账号按平台规则建立客户身份。'),
            child: const Text('还没有账号？使用手机号登录'),
          ),
          const SizedBox(height: 20),
          const Text(
            '账号可用身份和设备范围由服务平台验证。',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 12, color: clientMuted),
          ),
        ],
      ),
    ),
  );
}

class CustomerShell extends StatefulWidget {
  final CustomerStore store;
  final Future<void> Function() onLogout;
  const CustomerShell({super.key, required this.store, required this.onLogout});
  @override
  State<CustomerShell> createState() => _CustomerShellState();
}

class _CustomerShellState extends State<CustomerShell> {
  int tab = 0;
  final loaded = <int>{0};
  @override
  void initState() {
    super.initState();
    widget.store.refresh(0);
  }

  void navigate(int value) {
    setState(() {
      tab = value;
      loaded.add(value);
    });
    if (CustomerStore.paths[value].any(widget.store.stale)) {
      widget.store.refresh(value);
    }
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: widget.store,
    builder: (context, _) => Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        centerTitle: tab != 0,
        leading: tab == 0
            ? null
            : IconButton(
                tooltip: '返回首页',
                onPressed: () => navigate(0),
                icon: const ClientBackIcon(),
              ),
        title: tab == 0
            ? Row(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(9),
                    child: Image.asset(
                      'assets/brand.png',
                      width: 32,
                      height: 32,
                    ),
                  ),
                  const SizedBox(width: 8),
                  const Text(
                    '智修工',
                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                  ),
                ],
              )
            : Text(const ['首页', '找服务', '我的设备', '服务订单', '我的'][tab]),
        actions: [
          IconButton(
            tooltip: tab == 4 ? '刷新' : '个人中心',
            onPressed: () => tab == 4 ? widget.store.refresh(4) : navigate(4),
            icon: Icon(
              tab == 4 ? Icons.refresh : Icons.account_circle_outlined,
            ),
          ),
        ],
      ),
      body: IndexedStack(
        index: tab,
        children: List.generate(
          5,
          (i) => loaded.contains(i)
              ? CustomerScreen(
                  key: ValueKey(i),
                  store: widget.store,
                  tab: i,
                  visible: i == tab,
                  onNavigate: navigate,
                  onLogout: widget.onLogout,
                )
              : const SizedBox.shrink(),
        ),
      ),
      bottomNavigationBar: ClientBottomBar(selected: tab, onChanged: navigate),
    ),
  );
}
