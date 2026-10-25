import 'package:flutter/material.dart';

import '../../l10n/app_localizations.dart';

/// Before the learner picks a language, key text is shown in Telugu and English together.
final _te = lookupAppLocalizations(const Locale('te'));
final _en = lookupAppLocalizations(const Locale('en'));

class Bilingual extends StatelessWidget {
  const Bilingual(this.pick, {super.key, this.style});

  final String Function(AppLocalizations) pick;
  final TextStyle? style;

  @override
  Widget build(BuildContext context) {
    final base = style ?? Theme.of(context).textTheme.headlineSmall;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(pick(_te), style: base),
        Text(
          pick(_en),
          style: base?.copyWith(
            fontSize: (base.fontSize ?? 20) * 0.7,
            color: Colors.black54,
          ),
        ),
      ],
    );
  }
}

/// A label with both languages on one line, for buttons.
String bilingualLabel(String Function(AppLocalizations) pick) =>
    '${pick(_te)} / ${pick(_en)}';

class StepScaffold extends StatelessWidget {
  const StepScaffold({
    super.key,
    required this.children,
    this.error,
    this.onBack,
  });

  final List<Widget> children;
  final String? error;
  final VoidCallback? onBack;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: onBack == null
          ? null
          : AppBar(
              leading: BackButton(onPressed: onBack),
              elevation: 0,
              backgroundColor: Colors.transparent,
            ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            ...children,
            if (error != null) ...[
              const SizedBox(height: 16),
              Semantics(
                liveRegion: true,
                child: Text(
                  error!,
                  style: TextStyle(
                    color: Theme.of(context).colorScheme.error,
                    fontSize: 16,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Large full-width button: easy to hit on small screens (NFR-18).
class PrimaryButton extends StatelessWidget {
  const PrimaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.busy = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 56,
      child: FilledButton(
        onPressed: busy ? null : onPressed,
        child: busy
            ? const SizedBox.square(
                dimension: 24,
                child: CircularProgressIndicator(strokeWidth: 3),
              )
            : Text(label, style: const TextStyle(fontSize: 18)),
      ),
    );
  }
}

/// Maps API error codes to learner-friendly text.
String errorText(AppLocalizations t, String? code) => switch (code) {
  null => '',
  'invalid_phone' || 'validation_failed' => t.errorInvalidPhone,
  'otp_invalid' => t.errorOtpInvalid,
  'otp_attempts_exceeded' => t.errorOtpLocked,
  'otp_resend_too_soon' || 'rate_limited' => t.errorTooSoon,
  'sms_unavailable' => t.errorSmsUnavailable,
  'batch_not_found' => t.errorBatchNotFound,
  'batch_closed' => t.errorBatchClosed,
  'network_error' => t.errorNetwork,
  'session_expired' => t.errorSessionExpired,
  'registration_expired' => t.errorRegistrationExpired,
  'use_staff_login' => t.errorStaffAccount,
  _ => t.errorGeneric,
};

/// Bilingual error text for the screens shown before a language is chosen.
String bilingualError(String? code) =>
    code == null ? '' : '${errorText(_te, code)}\n${errorText(_en, code)}';
