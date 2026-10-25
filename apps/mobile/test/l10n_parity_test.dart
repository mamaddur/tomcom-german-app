import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// NFR-16: every ARB file has every message key from the English template, none empty.
void main() {
  final dir = Directory('lib/l10n');
  Map<String, dynamic> load(File f) =>
      jsonDecode(f.readAsStringSync()) as Map<String, dynamic>;
  Set<String> messageKeys(Map<String, dynamic> arb) =>
      arb.keys.where((k) => !k.startsWith('@')).toSet();

  final template = load(File('lib/l10n/app_en.arb'));
  final arbs = dir.listSync().whereType<File>().where(
    (f) => f.path.endsWith('.arb'),
  );

  test('Telugu and English ARB files exist', () {
    expect(
      arbs.map((f) => f.uri.pathSegments.last).toSet(),
      containsAll(['app_en.arb', 'app_te.arb']),
    );
  });

  for (final file in arbs) {
    test('${file.uri.pathSegments.last} matches the template keys', () {
      final arb = load(file);
      expect(messageKeys(arb), messageKeys(template));
      for (final key in messageKeys(arb)) {
        expect((arb[key] as String).trim(), isNotEmpty, reason: key);
      }
    });
  }
}
