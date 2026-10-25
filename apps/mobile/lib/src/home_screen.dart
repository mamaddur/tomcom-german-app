import 'package:flutter/material.dart';

import '../l10n/app_localizations.dart';

/// Placeholder home screen for build step 1. Replaced by the dashboard in step 4.
class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key, required this.onLocaleChanged});

  final ValueChanged<Locale> onLocaleChanged;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final current = Localizations.localeOf(context).languageCode;
    return Scaffold(
      appBar: AppBar(title: Text(t.appTitle)),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(t.homeStatus, style: Theme.of(context).textTheme.bodyLarge),
            const SizedBox(height: 24),
            Text(
              t.languageLabel,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            SegmentedButton<String>(
              segments: [
                ButtonSegment(value: 'te', label: Text(t.languageTelugu)),
                ButtonSegment(value: 'en', label: Text(t.languageEnglish)),
              ],
              selected: {current},
              onSelectionChanged: (s) => onLocaleChanged(Locale(s.first)),
            ),
          ],
        ),
      ),
    );
  }
}
