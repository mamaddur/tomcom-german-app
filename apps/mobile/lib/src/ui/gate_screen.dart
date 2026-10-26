import 'package:flutter/material.dart';

import '../../l10n/app_localizations.dart';

/// FR-1102: shown instead of the app when this version must update, or during maintenance.
/// Bilingual because it can appear before a language is chosen.
class GateScreen extends StatelessWidget {
  const GateScreen({
    super.key,
    required this.updateRequired,
    required this.maintenance,
    required this.onRetry,
  });

  final bool updateRequired;
  final Map<String, String>? maintenance;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final locale = Localizations.localeOf(context).languageCode;
    final (icon, title, body) = updateRequired
        ? (Icons.system_update, t.updateRequiredTitle, t.updateRequiredBody)
        : (
            Icons.build_circle,
            t.maintenanceTitle,
            maintenance?[locale] ?? maintenance?['en'] ?? '',
          );
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  icon,
                  size: 72,
                  color: Theme.of(context).colorScheme.primary,
                ),
                const SizedBox(height: 16),
                Text(
                  title,
                  style: Theme.of(context).textTheme.headlineSmall,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 12),
                Text(body, textAlign: TextAlign.center),
                const SizedBox(height: 24),
                OutlinedButton(onPressed: onRetry, child: Text(t.tryAgain)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
