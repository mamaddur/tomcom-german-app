import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';

import '../../l10n/app_localizations.dart';
import '../api/api_client.dart';
import '../api/models.dart';
import '../content/pack_models.dart';
import '../player/audio_service.dart';
import '../quiz/question_input.dart';

/// One page of the checkpoint: a reading or listening question, or a writing task.
sealed class _Page {}

class _QuestionPage extends _Page {
  _QuestionPage(this.section, this.question, this.n, this.total);
  final String section;
  final QuizQuestion question;
  final int n;
  final int total;
}

class _WritingPage extends _Page {
  _WritingPage(this.task, this.n, this.total);
  final WritingTask task;
  final int n;
  final int total;
}

class _ReviewPage extends _Page {}

int _words(String text) =>
    text.trim().split(RegExp(r'\s+')).where((w) => w.isNotEmpty).length;

/// FR-404: the level checkpoint, taken online. The server draws the questions, keeps the answer
/// keys and scores reading and listening; a trainer marks the writing (ADR-009).
class CheckpointScreen extends StatefulWidget {
  const CheckpointScreen({
    super.key,
    required this.api,
    required this.level,
    required this.audio,
    required this.tempDir,
    this.random,
  });

  final ApiClient api;
  final String level;
  final AudioService audio;
  final Future<Directory> Function() tempDir;
  final Random? random;

  @override
  State<CheckpointScreen> createState() => _CheckpointScreenState();
}

class _CheckpointScreenState extends State<CheckpointScreen> {
  late final Random _random = widget.random ?? Random();
  CheckpointAttempt? _attempt;
  CheckpointAttempt? _result;
  String? _error;
  bool _busy = false;
  int _index = 0;
  final Map<String, Object?> _answers = {};
  final Map<String, TextEditingController> _texts = {};

  List<_Page> get _pages {
    final a = _attempt!;
    return [
      for (final (i, q) in a.reading.indexed)
        _QuestionPage('reading', q, i + 1, a.reading.length),
      for (final (i, q) in a.listening.indexed)
        _QuestionPage('listening', q, i + 1, a.listening.length),
      for (final (i, w) in a.writing.indexed)
        _WritingPage(w, i + 1, a.writing.length),
      _ReviewPage(),
    ];
  }

  @override
  void initState() {
    super.initState();
    _start();
  }

  @override
  void dispose() {
    widget.audio.stop();
    for (final c in _texts.values) {
      c.dispose();
    }
    super.dispose();
  }

  String _errorFor(ApiException e) => switch (e.code) {
    'network_error' => 'offline',
    'rate_limited' => 'limit',
    _ => e.code,
  };

