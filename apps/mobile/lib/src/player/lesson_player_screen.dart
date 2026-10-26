import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';

import '../../l10n/app_localizations.dart';
import '../content/pack_models.dart';
import 'audio_service.dart';

/// FR-304: normal and slow (0.75×) playback for every German recording.
const slowSpeed = 0.75;

/// Plays one lesson from an installed pack, screen by screen (FR-301). Works offline.
class LessonPlayerScreen extends StatefulWidget {
  const LessonPlayerScreen({
    super.key,
    required this.pack,
    required this.lesson,
    required this.mediaFile,
    required this.audio,
    this.initialScreen = 0,
    this.onScreen,
    this.onTime,
    this.onFinished,
    this.onStartQuiz,
    this.passMark = 0.8,
  });

  final LessonPack pack;
  final PackLesson lesson;
  final Future<File?> Function(String mediaId) mediaFile;
  final AudioService audio;

  /// Screen to resume at (FR-202).
  final int initialScreen;

  /// Called with each screen index reached; the "finished" page is `lesson.screens.length`.
  final ValueChanged<int>? onScreen;

  /// Time spent in the lesson while the app was in the foreground (FR-204 daily goal).
  final ValueChanged<Duration>? onTime;

  /// Called when the learner reaches the end of the lesson.
  final VoidCallback? onFinished;

  /// Opens the lesson quiz (FR-401); null when the lesson has no questions.
  final VoidCallback? onStartQuiz;

  /// Shown on the last page: the score that opens the next lesson (FR-402).
  final double passMark;

  @override
  State<LessonPlayerScreen> createState() => _LessonPlayerScreenState();
}

class _LessonPlayerScreenState extends State<LessonPlayerScreen>
    with WidgetsBindingObserver {
  late final PageController _pages;
  late int _index;
  final _watch = Stopwatch();
  bool _slow = false;
  bool _showOther = false;
  String? _audioError;

  int get _total => widget.lesson.screens.length + 1; // + the "finished" page

  @override
  void initState() {
    super.initState();
    _index = widget.initialScreen.clamp(0, _total - 1);
    _pages = PageController(initialPage: _index);
    WidgetsBinding.instance.addObserver(this);
    _watch.start();
    // After the first frame: listeners may rebuild other screens.
    WidgetsBinding.instance.addPostFrameCallback(
      (_) => widget.onScreen?.call(_index),
    );
  }

  // Only foreground time counts towards the daily goal.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _watch.start();
    } else {
      _watch.stop();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _watch.stop();
    final spent = _watch.elapsed;
    // The tree is locked during dispose; report once it is done.
    scheduleMicrotask(() => widget.onTime?.call(spent));
    _pages.dispose();
    widget.audio.stop();
    super.dispose();
  }

  Future<void> _play(German german) async {
    final file = await widget.mediaFile(german.audioId);
    if (!mounted) return;
    if (file == null) {
      setState(() => _audioError = AppLocalizations.of(context).audioMissing);
      return;
    }
    setState(() => _audioError = null);
    await widget.audio.play(file, speed: _slow ? slowSpeed : 1.0);
  }

  void _go(int delta) {
    final next = (_index + delta).clamp(0, _total - 1);
    widget.audio.stop();
    _pages.animateToPage(
      next,
      duration: const Duration(milliseconds: 250),
      curve: Curves.easeOut,
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final locale = Localizations.localeOf(context).languageCode;
    final other = locale == 'te' ? 'en' : 'te';
    final isLast = _index == _total - 1;

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.lesson.title.of(locale)),
        actions: [
          // FR-304: one switch for the whole lesson.
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: FilterChip(
              key: const Key('slow'),
              label: Text(_slow ? t.slowSpeed : t.normalSpeed),
              avatar: Icon(
                _slow ? Icons.slow_motion_video : Icons.speed,
                size: 18,
              ),
              selected: _slow,
              onSelected: (v) => setState(() => _slow = v),
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          LinearProgressIndicator(value: (_index + 1) / _total),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: [
                Text(t.screenOf(_index + 1, _total)),
                const Spacer(),
                // FR-303: explanations exist in Telugu and English; the learner can see both.
                TextButton(
                  onPressed: () => setState(() => _showOther = !_showOther),
                  child: Text(
                    _showOther
                        ? t.hideTranslation
                        : t.showTranslation(
                            other == 'en' ? 'English' : 'తెలుగు',
                          ),
                  ),
                ),
              ],
            ),
          ),
          if (_audioError != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(
                _audioError!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ),
          Expanded(
            child: PageView(
              controller: _pages,
              onPageChanged: (i) {
                setState(() => _index = i);
                widget.onScreen?.call(i);
                if (i == _total - 1) widget.onFinished?.call();
              },
              children: [
                for (final screen in widget.lesson.screens)
                  _ScreenView(
                    screen: screen,
                    pack: widget.pack,
                    locale: locale,
                    other: _showOther ? other : null,
                    play: _play,
                    mediaFile: widget.mediaFile,
                  ),
                _FinishedView(
                  passMark: widget.passMark,
                  onStartQuiz: widget.onStartQuiz,
                ),
              ],
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  OutlinedButton.icon(
                    onPressed: _index == 0 ? null : () => _go(-1),
                    icon: const Icon(Icons.arrow_back),
                    label: Text(t.back),
                  ),
                  const Spacer(),
                  if (isLast && widget.onStartQuiz != null)
                    OutlinedButton(
                      onPressed: () => Navigator.of(context).pop(),
                      child: Text(t.backToLessons),
                    )
                  else
                    FilledButton.icon(
                      key: const Key('next'),
                      onPressed: isLast
                          ? () => Navigator.of(context).pop()
                          : () => _go(1),
                      icon: Icon(isLast ? Icons.check : Icons.arrow_forward),
                      label: Text(isLast ? t.backToLessons : t.next),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// A German phrase with its play button. Large target, labelled for screen readers (NFR-17).
class GermanLine extends StatelessWidget {
  const GermanLine({
    super.key,
    required this.german,
    required this.onPlay,
    this.style,
  });
  final German german;
  final Future<void> Function(German) onPlay;
  final TextStyle? style;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    return Row(
      children: [
        IconButton.filledTonal(
          iconSize: 28,
          tooltip: t.playGerman(german.text),
          onPressed: () => onPlay(german),
          icon: const Icon(Icons.volume_up),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            german.text,
            style: style ?? Theme.of(context).textTheme.titleLarge,
            locale: const Locale('de'),
          ),
        ),
      ],
    );
  }
}

class _ScreenView extends StatelessWidget {
  const _ScreenView({
    required this.screen,
    required this.pack,
    required this.locale,
    required this.other,
    required this.play,
    required this.mediaFile,
  });

  final LessonScreen screen;
  final LessonPack pack;
  final String locale;
  final String? other;
  final Future<void> Function(German) play;
  final Future<File?> Function(String mediaId) mediaFile;

  Widget _text(BuildContext context, L10n text, {TextStyle? style}) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        text.of(locale),
        style: style ?? const TextStyle(fontSize: 18, height: 1.5),
      ),
      if (other != null)
        Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Text(
            text.of(other!),
            style: const TextStyle(fontSize: 15, color: Colors.black54),
          ),
        ),
    ],
  );

  @override
  Widget build(BuildContext context) {
    final s = screen;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: switch (s) {
        ExplainScreen() => [
          _text(context, s.body),
          const SizedBox(height: 16),
          for (final e in s.examples)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: GermanLine(german: e, onPlay: play),
            ),
        ],
        VocabScreen() => [
          for (final id in s.vocabIds)
            if (pack.vocab[id] case final v?)
              _VocabCard(
                entry: v,
                play: play,
                mediaFile: mediaFile,
                text: (l) => _text(context, l),
              ),
        ],
        DialogueScreen() => [
          for (final line in s.lines)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      line.speaker,
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                    GermanLine(german: line.german, onPlay: play),
                    _text(context, line.meaning),
                  ],
                ),
              ),
            ),
        ],
        PracticeScreen() => [
          _text(
            context,
            s.prompt,
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 24),
          GermanLine(
            german: s.target,
            onPlay: play,
            style: Theme.of(context).textTheme.headlineSmall,
          ),
        ],
      },
    );
  }
}

