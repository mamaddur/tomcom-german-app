import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import '../l10n/app_localizations.dart';
import 'onboarding/onboarding_controller.dart';
import 'onboarding/screens.dart';

/// Root widget. The UI language follows the learner's choice; Telugu by default (BR-02).
class TomcomApp extends StatefulWidget {
  const TomcomApp({super.key, required this.controller});

  final OnboardingController controller;

  @override
  State<TomcomApp> createState() => _TomcomAppState();
}

class _TomcomAppState extends State<TomcomApp> {
  @override
  void initState() {
    super.initState();
    widget.controller.start();
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
        home: switch (c.step) {
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
          OnboardingStep.home => HomeScreen(c: c),
        },
      ),
    );
  }
}
