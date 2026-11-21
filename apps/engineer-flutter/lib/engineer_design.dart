import 'dart:async';
import 'package:material_ui/material_ui.dart';

const engineerAccent = Color(0xff176c50);
const engineerInk = Color(0xff19342b);
const engineerMuted = Color(0xff687970);
const engineerLine = Color(0xffe3eae6);
const engineerSoft = Color(0xfff4f8f5);
const engineerDanger = Color(0xffa33d29);

ThemeData engineerTheme() {
  const ink = TextStyle(color: engineerInk, fontSize: 14, height: 22 / 14);
  return ThemeData(
    useMaterial3: true,
    visualDensity: VisualDensity.standard,
    dividerTheme: const DividerThemeData(
      color: engineerLine,
      thickness: 1,
      space: 1,
    ),
    colorScheme: const ColorScheme.light(
      primary: engineerAccent,
      onPrimary: Colors.white,
      secondary: engineerAccent,
      surface: Colors.white,
      onSurface: engineerInk,
      onSurfaceVariant: engineerMuted,
      outline: engineerLine,
      error: engineerDanger,
    ),
    scaffoldBackgroundColor: Colors.white,
    dividerColor: engineerLine,
    textTheme: const TextTheme(
      bodyMedium: ink,
      bodyLarge: TextStyle(color: engineerInk, fontSize: 16, height: 1.5),
      bodySmall: TextStyle(color: engineerMuted, fontSize: 12, height: 20 / 12),
      titleLarge: TextStyle(
        color: engineerInk,
        fontSize: 24,
        height: 32 / 24,
        fontWeight: FontWeight.w600,
      ),
      titleMedium: TextStyle(
        color: engineerInk,
        fontSize: 16,
        height: 1.5,
        fontWeight: FontWeight.w600,
      ),
      labelLarge: TextStyle(
        fontSize: 14,
        height: 22 / 14,
        fontWeight: FontWeight.w500,
      ),
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: Colors.white,
      foregroundColor: engineerInk,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: true,
      toolbarHeight: 64,
      iconTheme: IconThemeData(color: engineerAccent, size: 24),
      titleTextStyle: TextStyle(
        color: engineerInk,
        fontSize: 16,
        height: 1.5,
        fontWeight: FontWeight.w600,
      ),
      shape: Border(bottom: BorderSide(color: engineerLine)),
    ),
    iconTheme: const IconThemeData(color: engineerAccent, size: 24),
    cardTheme: CardThemeData(
      elevation: 0,
      surfaceTintColor: Colors.transparent,
      margin: const EdgeInsets.only(bottom: 12),
      color: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: engineerLine),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      isDense: true,
      constraints: const BoxConstraints(minHeight: 48),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      labelStyle: const TextStyle(color: engineerMuted, fontSize: 14),
      hintStyle: const TextStyle(color: engineerMuted, fontSize: 14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Color(0xffd6dfea)),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Color(0xffd6dfea)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: engineerAccent, width: 1.5),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: engineerAccent,
        foregroundColor: Colors.white,
        minimumSize: const Size(44, 48),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        elevation: 0,
        textStyle: const TextStyle(
          fontSize: 16,
          height: 1.5,
          fontWeight: FontWeight.w600,
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: engineerInk,
        minimumSize: const Size(44, 44),
        side: const BorderSide(color: engineerLine),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: const TextStyle(fontSize: 14, height: 22 / 14),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: engineerAccent,
        minimumSize: const Size(44, 44),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: engineerSoft,
      selectedColor: const Color(0xffedf6f1),
      showCheckmark: false,
      side: const BorderSide(color: engineerLine),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      labelStyle: const TextStyle(color: engineerAccent, fontSize: 14),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
    ),
    listTileTheme: const ListTileThemeData(
      iconColor: engineerAccent,
      textColor: engineerInk,
      titleTextStyle: TextStyle(
        color: engineerInk,
        fontSize: 14,
        height: 22 / 14,
      ),
      subtitleTextStyle: TextStyle(
        color: engineerMuted,
        fontSize: 12,
        height: 20 / 12,
      ),
      minVerticalPadding: 12,
    ),
    expansionTileTheme: const ExpansionTileThemeData(
      shape: Border(),
      collapsedShape: Border(),
      textColor: engineerAccent,
      iconColor: engineerAccent,
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
    ),
    snackBarTheme: const SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: engineerInk,
    ),
    pageTransitionsTheme: const PageTransitionsTheme(
      builders: {
        TargetPlatform.android: NoPageTransition(),
        TargetPlatform.iOS: NoPageTransition(),
        TargetPlatform.macOS: NoPageTransition(),
        TargetPlatform.windows: NoPageTransition(),
        TargetPlatform.linux: NoPageTransition(),
      },
    ),
  );
}

