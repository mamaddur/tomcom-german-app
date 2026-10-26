import 'dart:math';

import 'package:flutter/material.dart';

import '../../l10n/app_localizations.dart';
import '../content/pack_models.dart';

/// The answer area for one question of any of the five tap-only types (FR-401, NFR-18).
/// Used by the lesson quiz and the level checkpoint. Reports the response through [onChanged]:
/// an option index, or a list of indices for match pairs (nulls while incomplete) and word order.
class QuestionInput extends StatelessWidget {
  const QuestionInput({
    super.key,
    required this.question,
    required this.response,
    required this.enabled,
    required this.random,
    required this.onChanged,
    this.onPlay,
  });

  final QuizQuestion question;
  final Object? response;
  final bool enabled;
  final Random random;
  final ValueChanged<Object?> onChanged;
  final Future<void> Function(String mediaId)? onPlay;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final q = question;
    final p = q.payload;
    final audio = p['audio'] as String?;
    final play = audio == null || onPlay == null
        ? null
        : OutlinedButton.icon(
            key: const Key('quiz-play'),
            icon: const Icon(Icons.volume_up),
            label: Text(t.listenAndChoose),
            onPressed: () => onPlay!(audio),
          );
    void set(Object? v) {
      if (enabled) onChanged(v);
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
                    response == null ? '_____' : options[response as int],
                  ),
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
              ),
            for (final (i, o) in options.indexed)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: _ChoiceButton(
                  label: o,
                  selected: response == i,
                  onTap: () => set(i),
                ),
              ),
          ],
        );
      case 'match_pairs':
        return _MatchPairs(
          left: (p['left'] as List).cast<String>(),
          right: (p['right'] as List).cast<String>(),
          random: random,
          enabled: enabled,
          hint: t.tapToPair,
          onChanged: set,
        );
      case 'word_order':
        return _WordOrder(
          words: (p['words'] as List).cast<String>(),
          random: random,
          enabled: enabled,
          hint: t.tapWords,
          clearLabel: t.clearAnswer,
          play: play,
          onChanged: set,
        );
    }
    return const SizedBox.shrink();
  }
}

/// Whether [response] answers every part of [q] (all pairs matched, every word placed).
bool isAnswered(QuizQuestion q, Object? response) => switch (q.type) {
  'match_pairs' => (response as List<int?>?)?.every((r) => r != null) ?? false,
  'word_order' =>
    (response as List<int>?)?.length == (q.payload['words'] as List).length,
  _ => response != null,
};

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
