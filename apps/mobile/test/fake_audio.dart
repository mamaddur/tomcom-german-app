import 'dart:io';

import 'package:tomcom_german/src/player/audio_service.dart';

/// Records what would have been played (no sound device in tests).
class FakeAudio implements AudioService {
  final played = <({String path, double speed})>[];
  int stops = 0;

  @override
  Future<void> play(File file, {required double speed}) async =>
      played.add((path: file.path, speed: speed));

  @override
  Future<void> stop() async => stops++;

  @override
  Future<void> dispose() async {}
}
