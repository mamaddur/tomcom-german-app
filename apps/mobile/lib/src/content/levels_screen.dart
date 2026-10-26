import 'package:flutter/material.dart';

import '../../l10n/app_localizations.dart';
import '../progress/open_lesson.dart';
import '../progress/progress_controller.dart';
import 'content_controller.dart';
import 'pack_models.dart';

/// Levels and their offline packs (FR-307). Downloading asks first and shows the size, so the
/// learner decides whether to use mobile data (NFR-02).
class LevelsScreen extends StatefulWidget {
  const LevelsScreen({
    super.key,
    required this.content,
    required this.progress,
  });
  final ContentController content;
  final ProgressController progress;

  @override
  State<LevelsScreen> createState() => _LevelsScreenState();
}

class _LevelsScreenState extends State<LevelsScreen> {
  @override
  void initState() {
    super.initState();
    widget.content.refresh();
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(t.levelsTitle)),
      body: ListenableBuilder(
        listenable: Listenable.merge([widget.content, widget.progress]),
        builder: (context, _) {
          final c = widget.content;
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              if (c.offline)
                _Banner(text: t.offlineBanner, color: Colors.amber.shade100),
              if (c.errorCode != null)
                _Banner(
                  text: c.errorCode == 'pack_damaged'
                      ? t.errorPackDamaged
                      : t.errorDownload,
                  color: Colors.red.shade50,
                ),
              for (final level in ContentController.levels)
                _LevelCard(level: level, content: c, progress: widget.progress),
            ],
          );
        },
      ),
    );
  }
}

class _Banner extends StatelessWidget {
  const _Banner({required this.text, required this.color});
  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) => Semantics(
    liveRegion: true,
    child: Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      color: color,
      child: Text(text),
    ),
  );
}

class _LevelCard extends StatelessWidget {
  const _LevelCard({
    required this.level,
    required this.content,
    required this.progress,
  });
  final String level;
  final ContentController content;
  final ProgressController progress;

  String _mb(int bytes) => (bytes / (1024 * 1024)).toStringAsFixed(1);

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final state = content.stateOf(level);
    final offer = content.remote[level];
    final pack = content.installed[level];
    final name = switch (level) {
      'A1' => t.levelA1,
      'A2' => t.levelA2,
      _ => t.levelB1,
    };

    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(name, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            switch (state) {
              LevelState.notPublished => Text(t.notPublished),
              LevelState.downloading => Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(t.downloading((content.progress * 100).round())),
                  const SizedBox(height: 8),
                  LinearProgressIndicator(value: content.progress),
                ],
              ),
              LevelState.notDownloaded => Row(
                children: [
                  Expanded(
                    child: Text(
                      t.downloadSize(_mb(offer!.bytes), offer.lessonCount),
                    ),
                  ),
                  FilledButton(
                    onPressed: () => _confirm(context, t, name),
                    child: Text(t.download),
                  ),
                ],
              ),
              LevelState.updateAvailable => Row(
                children: [
                  Expanded(child: Text(t.updateAvailable(_mb(offer!.bytes)))),
                  FilledButton(
                    onPressed: () => _confirm(context, t, name),
                    child: Text(t.update),
                  ),
                ],
              ),
              LevelState.installed => Text(
                t.installed,
                style: const TextStyle(color: Colors.green),
              ),
            },
            if (pack != null) ...[
              const SizedBox(height: 12),
              LinearProgressIndicator(value: progress.levelProgress(pack)),
              const SizedBox(height: 4),
              Text(
                t.levelProgress((progress.levelProgress(pack) * 100).round()),
              ),
              const Divider(height: 24),
              for (final lesson in pack.lessons)
                _LessonTile(
                  pack: pack,
                  lesson: lesson,
                  content: content,
                  progress: progress,
                ),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _confirm(BuildContext context, AppLocalizations t, String name) {
    return showDialog<void>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: Text(t.downloadConfirmTitle(name)),
        content: Text(t.downloadConfirmBody(_mb(content.remote[level]!.bytes))),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialog),
            child: Text(t.cancel),
          ),
          FilledButton(
            onPressed: () {
              Navigator.pop(dialog);
              content.download(level);
            },
            child: Text(t.download),
          ),
        ],
      ),
    );
  }
}

/// One lesson with its state (FR-203): locked, ready, in progress, or passed with best score.
class _LessonTile extends StatelessWidget {
  const _LessonTile({
    required this.pack,
    required this.lesson,
    required this.content,
    required this.progress,
  });
  final LessonPack pack;
  final PackLesson lesson;
  final ContentController content;
  final ProgressController progress;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final locale = Localizations.localeOf(context).languageCode;
    final status = progress.statusOf(pack, lesson);
    final record = progress.recordOf(lesson.id);
    final (icon, color, label) = switch (status) {
      LessonStatus.locked => (Icons.lock, Colors.grey, t.statusLocked),
      LessonStatus.available => (
        Icons.play_circle_outline,
        Theme.of(context).colorScheme.primary,
        t.statusAvailable,
      ),
      LessonStatus.inProgress => (
        Icons.timelapse,
        Colors.orange.shade800,
        t.statusInProgress,
      ),
      LessonStatus.passed => (
        Icons.check_circle,
        Colors.green.shade700,
        t.statusPassed(((record?.bestScore ?? 1) * 100).round()),
      ),
    };
    return ListTile(
      key: Key('lesson-${lesson.id}'),
      contentPadding: EdgeInsets.zero,
      leading: CircleAvatar(child: Text('${lesson.order}')),
      title: Text(
        lesson.title.of(locale),
        style: status == LessonStatus.locked
            ? const TextStyle(color: Colors.grey)
            : null,
      ),
      subtitle: Text('$label · ${t.minutes(lesson.estMinutes)}'),
      trailing: Icon(icon, color: color, semanticLabel: label),
      onTap: status == LessonStatus.locked
          ? () => ScaffoldMessenger.of(context)
              ..hideCurrentSnackBar()
              ..showSnackBar(SnackBar(content: Text(t.lessonLockedHint)))
          : () => openLesson(
              context,
              content: content,
              progress: progress,
              pack: pack,
              lesson: lesson,
              screen:
                  status == LessonStatus.inProgress &&
                      !(record?.finished ?? false)
                  ? record?.screen ?? 0
                  : 0,
            ),
    );
  }
}
