import 'dart:io';

import 'package:flutter/material.dart';

import '../../l10n/app_localizations.dart';
import '../api/api_client.dart';
import '../api/models.dart';
import '../content/content_controller.dart';
import '../onboarding/onboarding_controller.dart';
import '../onboarding/screens.dart';
import '../progress/progress_controller.dart';
import '../ui/widgets.dart';
import 'share_file.dart';

/// FR-801: the learner's details and learning statistics. FR-802: edit them.
class MyProfileScreen extends StatelessWidget {
  const MyProfileScreen({
    super.key,
    required this.c,
    required this.content,
    required this.progress,
  });
  final OnboardingController c;
  final ContentController content;
  final ProgressController progress;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(t.myProfile)),
      body: ListenableBuilder(
        listenable: Listenable.merge([c, progress, content]),
        builder: (context, _) {
          final me = c.me;
          final locale = c.locale.languageCode;
          final profile = me?.profile;
          String nameOf(List<ReferenceItem> items, String? code) =>
              items.where((i) => i.code == code).firstOrNull?.nameFor(locale) ??
              code ??
              '';
          final average = progress.averageScore;
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text(
                [me?.firstName, me?.lastName].whereType<String>().join(' '),
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              if (profile != null) ...[
                const SizedBox(height: 4),
                Text(
                  '${nameOf(c.trades, profile.tradeCode)} · '
                  '${nameOf(c.districts, profile.districtCode)}',
                ),
              ],
              if (me?.batchName != null) Text(t.homeBatch(me!.batchName!)),
              const SizedBox(height: 16),
              Wrap(
                spacing: 12,
                runSpacing: 12,
                children: [
                  _Stat(
                    key: const Key('stat-completed'),
                    label: t.statsLessonsCompleted,
                    value: '${progress.lessonsCompleted}',
                  ),
                  _Stat(
                    key: const Key('stat-passed'),
                    label: t.statsQuizzesPassed,
                    value: '${progress.quizzesPassed}',
                  ),
                  _Stat(
                    key: const Key('stat-average'),
                    label: t.statsAverageScore,
                    value: average == null
                        ? t.notYet
                        : '${(average * 100).round()}%',
                  ),
                  _Stat(
                    key: const Key('stat-streak'),
                    label: t.statsStreak,
                    value: '${progress.streak}',
                  ),
                ],
              ),
              const SizedBox(height: 24),
              Text(
                t.progressPerLevel,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              for (final level in ContentController.levels)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(switch (level) {
                    'A1' => t.levelA1,
                    'A2' => t.levelA2,
                    _ => t.levelB1,
                  }),
                  subtitle: content.installed[level] == null
                      ? null
                      : LinearProgressIndicator(
                          value: progress.levelProgress(
                            content.installed[level]!,
                          ),
                        ),
                  trailing: Text(
                    content.installed[level] == null
                        ? t.notDownloadedShort
                        : t.levelProgress(
                            (progress.levelProgress(content.installed[level]!) *
                                    100)
                                .round(),
                          ),
                  ),
                ),
              const SizedBox(height: 24),
              OutlinedButton.icon(
                key: const Key('edit-profile'),
                icon: const Icon(Icons.edit),
                label: Text(t.editProfile),
                onPressed: () async {
                  await c.loadReference();
                  if (!context.mounted) return;
                  await Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => EditProfileScreen(c: c),
                    ),
                  );
                },
              ),
              const SizedBox(height: 24),
              _Certificates(c: c, content: content),
              const SizedBox(height: 24),
              _DataRights(c: c, content: content, progress: progress),
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
                selected: {c.locale.languageCode},
                onSelectionChanged: (s) => c.chooseLanguage(s.first),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({super.key, required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => SizedBox(
    width: 150,
    child: Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(value, style: Theme.of(context).textTheme.headlineSmall),
            Text(label),
          ],
        ),
      ),
    ),
  );
}

/// FR-802: change name, district, trade, target job or level.
class EditProfileScreen extends StatelessWidget {
  const EditProfileScreen({super.key, required this.c});
  final OnboardingController c;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final me = c.me;
    final p = me?.profile;
    return Scaffold(
      appBar: AppBar(title: Text(t.editProfile)),
      body: ListenableBuilder(
        listenable: c,
        builder: (context, _) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (c.errorCode != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Text(
                  errorText(t, c.errorCode),
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              ),
            ProfileForm(
              c: c,
              initial: p == null
                  ? null
                  : ProfileInput(
                      firstName: me?.firstName ?? '',
                      lastName: me?.lastName,
                      districtCode: p.districtCode,
                      tradeCode: p.tradeCode,
                      targetJob: p.targetJob,
                      selfDeclaredLevel: p.selfDeclaredLevel,
                    ),
              onSubmit: (input) async {
                final messenger = ScaffoldMessenger.of(context);
                final navigator = Navigator.of(context);
                if (await c.updateProfile(input)) {
                  messenger.showSnackBar(
                    SnackBar(content: Text(t.profileSaved)),
                  );
                  navigator.pop();
                }
              },
            ),
          ],
        ),
      ),
    );
  }
}

