import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import '../l10n/app_localizations.dart';
import 'api/api_client.dart';
import 'content/content_controller.dart';
import 'ui/gate_screen.dart';
import 'onboarding/onboarding_controller.dart';
import 'onboarding/screens.dart';
import 'progress/dashboard_screen.dart';
import 'progress/progress_controller.dart';

/// Root widget. The UI language follows the learner's choice; Telugu by default (BR-02).
class TomcomApp extends StatefulWidget {
  const TomcomApp({
    super.key,
    required this.controller,
    required this.content,
    required this.progress,
  });

  final OnboardingController controller;
  final ContentController content;
  final ProgressController progress;

  @override
  State<TomcomApp> createState() => _TomcomAppState();
}

class _TomcomAppState extends State<TomcomApp> {
  /// FR-1102: set when this version must update, or during maintenance.
  bool _updateRequired = false;
  Map<String, String>? _maintenance;

  @override
  void initState() {
    super.initState();
    widget.controller.start();
    _checkVersion();
  }

  Future<void> _checkVersion() async {
    try {
      final config = await widget.controller.api.appConfig();
      final m = config['maintenance'] as Map<String, dynamic>?;
      if (!mounted) return;
      setState(() {
        _updateRequired = config['update'] == 'required';
        _maintenance = m?['active'] == true
            ? Map<String, String>.from(m!['message'] as Map)
            : null;
      });
    } on ApiException {
      // Offline: downloaded lessons keep working (NFR-05).
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.controller;
    return ListenableBuilder(
      listenable: c,
      builder: (context, _) => MaterialApp(
        onGenerateTitle: (context) => AppLocalizations.of(context).appTitle,
        locale: c.locale,
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF1F5FBF)),
          useMaterial3: true,
        ),
        home: _updateRequired || _maintenance != null
            ? GateScreen(
                updateRequired: _updateRequired,
                maintenance: _maintenance,
                onRetry: _checkVersion,
              )
            : switch (c.step) {
                OnboardingStep.loading => const Scaffold(
                  body: Center(child: CircularProgressIndicator()),
                ),
                OnboardingStep.welcome => WelcomeScreen(c: c),
                OnboardingStep.phone => PhoneScreen(c: c),
                OnboardingStep.otp => OtpScreen(c: c),
                OnboardingStep.language => LanguageScreen(c: c),
                OnboardingStep.consent => ConsentScreen(c: c),
                OnboardingStep.profile => ProfileScreen(c: c),
                OnboardingStep.batch => BatchScreen(c: c),
                OnboardingStep.home => HomeScreen(
                  c: c,
                  content: widget.content,
                  progress: widget.progress,
                ),
              },
      ),
    );
  }
}
