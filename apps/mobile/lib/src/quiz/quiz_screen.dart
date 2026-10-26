import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';

import '../../l10n/app_localizations.dart';
import '../content/pack_models.dart';
import '../player/audio_service.dart';
import '../progress/progress_controller.dart';
import 'quiz_logic.dart';

/// The end-of-lesson quiz (FR-401–FR-403). Works offline: questions and answer keys are in the
/// downloaded pack. A pass at or above the pass mark opens the next lesson.
class QuizScreen extends StatefulWidget {
  const QuizScreen({
    super.key,
    required this.pack,
    required this.lesson,
    required this.progress,
    required this.audio,
    required this.mediaFile,
    this.random,
  });

  final LessonPack pack;
  final PackLesson lesson;
  final ProgressController progress;
  final AudioService audio;
  final Future<File?> Function(String mediaId) mediaFile;

  /// Fixed in tests; otherwise a new draw each attempt.
  final Random? random;

  @override
  State<QuizScreen> createState() => _QuizScreenState();
}

class _QuizScreenState extends State<QuizScreen> {
  late final Random _random = widget.random ?? Random();
  late List<QuizQuestion> _questions;
  final List<QuizAnswer> _answers = [];
  final _watch = Stopwatch();
  int _index = 0;
  Object? _response;
  bool _checked = false;
  bool? _passed;

  double get _passMark =>
      widget.progress.rules.passMark ?? widget.pack.settings.passMark;

  @override
  void initState() {
    super.initState();
    _start();
  }

  void _start() {
    _questions = drawQuestions(
      widget.lesson.questions,
      widget.pack.settings.questionsPerQuiz,
      _random,
    );
    _answers.clear();
    _index = 0;
    _response = null;
    _checked = false;
    _passed = null;
    _watch
      ..reset()
      ..start();
  }

  @override
  void dispose() {
    widget.audio.stop();
    super.dispose();
  }

  QuizQuestion get _q => _questions[_index];

  bool get _answered => switch (_q.type) {
    'match_pairs' =>
      (_response as List<int?>?)?.every((r) => r != null) ?? false,
    'word_order' =>
      (_response as List<int>?)?.length == (_q.payload['words'] as List).length,
    _ => _response != null,
  };

  void _check() {
    final response = _q.type == 'match_pairs'
        ? (_response as List<int?>).cast<int>()
        : _response;
    setState(() {
      _answers.add(QuizAnswer(_q, response, isCorrect(_q, response)));
      _checked = true;
    });
  }

  void _next() {
    widget.audio.stop();
    if (_index + 1 < _questions.length) {
      setState(() {
        _index++;
        _response = null;
        _checked = false;
      });
      return;
    }
    _watch.stop();
    final passed = widget.progress.recordQuiz(
      widget.pack,
      widget.lesson,
      scoreOf(_answers),
      passMark: _passMark,
      attemptId: const Uuid().v4(),
      duration: _watch.elapsed,
      answers: [
        for (final a in _answers)
          {
            'questionId': a.question.id,
            'response': a.response,
            'correct': a.correct,
          },
      ],
    );
    setState(() => _passed = passed);
  }

  Future<void> _play(String mediaId) async {
    final file = await widget.mediaFile(mediaId);
    if (file != null) await widget.audio.play(file, speed: 1.0);
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final locale = Localizations.localeOf(context).languageCode;
    return Scaffold(
      appBar: AppBar(
        title: Text('${t.quizTitle} · ${widget.lesson.title.of(locale)}'),
      ),
      body: _passed == null ? _question(t, locale) : _result(t, locale),
    );
  }

