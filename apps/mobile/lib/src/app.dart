import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import '../l10n/app_localizations.dart';
import 'home_screen.dart';

/// Root widget. Telugu is the default UI language (BR-02); the learner can switch.
class TomcomApp extends StatefulWidget {
  const TomcomApp({super.key, this.initialLocale = const Locale('te')});

  final Locale initialLocale;

  @override
  State<TomcomApp> createState() => _TomcomAppState();
}

class _TomcomAppState extends State<TomcomApp> {
  late Locale _locale = widget.initialLocale;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      onGenerateTitle: (context) => AppLocalizations.of(context).appTitle,
      locale: _locale,
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
      home: HomeScreen(onLocaleChanged: (l) => setState(() => _locale = l)),
    );
  }
}
