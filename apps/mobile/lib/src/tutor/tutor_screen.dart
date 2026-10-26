import 'dart:io';

import 'package:flutter/material.dart';

import '../../l10n/app_localizations.dart';
import '../api/api_client.dart';
import '../api/models.dart';
import '../content/content_controller.dart';
import 'tutor_logic.dart';

/// FR-601: chat with the AI tutor, online only. German phrases in an answer can be tapped to hear
/// the lesson recording (FR-603); a wrong answer can be reported with one tap (FR-608).
class TutorScreen extends StatefulWidget {
  const TutorScreen({
    super.key,
    required this.content,
    required this.level,
    this.lessonId,
  });

  final ContentController content;

  /// The level the learner is studying, and the lesson they have open, if any.
  final String level;
  final String? lessonId;

  @override
  State<TutorScreen> createState() => _TutorScreenState();
}

class _TutorScreenState extends State<TutorScreen> {
  final _input = TextEditingController();
  final _scroll = ScrollController();
  final List<TutorMessage> _messages = [];
  bool _loading = true;
  bool _busy = false;
  bool _demo = false;
  bool _limitReached = false;
  int? _remaining;
  String? _error;

  ApiClient get _api => widget.content.api;

  @override
  void initState() {
    super.initState();
    _loadHistory();
  }

