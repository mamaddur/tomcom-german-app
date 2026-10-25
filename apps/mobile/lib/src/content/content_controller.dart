import 'dart:io';

import 'package:flutter/foundation.dart';

import '../api/api_client.dart';
import '../player/audio_service.dart';
import 'pack_models.dart';
import 'pack_store.dart';

enum LevelState {
  notPublished,
  notDownloaded,
  downloading,
  installed,
  updateAvailable,
}

/// Lesson packs on this phone versus what the server offers (FR-307).
class ContentController extends ChangeNotifier {
  ContentController({
    required this.api,
    required this.store,
    required this.tempDir,
    required this.audio,
  });

  static const levels = ['A1', 'A2', 'B1'];

  final ApiClient api;
  final PackStore store;
  final Future<Directory> Function() tempDir;
  final AudioService audio;

  final Map<String, PackInfo> remote = {};
  final Map<String, LessonPack> installed = {};
  bool offline = false;
  String? downloadingLevel;
  double progress = 0;
  String? errorCode;

  /// The download in flight, so tests and callers can wait for it.
  Future<void>? currentDownload;

  LevelState stateOf(String level) {
    if (downloadingLevel == level) return LevelState.downloading;
    final have = installed[level];
    final offer = remote[level];
    if (have != null) {
      return offer != null && offer.version > have.version
          ? LevelState.updateAvailable
          : LevelState.installed;
    }
    return offer == null ? LevelState.notPublished : LevelState.notDownloaded;
  }

  Future<void> refresh() async {
    for (final level in levels) {
      final pack = await store.load(level);
      if (pack != null) installed[level] = pack;
    }
    try {
      final offers = await api.packs();
      remote
        ..clear()
        ..addEntries(offers.map((p) => MapEntry(p.level, p)));
      offline = false;
    } on ApiException catch (e) {
      // Downloaded lessons keep working without a connection (NFR-05).
      offline = e.code == 'network_error';
    }
    notifyListeners();
  }

  Future<void> download(String level) => currentDownload = _download(level);

  Future<void> _download(String level) async {
    final offer = remote[level];
    if (offer == null || downloadingLevel != null) return;
    downloadingLevel = level;
    progress = 0;
    errorCode = null;
    notifyListeners();
    final file = File(
      '${(await tempDir()).path}/pack-$level-v${offer.version}.zip',
    );
    try {
      await api.downloadPack(
        offer,
        file,
        onProgress: (received) {
          progress = offer.bytes == 0
              ? 0
              : (received / offer.bytes).clamp(0, 1).toDouble();
          notifyListeners();
        },
      );
      installed[level] = await store.install(
        level,
        offer.version,
        file,
        offer.sha256,
      );
    } on ApiException catch (e) {
      errorCode = e.code == 'network_error' ? 'download_interrupted' : e.code;
    } on PackInstallException {
      errorCode = 'pack_damaged';
    } finally {
      if (await file.exists()) await file.delete();
      downloadingLevel = null;
      notifyListeners();
    }
  }
}
