import 'dart:io';

import 'package:just_audio/just_audio.dart';

/// Plays the pack's native-speaker recordings (FR-302, FR-304). An interface so tests and
/// machines without sound can use a fake.
abstract class AudioService {
  Future<void> play(File file, {required double speed});
  Future<void> stop();
  Future<void> dispose();
}

class JustAudioService implements AudioService {
  final _player = AudioPlayer();

  @override
  Future<void> play(File file, {required double speed}) async {
    await _player.stop();
    await _player.setFilePath(file.path);
    await _player.setSpeed(speed);
    await _player.play();
  }

  @override
  Future<void> stop() => _player.stop();

  @override
  Future<void> dispose() => _player.dispose();
}