class EngineerRoute<T> extends MaterialPageRoute<T> {
  EngineerRoute({
    required super.builder,
    super.settings,
    super.fullscreenDialog,
  });
  @override
  Duration get transitionDuration => Duration.zero;
  @override
  Duration get reverseTransitionDuration => Duration.zero;
}

class NoPageTransition extends PageTransitionsBuilder {
  const NoPageTransition();
  @override
  Widget buildTransitions<T>(
    PageRoute<T> route,
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) => child;
}

class EngineerBackIcon extends StatelessWidget {
  const EngineerBackIcon({super.key});
  @override
  Widget build(BuildContext context) =>
      CustomPaint(size: const Size(24, 24), painter: _BackPainter());
}

class _BackPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()
      ..color = engineerAccent
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..style = PaintingStyle.stroke;
    canvas.drawPath(
      Path()
        ..moveTo(19, 12)
        ..lineTo(5, 12)
        ..moveTo(12, 5)
        ..lineTo(5, 12)
        ..lineTo(12, 19),
      p,
    );
  }

  @override
  bool shouldRepaint(CustomPainter oldDelegate) => false;
}

AppBar engineerAppBar(
  BuildContext context, {
  required Widget title,
  List<Widget>? actions,
  Widget? leading,
  PreferredSizeWidget? bottom,
}) => AppBar(
  title: title,
  leading:
      leading ??
      (Navigator.canPop(context)
          ? IconButton(
              tooltip: '返回',
              onPressed: () => Navigator.maybePop(context),
              icon: const EngineerBackIcon(),
            )
          : null),
  actions: actions ?? const [SizedBox(width: 56)],
  bottom: bottom,
);

