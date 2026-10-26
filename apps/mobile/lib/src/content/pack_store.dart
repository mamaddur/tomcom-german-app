import 'dart:convert';
import 'dart:io';

import 'package:archive/archive.dart';
import 'package:crypto/crypto.dart';

import 'pack_models.dart';

/// Why an installation was refused. The installed version is left untouched in every case.
class PackInstallException implements Exception {
  PackInstallException(this.code);
  final String code;
  @override
  String toString() => 'PackInstallException($code)';
}

/// Installed lesson packs on the phone (FR-307, NFR-05). Layout:
/// `ROOT/packs/LEVEL/vVERSION/` holds `manifest.json`, `audio/…`, `images/…`;
/// `ROOT/packs/LEVEL/current` holds the installed version number.
class PackStore {
  PackStore(this._root);

  final Future<Directory> Function() _root;
  final _cache = <String, LessonPack>{};

  Future<Directory> _levelDir(String level) async =>
      Directory('${(await _root()).path}/packs/$level');

  /// Installed version per level, remembered after the first read or an install, so each
  /// audio tap does not touch the disk.
  final _versions = <String, int?>{};

  /// The installed version of a level, or null.
  Future<int?> installedVersion(String level) async {
    if (_versions.containsKey(level)) return _versions[level];
    final f = File('${(await _levelDir(level)).path}/current');
    final version = await f.exists()
        ? int.tryParse((await f.readAsString()).trim())
        : null;
    return _versions[level] = version;
  }

  Future<LessonPack?> load(String level) async {
    final version = await installedVersion(level);
    if (version == null) return null;
    final key = '$level/$version';
    if (_cache[key] != null) return _cache[key];
    final manifest = File(
      '${(await _levelDir(level)).path}/v$version/manifest.json',
    );
    final pack = LessonPack.fromJson(
      jsonDecode(await manifest.readAsString()) as Map<String, dynamic>,
    );
    return _cache[key] = pack;
  }

  /// The file for a media id in the installed pack, for the audio player and images.
  Future<File?> mediaFile(String level, String mediaId) async {
    final pack = await load(level);
    final ref = pack?.media[mediaId];
    if (pack == null || ref == null) return null;
    return File(
      '${(await _levelDir(level)).path}/v${pack.version}/${ref.path}',
    );
  }

  /// Verifies and installs a downloaded pack zip, then removes older versions.
  /// Checks: the zip's SHA-256; every media file's SHA-256 from the manifest; and only
  /// `manifest.json` plus the manifest's own media paths are extracted (no `..`, no absolute
  /// paths: a tampered zip cannot write outside its folder).
  Future<LessonPack> install(
    String level,
    int version,
    File zip,
    String expectedSha256,
  ) async {
    final bytes = await zip.readAsBytes();
    if (sha256.convert(bytes).toString() != expectedSha256) {
      throw PackInstallException('checksum_mismatch');
    }

    final archive = ZipDecoder().decodeBytes(bytes);
    final manifestFile = archive.findFile('manifest.json');
    if (manifestFile == null) throw PackInstallException('manifest_missing');
    final manifestJson = utf8.decode(manifestFile.content as List<int>);
    final pack = LessonPack.fromJson(
      jsonDecode(manifestJson) as Map<String, dynamic>,
    );
    if (pack.level != level || pack.version != version) {
      throw PackInstallException('wrong_pack');
    }

    final levelDir = await _levelDir(level);
    final staging = Directory('${levelDir.path}/.staging-v$version');
    if (await staging.exists()) await staging.delete(recursive: true);
    await staging.create(recursive: true);
    try {
      await File('${staging.path}/manifest.json').writeAsString(manifestJson);
      for (final ref in pack.media.values) {
        if (!_safePath(ref.path)) throw PackInstallException('unsafe_path');
        final entry = archive.findFile(ref.path);
        if (entry == null) throw PackInstallException('media_missing');
        final data = entry.content as List<int>;
        if (sha256.convert(data).toString() != ref.sha256) {
          throw PackInstallException('media_checksum_mismatch');
        }
        final out = File('${staging.path}/${ref.path}');
        await out.parent.create(recursive: true);
        await out.writeAsBytes(data, flush: true);
      }
      final target = Directory('${levelDir.path}/v$version');
      if (await target.exists()) await target.delete(recursive: true);
      await staging.rename(target.path);
      await File('${levelDir.path}/current')
          .writeAsString('$version', flush: true);
    } catch (_) {
      if (await staging.exists()) await staging.delete(recursive: true);
      rethrow;
    }
    // Older versions are removed only after the new one is in place.
    await for (final e in levelDir.list()) {
      final name = e.uri.pathSegments.where((s) => s.isNotEmpty).last;
      if (e is Directory && name.startsWith('v') && name != 'v$version') {
        await e.delete(recursive: true);
      }
    }
    _cache.removeWhere((k, _) => k.startsWith('$level/'));
    _cache['$level/$version'] = pack;
    _versions[level] = version;
    return pack;
  }

  static bool _safePath(String path) =>
      RegExp(r'^(audio|images|video)/[\w.-]+$').hasMatch(path) &&
      !path.contains('..');
}