  Widget _question(AppLocalizations t, String locale) {
    final q = _q;
    final last = _checked ? _answers.last : null;
    return Column(
      children: [
        LinearProgressIndicator(value: (_index + 1) / _questions.length),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text(t.questionOf(_index + 1, _questions.length)),
              const SizedBox(height: 8),
              Text(
                q.prompt.of(locale),
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 16),
              KeyedSubtree(
                key: ValueKey('${q.id}-$_index'),
                child: _input(t, q),
              ),
              if (last != null) ...[
                const SizedBox(height: 16),
                _Feedback(answer: last, locale: locale),
              ],
            ],
          ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: SizedBox(
              width: double.infinity,
              child: FilledButton(
                key: const Key('quiz-action'),
                onPressed: _checked
                    ? _next
                    : _answered
                    ? _check
                    : null,
                child: Text(_checked ? t.next : t.check),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _input(AppLocalizations t, QuizQuestion q) {
    final p = q.payload;
    final audio = p['audio'] as String?;
    final play = audio == null
        ? null
        : OutlinedButton.icon(
            key: const Key('quiz-play'),
            icon: const Icon(Icons.volume_up),
            label: Text(t.listenAndChoose),
            onPressed: () => _play(audio),
          );
    void set(Object? v) {
      if (!_checked) setState(() => _response = v);
    }

    switch (q.type) {
      case 'mcq':
      case 'listen_choose':
      case 'fill_gap':
        final options = (p['options'] as List).cast<String>();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ?play,
            if (q.type == 'fill_gap')
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Text(
                  (p['text'] as String).replaceFirst(
                    '___',
                    _response == null ? '_____' : options[_response as int],
                  ),
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
              ),
            for (final (i, o) in options.indexed)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: _ChoiceButton(
                  label: o,
                  selected: _response == i,
                  onTap: () => set(i),
                ),
              ),
          ],
        );
      case 'match_pairs':
        return _MatchPairs(
          left: (p['left'] as List).cast<String>(),
          right: (p['right'] as List).cast<String>(),
          random: _random,
          enabled: !_checked,
          hint: t.tapToPair,
          onChanged: set,
        );
      case 'word_order':
        return _WordOrder(
          words: (p['words'] as List).cast<String>(),
          random: _random,
          enabled: !_checked,
          hint: t.tapWords,
          clearLabel: t.clearAnswer,
          play: play,
          onChanged: set,
        );
    }
    return const SizedBox.shrink();
  }

  Widget _result(AppLocalizations t, String locale) {
    final wrong = _answers.where((a) => !a.correct).toList();
    final percent = (scoreOf(_answers) * 100).round();
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        Icon(
          _passed! ? Icons.emoji_events : Icons.refresh,
          size: 72,
          color: _passed! ? Colors.amber : Colors.blueGrey,
        ),
        const SizedBox(height: 12),
        Text(
          t.quizScore(percent),
          style: Theme.of(context).textTheme.headlineMedium,
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 8),
        Text(
          _passed! ? t.quizPassed : t.quizFailed((_passMark * 100).round()),
          textAlign: TextAlign.center,
        ),
        if (wrong.isNotEmpty) ...[
          const SizedBox(height: 24),
          Text(
            t.reviewMistakes,
            style: Theme.of(context).textTheme.titleMedium,
          ),
          for (final a in wrong)
            Card(
              child: ListTile(
                title: Text(a.question.prompt.of(locale)),
                subtitle: Text(
                  '${correctAnswerText(a.question)}\n'
                  '${a.question.explanation.of(locale)}',
                ),
                isThreeLine: true,
              ),
            ),
        ],
        const SizedBox(height: 24),
        if (!_passed!)
          FilledButton.icon(
            key: const Key('retake'),
            icon: const Icon(Icons.refresh),
            label: Text(t.retake),
            onPressed: () => setState(_start),
          ),
        const SizedBox(height: 8),
        OutlinedButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(t.backToLessons),
        ),
      ],
    );
  }
}

class _ChoiceButton extends StatelessWidget {
  const _ChoiceButton({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
  });
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Semantics(
      selected: selected,
      button: true,
      child: OutlinedButton(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size.fromHeight(56),
          backgroundColor: selected ? scheme.primaryContainer : null,
          side: BorderSide(
            color: selected ? scheme.primary : scheme.outline,
            width: selected ? 2 : 1,
          ),
        ),
        onPressed: onTap,
        child: Text(label, style: const TextStyle(fontSize: 18)),
      ),
    );
  }
}