  Future<void> _start() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final a = await widget.api.startCheckpoint(widget.level);
      if (!mounted) return;
      setState(() {
        _attempt = a;
        for (final w in a.writing) {
          _texts[w.id] = TextEditingController()
            ..addListener(() => setState(() {}));
        }
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = _errorFor(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _play(String mediaId) async {
    try {
      final bytes = await widget.api.checkpointAudio(_attempt!.id, mediaId);
      final file = File('${(await widget.tempDir()).path}/cp-$mediaId.opus');
      await file.writeAsBytes(bytes, flush: true);
      await widget.audio.play(file, speed: 1.0);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = _errorFor(e));
    }
  }

  Future<void> _submit(AppLocalizations t) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        content: Text(t.submitConfirm),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialog, false),
            child: Text(t.cancel),
          ),
          FilledButton(
            key: const Key('confirm-submit'),
            onPressed: () => Navigator.pop(dialog, true),
            child: Text(t.submit),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final r = await widget.api.submitCheckpoint(
        _attempt!.id,
        answers: {
          for (final e in _answers.entries)
            // Match pairs report nulls while incomplete; only full answers count.
            if (e.value is! List || !(e.value as List).contains(null))
              e.key: e.value,
        },
        writing: {for (final e in _texts.entries) e.key: e.value.text},
      );
      if (mounted) setState(() => _result = r);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = _errorFor(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(t.checkpointTitle(widget.level))),
      body: _result != null
          ? _ResultView(result: _result!, level: widget.level)
          : _attempt == null
          ? Center(
              child: _busy
                  ? const CircularProgressIndicator()
                  : Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            _errorText(t, _error),
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 16),
                          FilledButton(
                            onPressed: _start,
                            child: Text(t.retake),
                          ),
                        ],
                      ),
                    ),
            )
          : _page(t),
    );
  }

  String _errorText(AppLocalizations t, String? code) => switch (code) {
    null => '',
    'offline' => t.checkpointOffline,
    'limit' => t.tooManyAttempts,
    'attempt_expired' => t.checkpointExpired,
    _ => t.errorGeneric,
  };

  String _section(AppLocalizations t, String s) => switch (s) {
    'reading' => t.sectionReading,
    'listening' => t.sectionListening,
    _ => t.sectionWriting,
  };

  Widget _page(AppLocalizations t) {
    final locale = Localizations.localeOf(context).languageCode;
    final pages = _pages;
    final page = pages[_index];
    final last = _index == pages.length - 1;
    final unanswered = pages.whereType<_QuestionPage>().where((p) {
      return !isAnswered(p.question, _answers[p.question.id]);
    }).length;
    final shortWriting = _attempt!.writing.where((w) {
      final n = _words(_texts[w.id]!.text);
      return n < w.minWords || n > w.maxWords;
    }).toList();

    return Column(
      children: [
        LinearProgressIndicator(value: (_index + 1) / pages.length),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.all(12),
            child: Text(
              _errorText(t, _error),
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ),
        Expanded(
          child: ListView(
            key: ValueKey(_index),
            padding: const EdgeInsets.all(16),
            children: switch (page) {
              _QuestionPage() => [
                Text(
                  t.sectionItem(_section(t, page.section), page.n, page.total),
                ),
                const SizedBox(height: 8),
                Text(
                  page.question.prompt.of(locale),
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 16),
                QuestionInput(
                  question: page.question,
                  response: _answers[page.question.id],
                  enabled: !_busy,
                  random: _random,
                  onPlay: _play,
                  onChanged: (v) =>
                      setState(() => _answers[page.question.id] = v),
                ),
              ],
              _WritingPage() => [
                Text(t.sectionItem(t.sectionWriting, page.n, page.total)),
                const SizedBox(height: 8),
                Text(
                  page.task.prompt.of(locale),
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 8),
                Text(t.writeInGerman(page.task.minWords, page.task.maxWords)),
                const SizedBox(height: 12),
                TextField(
                  key: Key('writing-${page.task.id}'),
                  controller: _texts[page.task.id],
                  minLines: 6,
                  maxLines: 12,
                  keyboardType: TextInputType.multiline,
                  decoration: const InputDecoration(
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 4),
                Text(t.wordCount(_words(_texts[page.task.id]!.text))),
              ],
              _ReviewPage() => [
                Text(
                  t.reviewAndSubmit,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 12),
                Text(t.unansweredCount(unanswered)),
                for (final w in shortWriting)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(
                      t.writingTooShortOrLong(
                        w.minWords,
                        w.maxWords,
                        _words(_texts[w.id]!.text),
                      ),
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.error,
                      ),
                    ),
                  ),
              ],
            },
          ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                OutlinedButton.icon(
                  onPressed: _index == 0 || _busy
                      ? null
                      : () => setState(() {
                          widget.audio.stop();
                          _index--;
                        }),
                  icon: const Icon(Icons.arrow_back),
                  label: Text(t.back),
                ),
                const Spacer(),
                if (last)
                  FilledButton(
                    key: const Key('checkpoint-submit'),
                    onPressed: _busy || shortWriting.isNotEmpty
                        ? null
                        : () => _submit(t),
                    child: Text(t.submit),
                  )
                else
                  FilledButton.icon(
                    key: const Key('checkpoint-next'),
                    onPressed: () => setState(() {
                      widget.audio.stop();
                      _index++;
                    }),
                    icon: const Icon(Icons.arrow_forward),
                    label: Text(t.next),
                  ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _ResultView extends StatelessWidget {
  const _ResultView({required this.result, required this.level});
  final CheckpointAttempt result;
  final String level;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final scores = result.sectionScores ?? const {};
    final (icon, color, message) = switch (result.status) {
      'passed' => (Icons.emoji_events, Colors.amber, t.checkpointPassed(level)),
      'awaiting_marking' => (
        Icons.hourglass_top,
        Colors.blueGrey,
        t.checkpointAwaiting,
      ),
      _ => (
        Icons.refresh,
        Colors.blueGrey,
        t.checkpointFailed((result.passMark * 100).round()),
      ),
    };
    String name(String s) => switch (s) {
      'reading' => t.sectionReading,
      'listening' => t.sectionListening,
      _ => t.sectionWriting,
    };
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        Icon(icon, size: 72, color: color),
        const SizedBox(height: 12),
        Text(
          message,
          style: Theme.of(context).textTheme.headlineSmall,
          textAlign: TextAlign.center,
        ),
        if (result.total != null) ...[
          const SizedBox(height: 8),
          Text(
            t.quizScore((result.total! * 100).round()),
            textAlign: TextAlign.center,
          ),
        ],
        const SizedBox(height: 16),
        for (final s in ['reading', 'listening', 'writing'])
          if (scores[s] case final v?)
            Text(
              t.sectionScore(name(s), (v * 100).round()),
              textAlign: TextAlign.center,
            ),
        const SizedBox(height: 24),
        OutlinedButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(t.backToLessons),
        ),
      ],
    );
  }
}
