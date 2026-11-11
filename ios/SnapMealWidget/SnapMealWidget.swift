import WidgetKit
import SwiftUI

// ─── Setup ──────────────────────────────────────────────────────────────────
//
// This file is ready to use — it just needs a home. In Xcode:
//
//   1. File → New → Target… → Widget Extension
//      - Product Name: SnapMealWidget
//      - Uncheck "Include Configuration Intent" (this widget has no settings)
//      - Team: same as the main app (should default to it)
//      - When asked to "Activate" the new scheme, choose Activate
//   2. Xcode creates a SnapMealWidget folder with its own template .swift file
//      and Info.plist. Delete its generated .swift file and drag this file
//      (ios/SnapMealWidget/SnapMealWidget.swift) into that new group instead
//      — make sure "SnapMealWidget" is checked under Target Membership in
//      the File Inspector (right-hand panel) when you add it.
//   3. Build the SnapMealWidget scheme once (⌘B) to confirm it compiles.
//   4. Build/run the main ShakthiJournal scheme, then long-press the Home
//      Screen → + → search "Jeevan" → add the "Snap Meal" widget.
//
// Nothing else needs touching — the main app's DeepLinkManager (already
// wired in) is what receives the tap and opens straight to the camera.

// ─── Timeline ───────────────────────────────────────────────────────────────
//
// Fully static — there's no per-minute content to refresh, just a tap
// target — so a single entry with `.never` as the reload policy is correct
// and avoids burning the widget's limited daily refresh budget on nothing.

struct SnapMealEntry: TimelineEntry {
    let date: Date
}

struct SnapMealProvider: TimelineProvider {
    func placeholder(in context: Context) -> SnapMealEntry {
        SnapMealEntry(date: Date())
    }

    func getSnapshot(in context: Context, completion: @escaping (SnapMealEntry) -> Void) {
        completion(SnapMealEntry(date: Date()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SnapMealEntry>) -> Void) {
        let timeline = Timeline(entries: [SnapMealEntry(date: Date())], policy: .never)
        completion(timeline)
    }
}

// ─── View ───────────────────────────────────────────────────────────────────

struct SnapMealWidgetView: View {
    var body: some View {
        ZStack {
            ContainerRelativeShape()
                .fill(
                    LinearGradient(
                        colors: [SnapMealColor(hex: "#0A84FF"), SnapMealColor(hex: "#0059C9")],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
            VStack(spacing: 8) {
                Image(systemName: "camera.fill")
                    .font(.system(size: 26, weight: .semibold))
                    .foregroundStyle(.white)
                Text("Snap Meal")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(.white)
            }
        }
        // Tapping anywhere on the widget opens this URL — the main app's
        // .onOpenURL (see ShakthiJournalApp.swift) catches it and routes
        // straight to the meal camera. Works on every widget family/iOS
        // version WidgetKit supports, no App Intents setup needed.
        .widgetURL(URL(string: "jeevan.health.fitness://snap-meal"))
    }
}

// ─── Widget ─────────────────────────────────────────────────────────────────

struct SnapMealWidget: Widget {
    let kind: String = "SnapMealWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SnapMealProvider()) { _ in
            SnapMealWidgetView()
                .containerBackground(for: .widget) { Color.clear }
        }
        .configurationDisplayName("Snap Meal")
        .description("One tap to open the camera and log a meal.")
        .supportedFamilies([.systemSmall])
    }
}

// ─── Extension entry point ──────────────────────────────────────────────────
//
// A widget extension needs exactly one @main — if Xcode's wizard already
// generated one in its template file, delete that file (per the setup note
// above) rather than keeping two.

@main
struct SnapMealWidgetBundle: WidgetBundle {
    var body: some Widget {
        SnapMealWidget()
    }
}

// ─── Local color helper ─────────────────────────────────────────────────────
//
// Widget extensions are a separate compile target from the main app, so they
// can't reach the main target's `Color(hex:)` (in Auth/SignInView.swift)
// unless that file's Target Membership is also checked for this extension.
// Kept as a distinctly-named local copy instead, to avoid a redeclaration
// error if you later do share it.

private func SnapMealColor(hex: String) -> Color {
    let h = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
    var rgb: UInt64 = 0
    Scanner(string: h).scanHexInt64(&rgb)
    let r = Double((rgb >> 16) & 0xFF) / 255
    let g = Double((rgb >> 8)  & 0xFF) / 255
    let b = Double(rgb         & 0xFF) / 255
    return Color(red: r, green: g, blue: b)
}
