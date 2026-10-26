import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tomcom_german/l10n/app_localizations.dart';
import 'package:tomcom_german/src/api/api_client.dart';
import 'package:tomcom_german/src/content/content_controller.dart';
import 'package:tomcom_german/src/content/levels_screen.dart';
import 'package:tomcom_german/src/content/pack_store.dart';
import 'package:tomcom_german/src/session/session_store.dart';

import 'fake_api.dart';
import 'fake_audio.dart';
import 'pack_fixtures.dart';

void main() {
  late Directory root;
  late FakeApi fake;
  late ContentController content;

  setUp(() async {
    // Sync file calls: async ones never complete inside a widget test's fake clock.
    root = Directory.systemTemp.createTempSync('levels-');
    fake = FakeApi();
    final store = MemorySessionStore();
    await store.write(SessionStore.accessTokenKey, 'access-1');
    await store.write(
      SessionStore.refreshTokenKey,
      'refresh-token-1-xxxxxxxxxxxx',
    );
    final api = ApiClient(
      baseUrl: 'http://api.test',
      store: store,
      httpClient: fake.client,
    );
    content = ContentController(
      api: api,
      store: PackStore(() async => root),
      tempDir: () async => root,
      audio: FakeAudio(),
    );
  });
  tearDown(() => root.deleteSync(recursive: true));

  Future<void> pump(WidgetTester tester) async {
    await tester.pumpWidget(
      MaterialApp(
        locale: const Locale('te'),
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        home: LevelsScreen(content: content),
      ),
    );
    // Real file and network work runs outside the fake clock.
    await tester.runAsync(() => content.refresh());
    await tester.pumpAndSettle();
  }

  /// Taps "Download" in the dialog outside the fake clock, so the real file work can finish.
  Future<void> confirmDownload(WidgetTester tester) async {
    await tester.runAsync(() async {
      await tester.tap(
        find.widgetWithText(FilledButton, 'డౌన్‌లోడ్ చేయండి').last,
      );
      await content.currentDownload;
    });
  }

  testWidgets(
    'asks before downloading, installs the pack and lists its lessons in Telugu',
    (tester) async {
      final p = buildPackZip();
      fake.packs['A1'] = (version: 1, zip: p.zip, sha256: p.sha256, lessons: 1);
      await pump(tester);

      expect(
        find.text('ఇంకా అందుబాటులో లేదు'),
        findsNWidgets(2),
      ); // A2 and B1 not published
      await tester.tap(find.text('డౌన్‌లోడ్ చేయండి'));
      await tester.pumpAndSettle();
      expect(
        find.textContaining('Wi-Fi'),
        findsOneWidget,
      ); // data-use warning before downloading
      await confirmDownload(tester);
      await tester.pumpAndSettle();

      expect(
        find.text('డౌన్‌లోడ్ అయింది · ఇంటర్నెట్ లేకుండా పనిచేస్తుంది'),
        findsOneWidget,
      );
      expect(find.text('పలకరింపులు'), findsOneWidget);
      expect(fake.routes, contains('GET /v1/packs/A1/1/download'));
    },
  );

  testWidgets('a damaged download is not installed and the learner is told', (
    tester,
  ) async {
    final p = buildPackZip();
    fake.packs['A1'] = (version: 1, zip: p.zip, sha256: '0' * 64, lessons: 1);
    await pump(tester);
    await tester.tap(find.text('డౌన్‌లోడ్ చేయండి'));
    await tester.pumpAndSettle();
    await confirmDownload(tester);
    await tester.pumpAndSettle();
    expect(
      find.text(
        'డౌన్‌లోడ్ పాడైంది, అందుకే ఇన్‌స్టాల్ చేయలేదు. మళ్ళీ ప్రయత్నించండి.',
      ),
      findsOneWidget,
    );
    expect(content.installed, isEmpty);
  });

  testWidgets('shows an update when the server has a newer version', (
    tester,
  ) async {
    final v1 = buildPackZip();
    await tester.runAsync(
      () => PackStore(() async => root).install(
        'A1',
        1,
        File('${root.path}/v1.zip')..writeAsBytesSync(v1.zip),
        v1.sha256,
      ),
    );
    final v2 = buildPackZip(version: 2);
    fake.packs['A1'] = (version: 2, zip: v2.zip, sha256: v2.sha256, lessons: 1);
    await pump(tester);
    expect(
      find.textContaining('కొత్త పాఠాలు అందుబాటులో ఉన్నాయి'),
      findsOneWidget,
    );
  });
}
