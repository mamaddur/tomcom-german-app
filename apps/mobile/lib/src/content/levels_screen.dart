import 'package:flutter/material.dart';

import '../../l10n/app_localizations.dart';
import '../player/lesson_player_screen.dart';
import 'content_controller.dart';

/// Levels and their offline packs (FR-307). Downloading asks first and shows the size, so the
/// learner decides whether to use mobile data (NFR-02).
class LevelsScreen extends StatefulWidget {
  const LevelsScreen({super.key, required this.content});
  final ContentController content;

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
        listenable: widget.content,
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
                _LevelCard(level: level, content: c),
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
  const _LevelCard({required this.level, required this.content});
  final String level;
  final ContentController content;

  String _mb(int bytes) => (bytes / (1024 * 1024)).toStringAsFixed(1);

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final locale = Localizations.localeOf(context).languageCode;
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
              const Divider(height: 24),
              for (final lesson in pack.lessons)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: CircleAvatar(child: Text('${lesson.order}')),
                  title: Text(lesson.title.of(locale)),
                  subtitle: Text(t.minutes(lesson.estMinutes)),
                  trailing: const Icon(Icons.play_circle_outline),
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => LessonPlayerScreen(
                        pack: pack,
                        lesson: lesson,
                        mediaFile: (id) => content.store.mediaFile(level, id),
                        audio: content.audio,
                      ),
                    ),
                  ),
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
