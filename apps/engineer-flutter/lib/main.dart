import 'package:material_ui/material_ui.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'api.dart';
import 'store.dart';
import 'screens.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const EngineerApp());
}

const green = Color(0xff176c50);

class EngineerApp extends StatefulWidget {
  const EngineerApp({super.key});
  @override
  State<EngineerApp> createState() => _EngineerAppState();
}

class _EngineerAppState extends State<EngineerApp> {
  final api = Api();
  late final store = EngineerStore(api);
  final secure = const FlutterSecureStorage();
  bool ready = false, loggedIn = false;
  @override
  void initState() {
    super.initState();
    api.onUnauthorized = () => logout();
    restore();
  }

  Future<void> restore() async {
    try {
      api.token = await secure.read(key: 'engineer_session');
      if (api.token != null) {
        await api.call('/auth/profile');
        loggedIn = true;
      }
    } catch (_) {
      api.token = null;
    }
    if (mounted) setState(() => ready = true);
  }

  Future<void> login(String phone, String code) async {
    final result = obj(
      await api.call(
        '/identity/login',
        method: 'POST',
        body: {'phone': phone, 'code': code, 'role': 'engineer'},
      ),
    );
    final token = result['accessToken'];
    if (token is! String) throw const ApiFailure('登录响应异常');
    await secure.write(key: 'engineer_session', value: token);
    api.token = token;
    if (mounted) setState(() => loggedIn = true);
  }

  Future<void> logout() async {
    api.token = null;
    store.clear();
    try {
      await secure.delete(key: 'engineer_session');
    } catch (_) {}
    if (mounted) setState(() => loggedIn = false);
  }

  @override
  void dispose() {
    api.dispose();
    store.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    title: '智修工 · 工程师',
    theme: ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: green,
        surface: Colors.white,
      ),
      scaffoldBackgroundColor: const Color(0xfff6f8f6),
      appBarTheme: const AppBarTheme(
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.transparent,
        centerTitle: false,
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        margin: const EdgeInsets.only(bottom: 14),
        color: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Color(0xffdce5de)),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size(48, 48),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
    ),
    home: !ready
        ? const Scaffold(body: Center(child: CircularProgressIndicator()))
        : loggedIn
        ? Workspace(key: ValueKey(api.token), store: store, onLogout: logout)
        : LoginScreen(onLogin: login),
  );
}

class LoginScreen extends StatefulWidget {
  final Future<void> Function(String, String) onLogin;
  const LoginScreen({super.key, required this.onLogin});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final phone = TextEditingController(), code = TextEditingController();
  bool busy = false;
  String? error;
  @override
  void dispose() {
    phone.dispose();
    code.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    if (!RegExp(r'^1[3-9]\d{9}$').hasMatch(phone.text) ||
        !RegExp(r'^\d{6}$').hasMatch(code.text)) {
      setState(() => error = '请输入有效手机号和六位验证码');
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await widget.onLogin(phone.text, code.text);
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 460),
          child: ListView(
            shrinkWrap: true,
            padding: const EdgeInsets.all(28),
            children: [
              Image.asset(
                'assets/brand.png',
                height: 64,
                alignment: Alignment.centerLeft,
              ),
              const SizedBox(height: 32),
              const Text(
                '让现场服务，\n更有把握。',
                style: TextStyle(
                  fontSize: 34,
                  fontWeight: FontWeight.w700,
                  height: 1.3,
                ),
              ),
              const SizedBox(height: 12),
              const Text(
                '智修工 · 工程师工作空间',
                style: TextStyle(color: Colors.black54),
              ),
              const SizedBox(height: 36),
              TextField(
                controller: phone,
                keyboardType: TextInputType.phone,
                autofillHints: const [AutofillHints.telephoneNumber],
                decoration: const InputDecoration(labelText: '手机号'),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: code,
                keyboardType: TextInputType.number,
                maxLength: 6,
                decoration: const InputDecoration(labelText: '验证码'),
              ),
              if (error != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Text(
                    error!,
                    style: const TextStyle(color: Colors.red),
                  ),
                ),
              FilledButton(
                onPressed: busy ? null : submit,
                child: Text(busy ? '正在登录…' : '进入工作空间'),
              ),
              const SizedBox(height: 16),
              const Text(
                '当前为云端演示环境，可使用演示验证码 000000。账号权限与网页端一致。',
                style: TextStyle(fontSize: 12, color: Colors.black54),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

class Workspace extends StatefulWidget {
  final EngineerStore store;
  final Future<void> Function() onLogout;
  const Workspace({super.key, required this.store, required this.onLogout});
  @override
  State<Workspace> createState() => _WorkspaceState();
}

class _WorkspaceState extends State<Workspace> {
  int tab = 0;
  final loaded = <int>{0};
  static const names = ['工作台', '接单', '工单', '学习', '我的'];
  @override
  void initState() {
    super.initState();
    widget.store.refresh(0);
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: widget.store,
    builder: (context, _) => Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            Image.asset('assets/brand.png', height: 30),
            const SizedBox(width: 10),
            Text(names[tab]),
          ],
        ),
        actions: [
          IconButton(
            tooltip: '刷新当前页面',
            onPressed: () => widget.store.refresh(tab),
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: IndexedStack(
        index: tab,
        children: List.generate(
          5,
          (i) => loaded.contains(i)
              ? EngineerScreen(
                  key: ValueKey(i),
                  tab: i,
                  store: widget.store,
                  onLogout: widget.onLogout,
                )
              : const SizedBox.shrink(),
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: tab,
        onDestinationSelected: (i) {
          if (i == tab) return;
          setState(() {
            tab = i;
            loaded.add(i);
          });
          if (EngineerStore.paths[i].any(
            (p) => !widget.store.data.containsKey(p),
          )) {
            widget.store.refresh(i);
          }
        },
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home_rounded),
            label: '工作台',
          ),
          NavigationDestination(icon: Icon(Icons.bolt_outlined), label: '接单'),
          NavigationDestination(
            icon: Icon(Icons.assignment_outlined),
            label: '工单',
          ),
          NavigationDestination(icon: Icon(Icons.school_outlined), label: '学习'),
          NavigationDestination(icon: Icon(Icons.person_outline), label: '我的'),
        ],
      ),
    ),
  );
}
