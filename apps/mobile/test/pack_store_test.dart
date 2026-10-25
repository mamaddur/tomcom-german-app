import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:tomcom_german/src/content/pack_store.dart';

import 'pack_fixtures.dart';

void main() {
  late Directory root;
  late PackStore store;

  setUp(() async {
    root = await Directory.systemTemp.createTemp('packs-');
    store = PackStore(() async => root);
  });
  tearDown(() => root.delete(recursive: true));

  Future<File> write(List<int> bytes) async =>
      File('${root.path}/download.zip')..writeAsBytesSync(bytes);

  test('installs a verified pack and reads it offline', () async {
    final p = buildPackZip();
    final pack = await store.install('A1', 1, await write(p.zip), p.sha256);
    expect(pack.lessons.single.title.of('te'), 'పలకరింపులు');
    expect(await store.installedVersion('A1'), 1);
    final audio = await store.mediaFile(
      'A1',
      '00000000-0000-4000-8000-000000000101',
    );
    expect(await audio!.exists(), isTrue);
    expect(
      (await store.load('A1'))!.lessons.single.screens.single.id,
      '00000000-0000-4000-8000-000000000011',
    );
  });

  test('rejects a zip whose checksum does not match the server', () async {
    final p = buildPackZip();
    expect(
      () async => store.install('A1', 1, await write(p.zip), 'f' * 64),
      throwsA(
        isA<PackInstallException>().having(
          (e) => e.code,
          'code',
          'checksum_mismatch',
        ),
      ),
    );
  });

  test('rejects a pack whose audio was altered', () async {
    final p = buildPackZip(declaredAudioSha: '0' * 64);
    await expectLater(
      store.install('A1', 1, await write(p.zip), p.sha256),
      throwsA(
        isA<PackInstallException>().having(
          (e) => e.code,
          'code',
          'media_checksum_mismatch',
        ),
      ),
    );
    expect(await store.installedVersion('A1'), isNull);
  });

  test(
    'refuses paths that would write outside the pack folder (zip slip)',
    () async {
      final p = buildPackZip(mediaPath: 'audio/../../../evil.opus');
      await expectLater(
        store.install('A1', 1, await write(p.zip), p.sha256),
        throwsA(
          isA<PackInstallException>().having(
            (e) => e.code,
            'code',
            'unsafe_path',
          ),
        ),
      );
      expect(await File('${root.path}/evil.opus').exists(), isFalse);
    },
  );

  test(
    'replaces an older version only once the new one is fully installed',
    () async {
      final v1 = buildPackZip();
      await store.install('A1', 1, await write(v1.zip), v1.sha256);

      final broken = buildPackZip(version: 2, declaredAudioSha: '0' * 64);
      await expectLater(
        store.install('A1', 2, await write(broken.zip), broken.sha256),
        throwsA(isA<PackInstallException>()),
      );
      expect(
        await store.installedVersion('A1'),
        1,
        reason: 'a failed update keeps the working version',
      );

      final v2 = buildPackZip(version: 2, title: 'Greetings v2');
      await store.install('A1', 2, await write(v2.zip), v2.sha256);
      expect(
        (await store.load('A1'))!.lessons.single.title.of('en'),
        'Greetings v2',
      );
      expect(await Directory('${root.path}/packs/A1/v1').exists(), isFalse);
    },
  );
}
