import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../l10n/app_localizations.dart';
import '../api/models.dart';
import '../content/content_controller.dart';
import '../content/levels_screen.dart';
import '../ui/widgets.dart';
import 'onboarding_controller.dart';

// ── Bilingual screens (before the language is chosen) ──

class WelcomeScreen extends StatelessWidget {
  const WelcomeScreen({super.key, required this.c});
  final OnboardingController c;

  @override
  Widget build(BuildContext context) {
    return StepScaffold(
      error: bilingualError(c.errorCode).isEmpty
          ? null
          : bilingualError(c.errorCode),
      children: [
        const SizedBox(height: 48),
        const Icon(Icons.translate, size: 72),
        const SizedBox(height: 24),
        Bilingual(
          (t) => t.welcomeTitle,
          style: Theme.of(context).textTheme.headlineMedium,
        ),
        const SizedBox(height: 12),
        Bilingual(
          (t) => t.welcomeSubtitle,
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const SizedBox(height: 48),
        PrimaryButton(
          label: bilingualLabel((t) => t.start),
          onPressed: c.begin,
        ),
      ],
    );
  }
}

class PhoneScreen extends StatefulWidget {
  const PhoneScreen({super.key, required this.c});
  final OnboardingController c;

  @override
  State<PhoneScreen> createState() => _PhoneScreenState();
}

class _PhoneScreenState extends State<PhoneScreen> {
  final _number = TextEditingController();

  @override
  void dispose() {
    _number.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.c;
    return StepScaffold(
      onBack: c.back,
      error: c.errorCode == null ? null : bilingualError(c.errorCode),
      children: [
        Bilingual((t) => t.phoneTitle),
        const SizedBox(height: 24),
        TextField(
          key: const Key('phone'),
          controller: _number,
          autofocus: true,
          keyboardType: TextInputType.phone,
          inputFormatters: [
            FilteringTextInputFormatter.digitsOnly,
            LengthLimitingTextInputFormatter(10),
          ],
          style: const TextStyle(fontSize: 24, letterSpacing: 2),
          decoration: InputDecoration(
            prefixText: '+91 ',
            hintText: bilingualLabel((t) => t.phoneHint),
            border: const OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 24),
        PrimaryButton(
          label: bilingualLabel((t) => t.sendCode),
          busy: c.busy,
          onPressed: () => c.submitPhone(_number.text),
        ),
      ],
    );
  }
}

class OtpScreen extends StatefulWidget {
  const OtpScreen({super.key, required this.c});
  final OnboardingController c;

  @override
  State<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends State<OtpScreen> {
  final _code = TextEditingController();
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    _ticker = Timer.periodic(
      const Duration(seconds: 1),
      (_) => setState(() {}),
    );
  }

  @override
  void dispose() {
    _ticker?.cancel();
    _code.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.c;
    final wait = c.resendAvailableAt?.difference(DateTime.now()).inSeconds ?? 0;
    return StepScaffold(
      onBack: c.back,
      error: c.errorCode == null ? null : bilingualError(c.errorCode),
      children: [
        Bilingual((t) => t.otpTitle),
        const SizedBox(height: 8),
        Text(bilingualLabel((t) => t.otpSentTo('+91 ${c.phone}'))),
        const SizedBox(height: 24),
        TextField(
          key: const Key('otp'),
          controller: _code,
          autofocus: true,
          keyboardType: TextInputType.number,
          autofillHints: const [AutofillHints.oneTimeCode],
          inputFormatters: [
            FilteringTextInputFormatter.digitsOnly,
            LengthLimitingTextInputFormatter(6),
          ],
          style: const TextStyle(fontSize: 28, letterSpacing: 12),
          textAlign: TextAlign.center,
          decoration: const InputDecoration(border: OutlineInputBorder()),
          onChanged: (v) {
            if (v.length == 6) c.submitOtp(v);
          },
        ),
        const SizedBox(height: 24),
        PrimaryButton(
          label: bilingualLabel((t) => t.continueButton),
          busy: c.busy,
          onPressed: () => c.submitOtp(_code.text),
        ),
        const SizedBox(height: 8),
        TextButton(
          onPressed: wait > 0 || c.busy ? null : c.resendCode,
          child: Text(
            wait > 0
                ? bilingualLabel((t) => t.resendIn(wait))
                : bilingualLabel((t) => t.resendCode),
          ),
        ),
        TextButton(
          onPressed: c.back,
          child: Text(bilingualLabel((t) => t.changeNumber)),
        ),
      ],
    );
  }
}

class LanguageScreen extends StatelessWidget {
  const LanguageScreen({super.key, required this.c});
  final OnboardingController c;

