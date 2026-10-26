import 'package:flutter/material.dart';

import '../../l10n/app_localizations.dart';
import '../api/models.dart';
import '../content/content_controller.dart';
import '../content/levels_screen.dart';
import '../onboarding/onboarding_controller.dart';
import '../ui/widgets.dart';
import '../profile/profile_screen.dart';
import '../tutor/tutor_screen.dart';
import '../words/words_screen.dart';
import 'dashboard_controller.dart';
import 'open_lesson.dart';
import 'progress_controller.dart';

/// The learner's home (FR-201–FR-205): announcements, continue card, daily goal and streak,
/// and progress per level.
class HomeScreen extends StatefulWidget {
  const HomeScreen({
    super.key,
    required this.c,
    required this.content,
    required this.progress,
  });
  final OnboardingController c;
  final ContentController content;
  final ProgressController progress;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  late final DashboardController dashboard = DashboardController(
    api: widget.c.api,
    progress: widget.progress,
  );

  @override
  void initState() {
    super.initState();
    final id = widget.c.me?.id;
    if (id != null) widget.progress.open(id);
    widget.content.refresh();
    dashboard.refresh();
  }

  @override
  void dispose() {
    dashboard.dispose();
    super.dispose();
  }

  // Back on the dashboard after learning: send new attempts and time.
  /// The tutor knows the level and lesson the learner is on (FR-604).
  void _openTutor() {
    final target = widget.progress.continueTarget(
      widget.content.installed.values,
    );
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => TutorScreen(
          content: widget.content,
          level: target?.pack.level ?? 'A1',
          lessonId: target?.lesson.id,
        ),
      ),
    );
  }

  void _openLevels() => Navigator.of(context)
      .push(
        MaterialPageRoute<void>(
          builder: (_) =>
              LevelsScreen(content: widget.content, progress: widget.progress),
        ),
      )
      .then((_) => dashboard.syncProgress());

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final c = widget.c;
    final me = c.me;
    return Scaffold(
      appBar: AppBar(
        title: Text(t.appTitle),
        actions: [
          IconButton(
            key: const Key('my-profile'),
            tooltip: t.myProfile,
            icon: const Icon(Icons.person),
            onPressed: () {
              // District and trade names; offline, the profile shows codes.
              c.loadReference();
              Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => MyProfileScreen(
                    c: c,
                    content: widget.content,
                    progress: widget.progress,
                  ),
                ),
              );
            },
          ),
          IconButton(
            tooltip: t.signOut,
            icon: const Icon(Icons.logout),
            onPressed: c.signOut,
          ),
        ],
      ),
      body: ListenableBuilder(
        listenable: Listenable.merge([
          widget.content,
          widget.progress,
          dashboard,
        ]),
        builder: (context, _) => RefreshIndicator(
          onRefresh: () async {
            await Future.wait([widget.content.refresh(), dashboard.refresh()]);
          },
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text(
                t.homeWelcome(me?.firstName ?? ''),
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              if (me?.batchName != null) ...[
                const SizedBox(height: 4),
                Text(t.homeBatch(me!.batchName!)),
              ],
              const SizedBox(height: 16),
              if (dashboard.updateAvailable)
                Card(
                  key: const Key('update-available'),
                  color: Colors.amber.shade50,
                  margin: const EdgeInsets.only(bottom: 12),
                  child: ListTile(
                    leading: const Icon(Icons.system_update),
                    title: Text(t.updateAvailable2),
                  ),
                ),
              for (final a in dashboard.visible)
                _AnnouncementBanner(
                  announcement: a,
                  onClose: () => dashboard.dismiss(a.id),
                ),
              _ContinueCard(
                content: widget.content,
                progress: widget.progress,
                onOpenLevels: _openLevels,
                onReturn: dashboard.syncProgress,
              ),
              const SizedBox(height: 12),
              _GoalCard(progress: widget.progress),
              const SizedBox(height: 16),
              Text(
                t.yourLevels,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 8),
              for (final level in ContentController.levels)
                _LevelRow(
                  level: level,
                  content: widget.content,
                  progress: widget.progress,
                  onTap: _openLevels,
                ),
              const SizedBox(height: 16),
              PrimaryButton(label: t.lessons, onPressed: _openLevels),
              if (widget.progress.feature('module.tutor')) ...[
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  key: const Key('tutor'),
                  icon: const Icon(Icons.chat_bubble_outline),
                  label: Text(t.tutorButton),
                  onPressed: _openTutor,
                ),
              ],
              if (widget.progress.feature('module.tradePacks') ||
                  widget.progress.feature('module.bookmarks')) ...[
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  key: const Key('words'),
                  icon: const Icon(Icons.translate),
                  label: Text(t.wordsButton),
                  onPressed: () => Navigator.of(context)
                      .push(
                        MaterialPageRoute<void>(
                          builder: (_) => WordsScreen(
                            content: widget.content,
                            progress: widget.progress,
                            tradeCode: c.me?.profile?.tradeCode,
                          ),
                        ),
                      )
                      .then((_) => dashboard.syncProgress()),
                ),
              ],
              const SizedBox(height: 32),
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
          ),
        ),
      ),
    );
  }
}

