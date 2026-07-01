import SwiftUI

struct PermissionsView: View {
    @Environment(HealthKitManager.self) private var hk
    @Environment(\.dismiss)            private var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                Color.black.ignoresSafeArea()

                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        // Header
                        VStack(alignment: .leading, spacing: 10) {
                            Image(systemName: "heart.text.clipboard")
                                .font(.system(size: 38))
                                .foregroundStyle(Color(hex: "#ff3b30"))
                                .padding(.bottom, 4)

                            Text("Connect Apple Health")
                                .font(.system(size: 22, weight: .bold))
                                .foregroundStyle(.white)

                            Text("Shakthi Journal reads health data from Apple Health and syncs it to your dashboard. Your data only goes to your own account.")
                                .font(.subheadline)
                                .foregroundStyle(Color(white: 0.6))
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(.bottom, 28)

                        // READ section
                        sectionLabel("READING TODAY")
                        VStack(spacing: 1) {
                            PermRow(icon: "scalemass",         color: .blue,   label: "Body Weight")
                            PermRow(icon: "figure.stand",      color: .orange, label: "Body Fat Percentage")
                            PermRow(icon: "figure.walk",       color: .green,  label: "Steps")
                            PermRow(icon: "flame",             color: .red,    label: "Active Calories")
                            PermRow(icon: "moon.zzz",          color: .indigo, label: "Sleep")
                            PermRow(icon: "heart",             color: .red,    label: "Resting Heart Rate")
                            PermRow(icon: "waveform.path.ecg", color: .pink,   label: "Heart Rate Variability")
                        }
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .padding(.bottom, 20)

                        // WRITE section
                        sectionLabel("WRITE PERMISSION (FUTURE USE)")
                        VStack(spacing: 1) {
                            PermRow(icon: "scalemass",    color: .blue,  label: "Body Weight",       badge: "future")
                            PermRow(icon: "figure.stand", color: .orange,label: "Body Fat Percentage",badge: "future")
                            PermRow(icon: "figure.run",   color: .green, label: "Workouts",           badge: "future")
                        }
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

                        Text("Shakthi Journal will not write to Apple Health yet. Write permission is established now so a future update can log workouts and body measurements without a second permission dialog.")
                            .font(.caption)
                            .foregroundStyle(Color(white: 0.4))
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.top, 10)
                            .padding(.bottom, 28)

                        // Read-only note
                        HStack(spacing: 6) {
                            Image(systemName: "lock.fill").font(.caption).foregroundStyle(Color(white: 0.4))
                            Text("Today's sync is read-only. Data flows from Apple Health → your Shakthi dashboard.")
                                .font(.caption)
                                .foregroundStyle(Color(white: 0.4))
                        }
                        .padding(.bottom, 28)

                        // Error
                        if let error = hk.authError {
                            HStack(alignment: .top, spacing: 6) {
                                Image(systemName: "exclamationmark.circle.fill")
                                    .foregroundStyle(.red).font(.footnote)
                                Text(error)
                                    .font(.footnote)
                                    .foregroundStyle(.red)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            .padding(.bottom, 16)
                        }

                        // Allow button
                        Button {
                            Task {
                                await hk.requestAuthorization()
                                if hk.hasRequestedAuth { dismiss() }
                            }
                        } label: {
                            ZStack {
                                if hk.isRequestingAuth {
                                    ProgressView().tint(.white)
                                } else {
                                    Text("Allow Access")
                                        .fontWeight(.semibold)
                                }
                            }
                            .frame(maxWidth: .infinity)
                            .frame(height: 52)
                        }
                        .background(Color(hex: "#1a6ef5"))
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .disabled(hk.isRequestingAuth)

                        Button("Not now") { dismiss() }
                            .font(.subheadline)
                            .foregroundStyle(Color(white: 0.4))
                            .frame(maxWidth: .infinity)
                            .padding(.top, 14)
                            .padding(.bottom, 8)
                    }
                    .padding(22)
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(Color(white: 0.35))
                            .font(.title3)
                    }
                }
            }
        }
        .preferredColorScheme(.dark)
    }

    private func sectionLabel(_ text: String) -> some View {
        Text(text)
            .font(.caption)
            .fontWeight(.semibold)
            .foregroundStyle(Color(white: 0.4))
            .tracking(1)
            .padding(.bottom, 8)
    }
}

private struct PermRow: View {
    let icon: String
    let color: Color
    let label: String
    var badge: String? = nil

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(color)
                .frame(width: 30, height: 30)
                .background(color.opacity(0.15))
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))

            Text(label)
                .font(.subheadline)
                .foregroundStyle(Color(white: 0.85))

            if let badge {
                Text(badge)
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(Color(white: 0.45))
                    .padding(.horizontal, 5)
                    .padding(.vertical, 2)
                    .background(Color(white: 0.2))
                    .clipShape(Capsule())
            }

            Spacer()

            Image(systemName: badge == nil ? "eye" : "pencil")
                .font(.caption)
                .foregroundStyle(Color(white: 0.3))
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(Color(white: 0.1))
    }
}
