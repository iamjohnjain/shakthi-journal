import SwiftUI

/// Native-visible states layered on top of the WKWebView — the whole point
/// is that there is never a blank/black WebView with nothing explaining
/// what's happening. `blockedNavigation` is intentionally a transient
/// banner rather than a full takeover: a blocked navigation means the real
/// web content is still intact underneath (the navigation was cancelled
/// before it replaced anything), so covering it with a full-screen error
/// would be actively misleading.
enum WebBoundaryState: Equatable {
    case loading
    case ready
    case offline
    case serverError
    case blockedNavigation
    case sessionExpired
    case processTerminated
}

/// Full-screen takeover for every state except `.ready` and the transient
/// `.blockedNavigation` banner (rendered separately, see
/// `BlockedNavigationBanner`). Never shows a raw URL, an exception
/// description, or anything else that could leak a sensitive query
/// parameter — just a short, honest, native-looking message and a retry
/// action that only ever reloads the trusted root origin.
struct WebBoundaryOverlay: View {
    let state: WebBoundaryState
    let onRetry: () -> Void

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            VStack(spacing: 16) {
                switch state {
                case .loading:
                    ProgressView().tint(.white).scaleEffect(1.2)
                case .offline:
                    icon("wifi.slash")
                    Text("You're offline").font(.headline).foregroundStyle(.white)
                    Text("Check your connection and try again.").font(.subheadline).foregroundStyle(.gray)
                    retryButton
                case .serverError:
                    icon("exclamationmark.triangle")
                    Text("Jeevan couldn't load").font(.headline).foregroundStyle(.white)
                    Text("Something went wrong reaching the app. Please try again.").font(.subheadline).foregroundStyle(.gray)
                    retryButton
                case .sessionExpired:
                    icon("lock.rotation")
                    Text("Your session expired").font(.headline).foregroundStyle(.white)
                    Text("Please sign in again.").font(.subheadline).foregroundStyle(.gray)
                    retryButton
                case .processTerminated:
                    icon("arrow.clockwise")
                    Text("Jeevan needs to reload").font(.headline).foregroundStyle(.white)
                    Text("The app's content view stopped unexpectedly.").font(.subheadline).foregroundStyle(.gray)
                    retryButton
                case .ready, .blockedNavigation:
                    EmptyView()
                }
            }
            .padding(32)
        }
    }

    private func icon(_ name: String) -> some View {
        Image(systemName: name).font(.system(size: 40)).foregroundStyle(.white)
    }

    private var retryButton: some View {
        Button(action: onRetry) {
            Text("Retry")
                .fontWeight(.semibold)
                .padding(.horizontal, 24)
                .padding(.vertical, 10)
                .background(Color.white.opacity(0.15))
                .foregroundStyle(.white)
                .clipShape(Capsule())
        }
    }
}

/// A brief, dismissing-on-its-own banner for a cancelled cross-origin
/// navigation — the underlying page is untouched, so this never blocks
/// interaction with it.
struct BlockedNavigationBanner: View {
    var body: some View {
        Text("That link doesn't belong to Jeevan — opening it was blocked.")
            .font(.footnote)
            .foregroundStyle(.white)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(Color.black.opacity(0.85))
            .clipShape(Capsule())
            .padding(.top, 8)
    }
}