/// FR-205: a TOMCOM announcement, in the learner's language.
class _AnnouncementBanner extends StatelessWidget {
  const _AnnouncementBanner({
    required this.announcement,
    required this.onClose,
  });
  final Announcement announcement;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final locale = Localizations.localeOf(context).languageCode;
    return Semantics(
      liveRegion: true,
      child: Card(
        color: Colors.blue.shade50,
        margin: const EdgeInsets.only(bottom: 12),
        child: ListTile(
          leading: const Icon(Icons.campaign),
          title: Text(announcement.titleIn(locale)),
          subtitle: Text(announcement.bodyIn(locale)),
          trailing: IconButton(
            tooltip: t.announcementClose,
            icon: const Icon(Icons.close),
            onPressed: onClose,
          ),
        ),
      ),
    );
  }
}

/// FR-202: opens the next unfinished lesson.
class _ContinueCard extends StatelessWidget {
  const _ContinueCard({
    required this.content,
    required this.progress,
    required this.onOpenLevels,
    required this.onReturn,
  });
  final ContentController content;
  final ProgressController progress;
  final VoidCallback onOpenLevels;
  final Future<void> Function() onReturn;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final locale = Localizations.localeOf(context).languageCode;
    final packs = [
      for (final l in ContentController.levels) ?content.installed[l],
    ];
    final target = progress.continueTarget(packs);
    return Card(
      color: Theme.of(context).colorScheme.primaryContainer,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              t.continueTitle,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            if (target != null) ...[
              Text(
                '${target.pack.level} · ${target.lesson.title.of(locale)}',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              if (target.quiz) Text(t.startQuiz),
              const SizedBox(height: 12),
              FilledButton.icon(
                key: const Key('continue'),
                icon: const Icon(Icons.play_arrow),
                label: Text(t.continueButton),
                onPressed: () =>
                    (target.quiz && target.lesson.questions.isNotEmpty
                            ? openQuiz(
                                context,
                                content: content,
                                progress: progress,
                                pack: target.pack,
                                lesson: target.lesson,
                              )
                            : openLesson(
                                context,
                                content: content,
                                progress: progress,
                                pack: target.pack,
                                lesson: target.lesson,
                                screen: target.screen,
                              ))
                        .then((_) => onReturn()),
              ),
            ] else if (packs.isEmpty) ...[
              Text(t.startFirstLesson),
              const SizedBox(height: 12),
              FilledButton(onPressed: onOpenLevels, child: Text(t.lessons)),
            ] else
              Text(t.allLessonsPassed),
          ],
        ),
      ),
    );
  }
}

/// FR-204: today's minutes against the goal, and the streak.
class _GoalCard extends StatelessWidget {
  const _GoalCard({required this.progress});
  final ProgressController progress;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final goal = progress.rules.dailyGoalMinutes;
    final today = progress.todayMinutes;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  progress.goalMetToday ? Icons.flag : Icons.outlined_flag,
                  color: progress.goalMetToday ? Colors.green.shade700 : null,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    progress.goalMetToday
                        ? t.goalMet
                        : t.dailyGoal(today, goal),
                  ),
                ),
                const Icon(
                  Icons.local_fire_department,
                  color: Colors.deepOrange,
                ),
                const SizedBox(width: 4),
                Text(t.streakDays(progress.streak)),
              ],
            ),
            const SizedBox(height: 8),
            LinearProgressIndicator(
              value: goal == 0 ? 1 : (today / goal).clamp(0, 1).toDouble(),
            ),
          ],
        ),
      ),
    );
  }
}

/// FR-201: a level with its progress percentage.
class _LevelRow extends StatelessWidget {
  const _LevelRow({
    required this.level,
    required this.content,
    required this.progress,
    required this.onTap,
  });
  final String level;
  final ContentController content;
  final ProgressController progress;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final pack = content.installed[level];
    final share = pack == null ? 0.0 : progress.levelProgress(pack);
    final name = switch (level) {
      'A1' => t.levelA1,
      'A2' => t.levelA2,
      _ => t.levelB1,
    };
    return ListTile(
      key: Key('level-$level'),
      contentPadding: EdgeInsets.zero,
      title: Text(name),
      subtitle: Padding(
        padding: const EdgeInsets.only(top: 6),
        child: LinearProgressIndicator(value: share),
      ),
      trailing: Text(
        pack == null
            ? t.notDownloadedShort
            : t.levelProgress((share * 100).round()),
      ),
      onTap: onTap,
    );
  }
}