  @override
  Widget build(BuildContext context) {
    return StepScaffold(
      error: c.errorCode == null ? null : bilingualError(c.errorCode),
      children: [
        Bilingual((t) => t.languageTitle),
        const SizedBox(height: 32),
        PrimaryButton(
          label: 'తెలుగు',
          busy: c.busy,
          onPressed: () => c.chooseLanguage('te'),
        ),
        const SizedBox(height: 16),
        PrimaryButton(
          label: 'English',
          busy: c.busy,
          onPressed: () => c.chooseLanguage('en'),
        ),
      ],
    );
  }
}

// ── Screens in the chosen language ──

class ConsentScreen extends StatefulWidget {
  const ConsentScreen({super.key, required this.c});
  final OnboardingController c;

  @override
  State<ConsentScreen> createState() => _ConsentScreenState();
}

class _ConsentScreenState extends State<ConsentScreen> {
  /// DPDP: consent is an affirmative act, so nothing is pre-ticked.
  final _ticked = <String>{};

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final c = widget.c;
    final notice = c.notice!;
    final ready = notice.purposes
        .where((p) => p.required)
        .every((p) => _ticked.contains(p.id));
    return StepScaffold(
      error: c.errorCode == null ? null : errorText(t, c.errorCode),
      children: [
        Text(notice.title, style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 16),
        Text(notice.text, style: const TextStyle(fontSize: 16, height: 1.5)),
        const SizedBox(height: 16),
        for (final p in notice.purposes)
          CheckboxListTile(
            key: Key('purpose-${p.id}'),
            value: _ticked.contains(p.id),
            onChanged: (v) =>
                setState(() => v! ? _ticked.add(p.id) : _ticked.remove(p.id)),
            title: Text(p.label),
            subtitle: Text(p.required ? t.required : t.optional),
            controlAffinity: ListTileControlAffinity.leading,
          ),
        const SizedBox(height: 16),
        if (!ready)
          Text(t.consentHint, style: const TextStyle(color: Colors.black54)),
        const SizedBox(height: 8),
        PrimaryButton(
          label: t.consentAgree,
          busy: c.busy,
          onPressed: ready ? () => c.agree(_ticked) : null,
        ),
      ],
    );
  }
}

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key, required this.c});
  final OnboardingController c;

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _form = GlobalKey<FormState>();
  final _first = TextEditingController();
  final _last = TextEditingController();
  final _job = TextEditingController();
  String? _district;
  String? _trade;
  String _level = 'none';

  @override
  void dispose() {
    _first.dispose();
    _last.dispose();
    _job.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final c = widget.c;
    final locale = c.locale.languageCode;
    String? required(Object? v) =>
        v == null || (v is String && v.trim().isEmpty) ? t.fieldRequired : null;
    final levels = {
      'none': t.levelNone,
      'A1': t.levelA1,
      'A2': t.levelA2,
      'B1': t.levelB1,
    };

    return StepScaffold(
      error: c.errorCode == null ? null : errorText(t, c.errorCode),
      children: [
        Form(
          key: _form,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                t.profileTitle,
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 24),
              TextFormField(
                key: const Key('firstName'),
                controller: _first,
                decoration: InputDecoration(
                  labelText: t.firstName,
                  border: const OutlineInputBorder(),
                ),
                validator: required,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _last,
                decoration: InputDecoration(
                  labelText: t.lastName,
                  border: const OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                key: const Key('district'),
                initialValue: _district,
                isExpanded: true,
                decoration: InputDecoration(
                  labelText: t.district,
                  border: const OutlineInputBorder(),
                ),
                items: [
                  for (final d in c.districts)
                    DropdownMenuItem(
                      value: d.code,
                      child: Text(d.nameFor(locale)),
                    ),
                ],
                onChanged: (v) => setState(() => _district = v),
                validator: required,
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                key: const Key('trade'),
                initialValue: _trade,
                isExpanded: true,
                decoration: InputDecoration(
                  labelText: t.trade,
                  border: const OutlineInputBorder(),
                ),
                items: [
                  for (final d in c.trades)
                    DropdownMenuItem(
                      value: d.code,
                      child: Text(d.nameFor(locale)),
                    ),
                ],
                onChanged: (v) => setState(() => _trade = v),
                validator: required,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _job,
                maxLength: 80,
                decoration: InputDecoration(
                  labelText: t.targetJob,
                  border: const OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 8),
              Text(t.level, style: Theme.of(context).textTheme.titleMedium),
              RadioGroup<String>(
                groupValue: _level,
                onChanged: (v) => setState(() => _level = v!),
                child: Column(
                  children: [
                    for (final e in levels.entries)
                      RadioListTile<String>(
                        key: Key('level-${e.key}'),
                        value: e.key,
                        title: Text(e.value),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              PrimaryButton(
                label: t.save,
                busy: c.busy,
                onPressed: () {
                  if (!_form.currentState!.validate()) return;
                  c.saveProfile(
                    ProfileInput(
                      firstName: _first.text.trim(),
                      lastName: _last.text.trim(),
                      districtCode: _district!,
                      tradeCode: _trade!,
                      targetJob: _job.text.trim(),
                      selfDeclaredLevel: _level,
                    ),
                  );
                },
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class BatchScreen extends StatefulWidget {
  const BatchScreen({super.key, required this.c});
  final OnboardingController c;

  @override
  State<BatchScreen> createState() => _BatchScreenState();
}

class _BatchScreenState extends State<BatchScreen> {
  final _code = TextEditingController();

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final c = widget.c;
    return StepScaffold(
      error: c.errorCode == null ? null : errorText(t, c.errorCode),
      children: [
        Text(t.batchTitle, style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 8),
        Text(t.batchHelp),
        const SizedBox(height: 24),
        TextField(
          key: const Key('batchCode'),
          controller: _code,
          textCapitalization: TextCapitalization.characters,
          style: const TextStyle(fontSize: 22, letterSpacing: 2),
          decoration: const InputDecoration(
            hintText: 'TST-001',
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 24),
        PrimaryButton(
          label: t.join,
          busy: c.busy,
          onPressed: () => c.joinBatch(_code.text),
        ),
        const SizedBox(height: 8),
        TextButton(
          onPressed: c.busy ? null : c.skipBatch,
          child: Text(t.later),
        ),
      ],
    );
  }
}

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key, required this.c, required this.content});
  final OnboardingController c;
  final ContentController content;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final me = c.me;
    return Scaffold(
      appBar: AppBar(
        title: Text(t.appTitle),
        actions: [
          IconButton(
            tooltip: t.signOut,
            icon: const Icon(Icons.logout),
            onPressed: c.signOut,
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          Text(
            t.homeWelcome(me?.firstName ?? ''),
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          if (me?.batchName != null) ...[
            const SizedBox(height: 8),
            Text(t.homeBatch(me!.batchName!)),
          ],
          const SizedBox(height: 24),
          PrimaryButton(
            label: t.lessons,
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => LevelsScreen(content: content),
              ),
            ),
          ),
          const SizedBox(height: 32),
          Text(t.languageLabel, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          SegmentedButton<String>(
            segments: [
              ButtonSegment(value: 'te', label: Text(t.languageTelugu)),
              ButtonSegment(value: 'en', label: Text(t.languageEnglish)),
            ],
            selected: {c.locale.languageCode},
            onSelectionChanged: (s) => c.chooseLanguage(s.first),
          ),
        ],
      ),
    );
  }
}