class EngineerBottomBar extends StatelessWidget {
  final int selected;
  final ValueChanged<int> onChanged;
  const EngineerBottomBar({
    super.key,
    required this.selected,
    required this.onChanged,
  });
  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: const BoxDecoration(
      color: Colors.white,
      border: Border(top: BorderSide(color: engineerLine)),
    ),
    child: SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        child: Row(
          children: List.generate(
            5,
            (i) => Expanded(
              child: Semantics(
                selected: selected == i,
                button: true,
                // Child label supplies the accessible name once.
                child: InkWell(
                  onTap: () => onChanged(i),
                  borderRadius: BorderRadius.circular(12),
                  child: Container(
                    height: 56,
                    decoration: BoxDecoration(
                      color: selected == i
                          ? const Color(0xffedf6f1)
                          : Colors.transparent,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          const [
                            Icons.home_outlined,
                            Icons.bolt_outlined,
                            Icons.assignment_outlined,
                            Icons.school_outlined,
                            Icons.person_outline,
                          ][i],
                          size: 24,
                          color: selected == i
                              ? engineerAccent
                              : const Color(0xff8a978e),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          const ['工作台', '接单', '工单', '学习', '我的'][i],
                          style: TextStyle(
                            fontSize: 12,
                            height: 16 / 12,
                            color: selected == i
                                ? engineerAccent
                                : engineerMuted,
                            fontWeight: selected == i
                                ? FontWeight.w600
                                : FontWeight.w400,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

Widget engineerHeading(String title, [String? subtitle]) => Padding(
  padding: const EdgeInsets.only(bottom: 16),
  child: Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        title,
        style: const TextStyle(
          fontSize: 24,
          height: 32 / 24,
          fontWeight: FontWeight.w600,
          color: engineerInk,
        ),
      ),
      if (subtitle != null) ...[
        const SizedBox(height: 6),
        Text(
          subtitle,
          style: const TextStyle(
            color: engineerMuted,
            fontSize: 14,
            height: 22 / 14,
          ),
        ),
      ],
    ],
  ),
);
Widget engineerSection(String title, {Widget? trailing}) => Padding(
  padding: const EdgeInsets.only(top: 24, bottom: 12),
  child: Row(
    children: [
      Expanded(
        child: Text(
          title,
          style: const TextStyle(
            fontSize: 18,
            height: 28 / 18,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      ?trailing,
    ],
  ),
);
Widget softPanel(
  Widget child, {
  EdgeInsets padding = const EdgeInsets.all(16),
}) => Container(
  margin: const EdgeInsets.only(bottom: 16),
  padding: padding,
  decoration: BoxDecoration(
    color: engineerSoft,
    borderRadius: BorderRadius.circular(16),
  ),
  child: child,
);

class EngineerSegments extends StatelessWidget {
  final List<String> items;
  final String selected;
  final ValueChanged<String>? onChanged;
  const EngineerSegments({
    super.key,
    required this.items,
    required this.selected,
    required this.onChanged,
  });
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(4),
    decoration: BoxDecoration(
      color: const Color(0xfff1f5f2),
      border: Border.all(color: engineerLine),
      borderRadius: BorderRadius.circular(12),
    ),
    child: Row(
      children: items
          .map(
            (v) => Expanded(
              child: Semantics(
                selected: v == selected,
                button: true,
                child: InkWell(
                  onTap: onChanged == null ? null : () => onChanged!(v),
                  borderRadius: BorderRadius.circular(9),
                  child: Container(
                    constraints: const BoxConstraints(minHeight: 44),
                    alignment: Alignment.center,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 4,
                      vertical: 8,
                    ),
                    decoration: BoxDecoration(
                      color: v == selected ? Colors.white : Colors.transparent,
                      borderRadius: BorderRadius.circular(9),
                      boxShadow: v == selected
                          ? const [
                              BoxShadow(
                                color: Color(0x08000000),
                                blurRadius: 5,
                              ),
                            ]
                          : null,
                    ),
                    child: Text(
                      v,
                      style: TextStyle(
                        fontSize: 14,
                        height: 22 / 14,
                        color: v == selected ? engineerAccent : engineerMuted,
                        fontWeight: v == selected
                            ? FontWeight.w600
                            : FontWeight.w400,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          )
          .toList(),
    ),
  );
}

Widget statusTag(String text, String state) {
  final service = ['IN_SERVICE', 'REPAIRING'].contains(state),
      done = state == 'COMPLETED',
      cancel = ['CANCELLED', 'REFUSED', 'OFFLINE'].contains(state);
  final fg = service
      ? const Color(0xff205a9e)
      : done
      ? const Color(0xff326b4e)
      : cancel
      ? engineerMuted
      : const Color(0xff895713);
  return Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
    decoration: BoxDecoration(
      color: service
          ? const Color(0xffe8f3ff)
          : done
          ? const Color(0xffedf5ef)
          : cancel
          ? const Color(0xfff1f3f5)
          : const Color(0xfffff3df),
      borderRadius: BorderRadius.circular(8),
    ),
    child: Text(
      text,
      style: TextStyle(fontSize: 12, height: 16 / 12, color: fg),
    ),
  );
}

class ReferencePhoto extends StatelessWidget {
  final String model;
  final double size;
  const ReferencePhoto({super.key, required this.model, this.size = 52});
  @override
  Widget build(BuildContext context) {
    final m = model.toLowerCase();
    final kind = m.contains('焊') || m.contains('weld')
        ? 'welding'
        : m.contains('打标') || m.contains('mark')
        ? 'marking'
        : m.contains('切割') || m.contains('cut')
        ? 'cutting'
        : null;
    return ClipRRect(
      borderRadius: BorderRadius.circular(10),
      child: SizedBox(
        width: size,
        height: size,
        child: kind == null
            ? const ColoredBox(
                color: engineerSoft,
                child: Icon(Icons.precision_manufacturing_outlined),
              )
            : Stack(
                fit: StackFit.expand,
                children: [
                  Image.asset(
                    'assets/service-visuals/device-$kind.webp',
                    fit: BoxFit.cover,
                  ),
                  Align(
                    alignment: Alignment.bottomCenter,
                    child: Container(
                      color: const Color(0xdfffffff),
                      width: double.infinity,
                      child: const Text(
                        '型号参考',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 8,
                          height: 1.5,
                          color: engineerMuted,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
      ),
    );
  }
}

class EngineerBanner extends StatefulWidget {
  final bool active;
  const EngineerBanner({super.key, this.active = true});
  @override
  State<EngineerBanner> createState() => _EngineerBannerState();
}

class _EngineerBannerState extends State<EngineerBanner>
    with WidgetsBindingObserver {
  final controller = PageController(initialPage: 3000);
  Timer? timer;
  int current = 3000;
  bool paused = false;
  static const files = [
    'engineer-diagnosis',
    'engineer-network',
    'engineer-service',
  ];
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    timer = Timer.periodic(const Duration(milliseconds: 4500), (_) {
      if (!mounted ||
          paused ||
          !widget.active ||
          !controller.hasClients ||
          WidgetsBinding.instance.lifecycleState != AppLifecycleState.resumed ||
          ModalRoute.of(context)?.isCurrent != true ||
          MediaQuery.disableAnimationsOf(context)) {
        return;
      }
      final box = context.findRenderObject();
      if (box is! RenderBox || !box.hasSize) return;
      final y = box.localToGlobal(Offset.zero).dy;
      if (y + box.size.height < 64 ||
          y > MediaQuery.sizeOf(context).height - 64) {
        return;
      }
      controller.nextPage(
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeInOut,
      );
    });
  }

  @override
  void dispose() {
    timer?.cancel();
    controller.dispose();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 20),
    child: ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: SizedBox(
        height: 96,
        child: Stack(
          children: [
            PageView.builder(
              controller: controller,
              onPageChanged: (i) => setState(() => current = i),
              itemBuilder: (_, i) => Image.asset(
                'assets/service-visuals/${files[i % 3]}.webp',
                fit: BoxFit.cover,
                width: double.infinity,
              ),
            ),
            Positioned(
              bottom: 0,
              left: 0,
              right: 0,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  ...List.generate(
                    3,
                    (i) => Semantics(
                      label: '轮播第${i + 1}张',
                      button: true,
                      selected: current % 3 == i,
                      child: InkWell(
                        onTap: () => controller.animateToPage(
                          current - current % 3 + i,
                          duration: const Duration(milliseconds: 250),
                          curve: Curves.easeInOut,
                        ),
                        child: SizedBox(
                          width: 36,
                          height: 44,
                          child: Center(
                            child: Container(
                              width: current % 3 == i ? 18 : 6,
                              height: 6,
                              decoration: BoxDecoration(
                                color: current % 3 == i
                                    ? engineerAccent
                                    : const Color(0xff8ba6a0),
                                borderRadius: BorderRadius.circular(6),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                  Semantics(
                    label: paused ? '播放轮播' : '暂停轮播',
                    button: true,
                    child: TextButton(
                      style: TextButton.styleFrom(
                        backgroundColor: const Color(0xe6ffffff),
                        minimumSize: const Size(44, 44),
                        padding: const EdgeInsets.symmetric(horizontal: 10),
                      ),
                      onPressed: () => setState(() => paused = !paused),
                      child: Text(
                        paused ? '播放' : '暂停',
                        style: const TextStyle(fontSize: 12),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    ),
  );
}