/// FR-804 (DPDP Act 2023): download everything held about the learner, or erase the account.
class _DataRights extends StatefulWidget {
  const _DataRights({
    required this.c,
    required this.content,
    required this.progress,
  });
  final OnboardingController c;
  final ContentController content;
  final ProgressController progress;

  @override
  State<_DataRights> createState() => _DataRightsState();
}

class _DataRightsState extends State<_DataRights> {
  bool _busy = false;

  Future<void> _download(AppLocalizations t) async {
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _busy = true);
    try {
      final json = await widget.c.api.exportMyData();
      final dir = await widget.content.tempDir();
      final file = File('${dir.path}/my-data.json');
      await file.writeAsString(json, flush: true);
      await shareFile(file);
    } on ApiException {
      messenger.showSnackBar(SnackBar(content: Text(t.dataExportFailed)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _delete(AppLocalizations t) async {
    final navigator = Navigator.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: Text(t.deleteAccountTitle),
        content: Text(t.deleteAccountBody),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialog, false),
            child: Text(t.cancel),
          ),
          FilledButton(
            key: const Key('confirm-delete'),
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(dialog).colorScheme.error,
            ),
            onPressed: () => Navigator.pop(dialog, true),
            child: Text(t.deleteAccountConfirm),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    if (await widget.c.eraseAccount()) {
      widget.progress.forget();
      navigator.popUntil((r) => r.isFirst);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(t.myData, style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 4),
        Text(t.downloadMyDataHint),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          key: const Key('download-data'),
          icon: _busy
              ? const SizedBox.square(
                  dimension: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.download),
          label: Text(t.downloadMyData),
          onPressed: _busy ? null : () => _download(t),
        ),
        const SizedBox(height: 8),
        TextButton.icon(
          key: const Key('delete-account'),
          style: TextButton.styleFrom(
            foregroundColor: Theme.of(context).colorScheme.error,
          ),
          icon: const Icon(Icons.delete_forever),
          label: Text(t.deleteAccount),
          onPressed: () => _delete(t),
        ),
      ],
    );
  }
}

/// FR-701, FR-702: the learner's level certificates, each downloadable as PDF.
class _Certificates extends StatefulWidget {
  const _Certificates({required this.c, required this.content});
  final OnboardingController c;
  final ContentController content;

  @override
  State<_Certificates> createState() => _CertificatesState();
}

class _CertificatesState extends State<_Certificates> {
  List<Certificate>? _list;
  String? _busy;

  @override
  void initState() {
    super.initState();
    widget.c.api.certificates().then(
      (l) {
        if (mounted) setState(() => _list = l);
      },
      onError: (Object _) {
        // Offline: the section stays empty until the next visit.
      },
    );
  }

  Future<void> _download(Certificate cert, AppLocalizations t) async {
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _busy = cert.id);
    try {
      final bytes = await widget.c.api.certificatePdf(cert.id);
      final dir = await widget.content.tempDir();
      final file = File('${dir.path}/tomcom-certificate-${cert.code}.pdf');
      await file.writeAsBytes(bytes, flush: true);
      await shareFile(file);
    } on ApiException {
      messenger.showSnackBar(SnackBar(content: Text(t.errorDownload)));
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final list = _list ?? const <Certificate>[];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(t.myCertificates, style: Theme.of(context).textTheme.titleMedium),
        if (list.isEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(t.noCertificates),
          ),
        for (final cert in list)
          ListTile(
            key: Key('certificate-${cert.code}'),
            contentPadding: EdgeInsets.zero,
            leading: Icon(
              cert.valid ? Icons.workspace_premium : Icons.block,
              color: cert.valid ? Colors.amber.shade800 : Colors.grey,
            ),
            title: Text(
              t.certificateLine(
                cert.level,
                (cert.score * 100).round(),
                cert.code,
              ),
            ),
            subtitle: cert.valid ? null : Text(t.certificateWithdrawn),
            trailing: cert.valid
                ? IconButton(
                    tooltip: t.downloadPdf,
                    icon: _busy == cert.id
                        ? const SizedBox.square(
                            dimension: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.picture_as_pdf),
                    onPressed: _busy == null ? () => _download(cert, t) : null,
                  )
                : null,
          ),
      ],
    );
  }
}
