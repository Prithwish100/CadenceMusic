import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:cadence_flutter/main.dart';
import 'package:cadence_flutter/data/curated_catalog.dart';

void main() {
  testWidgets('Cadence Flutter renders Home screen and MiniPlayerBar',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: CadenceFlutterApp(),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Cadence'), findsWidgets);
    expect(find.text(featuredTrack.title), findsWidgets);
    expect(find.text('Made For You'), findsOneWidget);
  });
}