class _Feedback extends StatelessWidget {
  const _Feedback({required this.answer, required this.locale});
  final QuizAnswer answer;
  final String locale;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final ok = answer.correct;
    return Semantics(
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.all(12),
        color: ok ? Colors.green.shade50 : Colors.red.shade50,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              ok ? t.answerCorrect : t.answerWrong,
              style: TextStyle(
                fontWeight: FontWeight.bold,
                color: ok ? Colors.green.shade800 : Colors.red.shade800,
              ),
            ),
            if (!ok) Text(correctAnswerText(answer.question)),
            const SizedBox(height: 4),
            Text(answer.question.explanation.of(locale)),
          ],
        ),
      ),
    );
  }
}

/// Tap a left item, then a right item, to pair them. The right side is shuffled.
class _MatchPairs extends StatefulWidget {
  const _MatchPairs({
    required this.left,
    required this.right,
    required this.random,
    required this.enabled,
    required this.hint,
    required this.onChanged,
  });
  final List<String> left;
  final List<String> right;
  final Random random;
  final bool enabled;
  final String hint;
  final ValueChanged<List<int?>> onChanged;

  @override
  State<_MatchPairs> createState() => _MatchPairsState();
}

class _MatchPairsState extends State<_MatchPairs> {
  late final List<int> _order = List.generate(widget.right.length, (i) => i)
    ..shuffle(widget.random);
  late final List<int?> _pairs = List.filled(widget.left.length, null);
  int? _selected;

  void _tapRight(int r) {
    if (!widget.enabled || _selected == null) return;
    setState(() {
      for (var i = 0; i < _pairs.length; i++) {
        if (_pairs[i] == r) _pairs[i] = null;
      }
      _pairs[_selected!] = r;
      _selected = null;
    });
    widget.onChanged([..._pairs]);
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(widget.hint),
        const SizedBox(height: 8),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                children: [
                  for (final (i, l) in widget.left.indexed)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: _ChoiceButton(
                        key: Key('left-$i'),
                        label: _pairs[i] == null ? l : '${i + 1}. $l',
                        selected: _selected == i,
                        onTap: () {
                          if (widget.enabled) setState(() => _selected = i);
                        },
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                children: [
                  for (final r in _order)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Container(
                        color: _pairs.contains(r)
                            ? scheme.secondaryContainer
                            : null,
                        child: _ChoiceButton(
                          key: Key('right-$r'),
                          label: _pairs.contains(r)
                              ? '${_pairs.indexOf(r) + 1}. ${widget.right[r]}'
                              : widget.right[r],
                          selected: false,
                          onTap: () => _tapRight(r),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ],
    );
  }
}

/// Tap shuffled words to build the sentence; tap a placed word to take it back.
class _WordOrder extends StatefulWidget {
  const _WordOrder({
    required this.words,
    required this.random,
    required this.enabled,
    required this.hint,
    required this.clearLabel,
    required this.play,
    required this.onChanged,
  });
  final List<String> words;
  final Random random;
  final bool enabled;
  final String hint;
  final String clearLabel;
  final Widget? play;
  final ValueChanged<List<int>> onChanged;

  @override
  State<_WordOrder> createState() => _WordOrderState();
}

class _WordOrderState extends State<_WordOrder> {
  late final List<int> _bank = List.generate(widget.words.length, (i) => i)
    ..shuffle(widget.random);
  final List<int> _placed = [];

  void _update(VoidCallback change) {
    if (!widget.enabled) return;
    setState(change);
    widget.onChanged([..._placed]);
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ?widget.play,
        Text(widget.hint),
        const SizedBox(height: 8),
        Container(
          key: const Key('sentence'),
          constraints: const BoxConstraints(minHeight: 64),
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            border: Border.all(color: Theme.of(context).colorScheme.outline),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final i in _placed)
                InputChip(
                  label: Text(
                    widget.words[i],
                    style: const TextStyle(fontSize: 18),
                  ),
                  onPressed: () => _update(() => _placed.remove(i)),
                ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final i in _bank)
              if (!_placed.contains(i))
                ActionChip(
                  key: Key('word-$i'),
                  label: Text(
                    widget.words[i],
                    style: const TextStyle(fontSize: 18),
                  ),
                  onPressed: () => _update(() => _placed.add(i)),
                ),
          ],
        ),
        if (_placed.isNotEmpty)
          TextButton(
            onPressed: () => _update(_placed.clear),
            child: Text(widget.clearLabel),
          ),
      ],
    );
  }
}