  @override
  void dispose() {
    widget.content.audio.stop();
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  String _errorFor(ApiException e) => switch (e.code) {
    'network_error' => 'offline',
    'tutor_daily_limit' => 'limit',
    'tutor_unavailable' || 'feature_disabled' => 'unavailable',
    'rate_limited' => 'rate',
    _ => 'generic',
  };

  Future<void> _loadHistory() async {
    try {
      final history = await _api.tutorHistory();
      if (!mounted) return;
      setState(() => _messages.addAll(history));
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = _errorFor(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _send(String raw) async {
    final text = raw.trim();
    if (text.isEmpty || _busy) return;
    _input.clear();
    setState(() {
      _busy = true;
      _error = null;
      _messages.add(
        TutorMessage(
          id: 'local-${_messages.length}',
          fromTutor: false,
          text: text,
        ),
      );
    });
    _toEnd();
    try {
      final reply = await _api.tutorSend(
        text,
        widget.level,
        lessonId: widget.lessonId,
      );
      if (!mounted) return;
      setState(() {
        _messages.add(
          TutorMessage(id: reply.id, fromTutor: true, text: reply.reply),
        );
        _demo = reply.demo;
        _remaining = reply.remainingToday;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      final kind = _errorFor(e);
      setState(() {
        _error = kind;
        if (kind == 'limit') _limitReached = true;
      });
    } finally {
      if (mounted) setState(() => _busy = false);
      _toEnd();
    }
  }

  void _toEnd() => WidgetsBinding.instance.addPostFrameCallback((_) {
    if (_scroll.hasClients) {
      _scroll.animateTo(
        _scroll.position.maxScrollExtent,
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOut,
      );
    }
  });

  Future<void> _play(String phrase) async {
    final t = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final hit = findRecording(widget.content.installed, phrase);
    final File? file = hit == null
        ? null
        : await widget.content.store.mediaFile(hit.level, hit.audioId);
    if (file == null) {
      messenger.showSnackBar(SnackBar(content: Text(t.tutorNoAudio)));
      return;
    }
    await widget.content.audio.play(file, speed: 1.0);
  }

  Future<void> _flag(TutorMessage m) async {
    final t = AppLocalizations.of(context);
    final reasons = {
      t.tutorReasonGerman: 'German is wrong',
      t.tutorReasonMeaning: 'Telugu or English is wrong',
      t.tutorReasonUnsafe: 'Not appropriate',
    };
    final messenger = ScaffoldMessenger.of(context);
    final picked = await showModalBottomSheet<String>(
      context: context,
      builder: (sheet) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: Text(
                t.tutorFlagTitle,
                style: Theme.of(sheet).textTheme.titleMedium,
              ),
            ),
            for (final e in reasons.entries)
              ListTile(
                key: Key('reason-${e.value}'),
                title: Text(e.key),
                onTap: () => Navigator.pop(sheet, e.value),
              ),
          ],
        ),
      ),
    );
    if (picked == null) return;
    try {
      await _api.tutorFlag(m.id, picked);
      if (!mounted) return;
      setState(() => m.flagged = true);
      messenger.showSnackBar(SnackBar(content: Text(t.tutorFlagThanks)));
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = _errorFor(e));
    }
  }

  String _errorText(AppLocalizations t, String kind) => switch (kind) {
    'offline' => t.tutorOffline,
    'limit' => t.tutorLimitReached,
    'unavailable' => t.tutorUnavailable,
    'rate' => t.tooManyAttempts,
    _ => t.errorGeneric,
  };

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final unavailable = _error == 'unavailable';
    final suggestions = [
      t.tutorSuggestGreet,
      t.tutorSuggestThanks,
      t.tutorSuggestName,
    ];
    return Scaffold(
      appBar: AppBar(title: Text(t.tutorTitle)),
      body: Column(
        children: [
          if (_demo)
            Container(
              key: const Key('tutor-demo'),
              width: double.infinity,
              color: Colors.amber.shade100,
              padding: const EdgeInsets.all(10),
              child: Text(t.tutorDemoBanner),
            ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : unavailable
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(
                        t.tutorUnavailable,
                        textAlign: TextAlign.center,
                      ),
                    ),
                  )
                : _messages.isEmpty
                ? ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      Text(t.tutorEmpty),
                      const SizedBox(height: 12),
                      for (final (i, s) in suggestions.indexed)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: OutlinedButton(
                            key: Key('suggest-$i'),
                            onPressed: _busy ? null : () => _send(s),
                            child: Text(s),
                          ),
                        ),
                    ],
                  )
                : ListView.builder(
                    controller: _scroll,
                    padding: const EdgeInsets.all(12),
                    itemCount: _messages.length + (_busy ? 1 : 0),
                    itemBuilder: (_, i) => i == _messages.length
                        ? const Padding(
                            padding: EdgeInsets.all(12),
                            child: Align(
                              alignment: Alignment.centerLeft,
                              child: SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              ),
                            ),
                          )
                        : _Bubble(
                            message: _messages[i],
                            onPhrase: _play,
                            onFlag: () => _flag(_messages[i]),
                            flagTooltip: t.tutorFlagTooltip,
                          ),
                  ),
          ),
          if (_error != null && !unavailable)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              child: Text(
                _errorText(t, _error!),
                key: const Key('tutor-error'),
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ),
          if (_remaining != null && !_limitReached)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  t.tutorRemaining(_remaining!),
                  key: const Key('tutor-remaining'),
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ),
            ),
          if (!unavailable)
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 4, 12, 12),
                child: Row(
                  children: [
                    Expanded(
                      child: TextField(
                        key: const Key('tutor-input'),
                        controller: _input,
                        enabled: !_limitReached,
                        maxLength: 500,
                        maxLines: 3,
                        minLines: 1,
                        textInputAction: TextInputAction.send,
                        onSubmitted: _send,
                        decoration: InputDecoration(
                          hintText: t.tutorHint,
                          counterText: '',
                          border: const OutlineInputBorder(),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    IconButton.filled(
                      key: const Key('tutor-send'),
                      tooltip: t.tutorSend,
                      onPressed: _busy || _limitReached
                          ? null
                          : () => _send(_input.text),
                      icon: const Icon(Icons.send),
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

class _Bubble extends StatelessWidget {
  const _Bubble({
    required this.message,
    required this.onPhrase,
    required this.onFlag,
    required this.flagTooltip,
  });

  final TutorMessage message;
  final void Function(String phrase) onPhrase;
  final VoidCallback onFlag;
  final String flagTooltip;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final mine = !message.fromTutor;
    final style = Theme.of(context).textTheme.bodyLarge;
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: const EdgeInsets.all(12),
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.82,
        ),
        decoration: BoxDecoration(
          color: mine
              ? scheme.primaryContainer
              : scheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (mine)
              Text(message.text, style: style)
            else
              Text.rich(
                TextSpan(
                  style: style,
                  children: [
                    for (final part in splitReply(message.text))
                      part.german
                          ? WidgetSpan(
                              alignment: PlaceholderAlignment.middle,
                              child: InkWell(
                                key: Key('phrase-${part.text}'),
                                onTap: () => onPhrase(part.text),
                                borderRadius: BorderRadius.circular(8),
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 6,
                                    vertical: 2,
                                  ),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Icon(
                                        Icons.volume_up,
                                        size: 18,
                                        color: scheme.primary,
                                      ),
                                      const SizedBox(width: 4),
                                      Text(
                                        part.text,
                                        style: style?.copyWith(
                                          color: scheme.primary,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            )
                          : TextSpan(text: part.text),
                  ],
                ),
              ),
            if (message.fromTutor && !message.id.startsWith('local-'))
              Align(
                alignment: Alignment.centerRight,
                child: IconButton(
                  key: Key('flag-${message.id}'),
                  tooltip: flagTooltip,
                  visualDensity: VisualDensity.compact,
                  onPressed: message.flagged ? null : onFlag,
                  icon: Icon(
                    message.flagged ? Icons.flag : Icons.flag_outlined,
                    size: 20,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
