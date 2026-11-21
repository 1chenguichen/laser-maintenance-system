import 'package:material_ui/material_ui.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'api.dart';
import 'store.dart';
import 'screens.dart';
import 'record_pages.dart';
import 'common.dart';

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
  final navigation = GlobalKey<NavigatorState>();
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
    if (mounted) {
      setState(() => loggedIn = false);
      navigation.currentState?.popUntil((route) => route.isFirst);
    }
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
    navigatorKey: navigation,
    locale: const Locale('zh', 'CN'),
    supportedLocales: const [Locale('zh', 'CN'), Locale('en', 'US')],
    localizationsDelegates: GlobalMaterialLocalizations.delegates,
    builder: (context, child) {
      // mobile_scanner still uses the legacy Flutter material library.
      // ignore: deprecated_member_use
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
            // mobile_scanner still depends on legacy material.
            // ignore: deprecated_member_use
            child: MaterialUiCompatibilityBridge(child: child!),
          ),
        ),
      );
    },
    theme: engineerTheme(),
    home: !ready
        ? const Scaffold(body: Center(child: CircularProgressIndicator()))
        : loggedIn
        ? Workspace(key: ValueKey(api.token), store: store, onLogout: logout)
        : LoginScreen(
            onLogin: login,
            onSendCode: (phone) async {
              await api.call(
                '/identity/send-code',
                method: 'POST',
                body: {'phone': phone},
              );
            },
          ),
  );
}

class LoginScreen extends StatefulWidget {
  final Future<void> Function(String, String) onLogin;
  final Future<void> Function(String)? onSendCode;
  const LoginScreen({super.key, required this.onLogin, this.onSendCode});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final phone = TextEditingController(), code = TextEditingController();
  bool busy = false;
  String? error, connectionDetail;
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
      connectionDetail = null;
    });
    try {
      await widget.onLogin(phone.text, code.text);
    } catch (e) {
      if (mounted) {
        setState(() {
          error = '$e';
          connectionDetail = e is ApiFailure ? e.diagnostic : null;
        });
      }
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
              Row(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(10),
                    child: Image.asset(
                      'assets/brand.png',
                      width: 40,
                      height: 40,
                    ),
                  ),
                  const SizedBox(width: 12),
                  const Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '智修工',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      Text(
                        '工程师工作台',
                        style: TextStyle(fontSize: 12, color: engineerMuted),
                      ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 48),
              const Text(
                '现场服务 · 专业履约',
                style: TextStyle(fontSize: 12, color: engineerAccent),
              ),
              const SizedBox(height: 16),
              const Text(
                '欢迎回来，\n开始今天的服务',
                style: TextStyle(
                  fontSize: 30,
                  height: 1.45,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 14),
              const Text(
                '使用工作手机号，登录你的服务工作台。',
                style: TextStyle(color: engineerMuted),
              ),
              const SizedBox(height: 24),
              const Text(
                '使用企业已开通的手机号登录，系统自动关联工作身份。',
                style: TextStyle(color: engineerMuted, fontSize: 12),
              ),
              const SizedBox(height: 32),
              const Text('手机号', style: TextStyle(fontSize: 12)),
              const SizedBox(height: 8),
              TextField(
                controller: phone,
                keyboardType: TextInputType.phone,
                autofillHints: const [AutofillHints.telephoneNumber],
                style: const TextStyle(fontSize: 16),
                decoration: const InputDecoration(hintText: '请输入工作手机号'),
              ),
              const SizedBox(height: 20),
              const Text('验证码', style: TextStyle(fontSize: 12)),
              const SizedBox(height: 8),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: TextField(
                      controller: code,
                      keyboardType: TextInputType.number,
                      maxLength: 6,
                      style: const TextStyle(fontSize: 16),
                      decoration: const InputDecoration(
                        hintText: '请输入验证码',
                        counterText: '',
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  SizedBox(
                    height: 52,
                    child: TextButton(
                      style: TextButton.styleFrom(
                        backgroundColor: engineerSoft,
                      ),
                      onPressed: busy || widget.onSendCode == null
                          ? null
                          : () async {
                              if (!RegExp(
                                r'^1[3-9]\d{9}$',
                              ).hasMatch(phone.text)) {
                                setState(() => error = '请输入有效手机号');
                                return;
                              }
                              setState(() => busy = true);
                              try {
                                await widget.onSendCode!(phone.text);
                                if (context.mounted) {
                                  notice(context, '当前为演示环境，可使用验证码 000000');
                                }
                              } catch (e) {
                                if (mounted) {
                                  setState(() => error = '$e');
                                }
                              } finally {
                                if (mounted) setState(() => busy = false);
                              }
                            },
                      child: const Text(
                        '获取验证码',
                        style: TextStyle(fontSize: 12),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),
              if (error != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Text(
                    error!,
                    style: const TextStyle(color: engineerDanger),
                  ),
                ),
              if (connectionDetail != null)
                ExpansionTile(
                  title: const Text('查看连接详情'),
                  children: [
                    Padding(
                      padding: const EdgeInsets.all(12),
                      child: SelectableText(connectionDetail!),
                    ),
                  ],
                ),
              FilledButton(
                onPressed: busy ? null : submit,
                child: Text(busy ? '正在登录…' : '登录'),
              ),
              const SizedBox(height: 12),
              const Text(
                '演示体验 · 验证码 000000',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 12, color: engineerMuted),
              ),
              const SizedBox(height: 24),
              TextButton(
                onPressed: busy
                    ? null
                    : () => openPage(context, const EngineerApplicationPage()),
                child: const Text(
                  '首次使用？ 联系企业管理员开通',
                  style: TextStyle(fontSize: 14),
                ),
              ),
              const SizedBox(height: 24),
              const Text(
                '工作身份与服务权限由所属企业及平台管理。',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 12, color: engineerMuted),
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
  String? requestedFilter;
  int intent = 0;
  void navigate(int i, [String? filter]) {
    setState(() {
      tab = i;
      loaded.add(i);
      if (filter != null) {
        requestedFilter = filter;
        intent++;
      }
    });
    if (EngineerStore.paths[i].any(widget.store.stale)) widget.store.refresh(i);
  }

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
        centerTitle: tab != 0,
        automaticallyImplyLeading: false,
        leading: tab == 0
            ? null
            : IconButton(
                tooltip: '返回工作台',
                onPressed: () => navigate(0),
                icon: const EngineerBackIcon(),
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
                    '智修工 · 工程师',
                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                  ),
                ],
              )
            : Text(const ['工作台', '接单大厅', '我的工单', '培训与资质', '我的'][tab]),
        actions: [
          IconButton(
            tooltip: tab == 4 ? '刷新当前页面' : '个人中心',
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
              ? EngineerScreen(
                  key: ValueKey(i),
                  tab: i,
                  visible: i == tab,
                  onNavigate: navigate,
                  requestedFilter: i == 2 ? requestedFilter : null,
                  intent: i == 2 ? intent : 0,
                  store: widget.store,
                  onLogout: widget.onLogout,
                )
              : const SizedBox.shrink(),
        ),
      ),
      bottomNavigationBar: EngineerBottomBar(
        selected: tab,
        onChanged: (i) {
          if (i != tab) navigate(i);
        },
      ),
    ),
  );
}
