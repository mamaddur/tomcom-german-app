import 'package:flutter_test/flutter_test.dart';
import 'package:tomcom_german/src/app.dart';

void main() {
  testWidgets('starts in Telugu and switches to English', (tester) async {
    await tester.pumpWidget(const TomcomApp());
    await tester.pumpAndSettle();
    expect(find.text('పని కోసం జర్మన్'), findsOneWidget);

    await tester.tap(find.text('English'));
    await tester.pumpAndSettle();
    expect(find.text('German for Work'), findsOneWidget);
  });
}