class _VocabCard extends StatelessWidget {
  const _VocabCard({
    required this.entry,
    required this.play,
    required this.mediaFile,
    required this.text,
  });
  final VocabEntry entry;
  final Future<void> Function(German) play;
  final Future<File?> Function(String mediaId) mediaFile;
  final Widget Function(L10n) text;

  @override
  Widget build(BuildContext context) {
    final word = [
      if (entry.article != null) entry.article!,
      entry.german.text,
    ].join(' ');
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (entry.imageId != null)
              FutureBuilder<File?>(
                future: mediaFile(entry.imageId!),
                builder: (context, snap) => snap.data == null
                    ? const SizedBox.shrink()
                    : ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: Image.file(
                          snap.data!,
                          height: 140,
                          fit: BoxFit.cover,
                          excludeFromSemantics: true,
                        ),
                      ),
              ),
            GermanLine(
              german: German(text: word, audioId: entry.german.audioId),
              onPlay: play,
            ),
            if (entry.plural != null)
              Text('Pl. ${entry.plural}', locale: const Locale('de')),
            const SizedBox(height: 4),
            text(entry.meaning),
          ],
        ),
      ),
    );
  }
}

class _FinishedView extends StatelessWidget {
  const _FinishedView({required this.passMark, required this.onStartQuiz});
  final double passMark;
  final VoidCallback? onStartQuiz;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.emoji_events, size: 72, color: Colors.amber),
            const SizedBox(height: 16),
            Text(
              t.lessonFinished,
              style: Theme.of(context).textTheme.headlineSmall,
              textAlign: TextAlign.center,
            ),
            if (onStartQuiz != null) ...[
              const SizedBox(height: 8),
              Text(
                t.quizIntro((passMark * 100).round()),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              FilledButton.icon(
                key: const Key('start-quiz'),
                icon: const Icon(Icons.quiz),
                label: Text(t.startQuiz),
                onPressed: onStartQuiz,
              ),
            ],
          ],
        ),
      ),
    );
  }
}
