import 'dart:io';

import 'package:flutter/material.dart';

import '../../l10n/app_localizations.dart';
import '../content/content_controller.dart';
import '../content/pack_models.dart';
import '../progress/progress_controller.dart';

/// A vocabulary entry with the level pack it came from (for its audio and image files).
typedef PackedWord = ({String level, VocabEntry entry});

/// FR-306 words for the learner's trade, and FR-308 the personal word list with review.
class WordsScreen extends StatelessWidget {
  const WordsScreen({
    super.key,
    required this.content,
    required this.progress,
    required this.tradeCode,
  });
  final ContentController content;
  final ProgressController progress;
  final String? tradeCode;

  /// Every word in the downloaded levels, each once.
  Map<String, PackedWord> get _all => {
    for (final level in ContentController.levels)
      if (content.installed[level] case final pack?)
        for (final v in pack.vocab.values) v.id: (level: level, entry: v),
  };

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final showTrade = progress.feature('module.tradePacks');
    final showList = progress.feature('module.bookmarks');
    final tabs = [
      if (showTrade) Tab(text: t.myTradeWords),
      if (showList) Tab(text: t.myWordList),
    ];
    return DefaultTabController(
      length: tabs.length,
      child: Scaffold(
        appBar: AppBar(
          title: Text(t.wordsTitle),
          bottom: tabs.length > 1 ? TabBar(tabs: tabs) : null,
        ),
        body: ListenableBuilder(
          listenable: progress,
          builder: (context, _) {
            final all = _all;
            final trade = [
              for (final w in all.values)
                if (tradeCode != null && w.entry.tradeTags.contains(tradeCode))
                  w,
            ];
            final saved = [for (final id in progress.savedWords) ?all[id]];
            return TabBarView(
              children: [
                if (showTrade)
                  _WordList(
                    words: trade,
                    empty: t.noTradeWords,
                    content: content,
                    progress: progress,
                    bookmarks: showList,
                  ),
                if (showList)
                  _WordList(
                    words: saved,
                    empty: t.noSavedWords,
                    content: content,
                    progress: progress,
                    bookmarks: true,
                    header: Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: FilledButton.icon(
                        key: const Key('review'),
                        icon: const Icon(Icons.style),
                        label: Text(t.reviewDue(progress.dueWords.length)),
                        onPressed: progress.dueWords.isEmpty
                            ? null
                            : () => Navigator.of(context).push(
                                MaterialPageRoute<void>(
                                  builder: (_) => ReviewScreen(
                                    words: [
                                      for (final id in progress.dueWords)
                                        ?all[id],
                                    ],
                                    content: content,
                                    progress: progress,
                                  ),
                                ),
                              ),
                      ),
                    ),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _WordList extends StatelessWidget {
  const _WordList({
    required this.words,
    required this.empty,
    required this.content,
    required this.progress,
    required this.bookmarks,
    this.header,
  });
  final List<PackedWord> words;
  final String empty;
  final ContentController content;
  final ProgressController progress;
  final bool bookmarks;
  final Widget? header;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        ?header,
        if (words.isEmpty) Text(empty),
        for (final w in words)
          WordTile(
            word: w,
            content: content,
            progress: progress,
            bookmarks: bookmarks,
          ),
      ],
    );
  }
}

/// One word: German with its article, meaning, play button and the bookmark star.
class WordTile extends StatelessWidget {
  const WordTile({
    super.key,
    required this.word,
    required this.content,
    required this.progress,
    this.bookmarks = true,
  });
  final PackedWord word;
  final ContentController content;
  final ProgressController progress;
  final bool bookmarks;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final locale = Localizations.localeOf(context).languageCode;
    final e = word.entry;
    final german = [?e.article, e.german.text].join(' ');
    final saved = progress.isSaved(e.id);
    return Card(
      key: Key('word-${e.id}'),
      child: ListTile(
        leading: IconButton(
          tooltip: german,
          icon: const Icon(Icons.volume_up),
          onPressed: () => _play(content, word.level, e.german.audioId),
        ),
        title: Text(german, locale: const Locale('de')),
        subtitle: Text(e.meaning.of(locale)),
        trailing: bookmarks
            ? IconButton(
                key: Key('star-${e.id}'),
                tooltip: saved ? t.removeWord : t.saveWord,
                icon: Icon(
                  saved ? Icons.star : Icons.star_border,
                  color: saved ? Colors.amber.shade700 : null,
                ),
                onPressed: () => progress.toggleWord(e.id),
              )
            : null,
      ),
    );
  }
}

Future<void> _play(
  ContentController content,
  String level,
  String audioId,
) async {
  final File? file = await content.store.mediaFile(level, audioId);
  if (file != null) await content.audio.play(file, speed: 1.0);
}

/// FR-308 spaced repetition: German first, meaning on tap, then "I knew it" or "Not yet".
class ReviewScreen extends StatefulWidget {
  const ReviewScreen({
    super.key,
    required this.words,
    required this.content,
    required this.progress,
  });
  final List<PackedWord> words;
  final ContentController content;
  final ProgressController progress;

  @override
  State<ReviewScreen> createState() => _ReviewScreenState();
}

class _ReviewScreenState extends State<ReviewScreen> {
  int _index = 0;
  bool _shown = false;

  void _answer(bool knew) {
    widget.progress.reviewWord(widget.words[_index].entry.id, knew: knew);
    setState(() {
      _index++;
      _shown = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final locale = Localizations.localeOf(context).languageCode;
    final done = _index >= widget.words.length;
    return Scaffold(
      appBar: AppBar(title: Text(t.myWordList)),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: done
            ? Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(
                      Icons.emoji_events,
                      size: 72,
                      color: Colors.amber,
                    ),
                    const SizedBox(height: 12),
                    Text(t.reviewDone, textAlign: TextAlign.center),
                    const SizedBox(height: 16),
                    OutlinedButton(
                      onPressed: () => Navigator.of(context).pop(),
                      child: Text(t.back),
                    ),
                  ],
                ),
              )
            : _card(t, locale, widget.words[_index]),
      ),
    );
  }

  Widget _card(AppLocalizations t, String locale, PackedWord w) {
    final e = w.entry;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          '${_index + 1} / ${widget.words.length}',
          textAlign: TextAlign.center,
        ),
        const Spacer(),
        Text(
          [?e.article, e.german.text].join(' '),
          locale: const Locale('de'),
          style: Theme.of(context).textTheme.headlineMedium,
          textAlign: TextAlign.center,
        ),
        IconButton(
          tooltip: e.german.text,
          icon: const Icon(Icons.volume_up, size: 36),
          onPressed: () => _play(widget.content, w.level, e.german.audioId),
        ),
        const SizedBox(height: 16),
        if (_shown)
          Text(
            e.meaning.of(locale),
            style: Theme.of(context).textTheme.titleLarge,
            textAlign: TextAlign.center,
          ),
        const Spacer(),
        if (!_shown)
          FilledButton(
            key: const Key('show-meaning'),
            onPressed: () => setState(() => _shown = true),
            child: Text(t.showMeaning),
          )
        else
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  key: const Key('not-yet'),
                  onPressed: () => _answer(false),
                  child: Text(t.notYet2),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton(
                  key: const Key('knew-it'),
                  onPressed: () => _answer(true),
                  child: Text(t.knewIt),
                ),
              ),
            ],
          ),
      ],
    );
  }
}
