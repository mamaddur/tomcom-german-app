import 'package:flutter/material.dart';

import '../../l10n/app_localizations.dart';
import '../api/models.dart';
import '../content/content_controller.dart';
import '../onboarding/onboarding_controller.dart';
import '../onboarding/screens.dart';
import '../progress/progress_controller.dart';
import '../ui/widgets.dart';

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
