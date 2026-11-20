import SwiftUI

struct SignInView: View {
    @Environment(AuthManager.self) private var auth

    enum Mode { case signIn, createAccount }

    @State private var mode: Mode = .signIn
    @State private var email = ""
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var showPassword = false

    var body: some View {
        ZStack {
            dashboardBackground

            if auth.emailConfirmationPending {
                confirmationPendingView
            } else {
                ScrollView {
                    VStack(spacing: 0) {
                        Spacer().frame(height: 60)
                        header
                        Spacer().frame(height: 32)
                        modePicker
                        Spacer().frame(height: 28)
                        form
                        Spacer().frame(height: 40)
                    }
                }
            }
        }
        .preferredColorScheme(.dark)
        .animation(.easeInOut(duration: 0.2), value: mode)
    }

    // MARK: - Header

    private var header: some View {
        VStack(spacing: 14) {
            Image("AppLogo")
                .resizable()
                .aspectRatio(contentMode: .fill)
                .frame(width: 76, height: 76)
                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))

            Text("Jeevan")
                .font(.system(size: 26, weight: .bold))
                .foregroundStyle(.white)

            Text(mode == .signIn
                 ? "Sign in to your Jeevan health\nand fitness app"
                 : "Create an account to start\ntracking your health data")
                .font(.subheadline)
                .foregroundStyle(Color(white: 0.55))
                .multilineTextAlignment(.center)
        }
    }

    // MARK: - Mode picker

    private var modePicker: some View {
        HStack(spacing: 0) {
            modeTab("Sign In",       selected: mode == .signIn)       { mode = .signIn }
            modeTab("Create Account", selected: mode == .createAccount) { mode = .createAccount }
        }
        .background(Color(white: 0.1))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .padding(.horizontal, 28)
    }

    private func modeTab(_ title: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.subheadline)
                .fontWeight(selected ? .semibold : .regular)
                .foregroundStyle(selected ? .white : Color(white: 0.45))
                .frame(maxWidth: .infinity)
                .frame(height: 42)
                .background(selected ? AnyShapeStyle(LinearGradient.brand) : AnyShapeStyle(Color.clear))
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
        .padding(3)
    }

    // MARK: - Form

    private var form: some View {
        VStack(spacing: 14) {
            TextField("Email", text: $email)
                .textInputAutocapitalization(.never)
                .keyboardType(.emailAddress)
                .autocorrectionDisabled()
                .fieldStyle()

            passwordField(placeholder: mode == .createAccount ? "Password (min 6 characters)" : "Password",
                          binding: $password)

            if mode == .createAccount {
                passwordField(placeholder: "Confirm Password", binding: $confirmPassword)
            }

            errorView

            actionButton
        }
        .padding(.horizontal, 28)
    }

    private func passwordField(placeholder: String, binding: Binding<String>) -> some View {
        HStack {
            Group {
                if showPassword {
                    TextField(placeholder, text: binding).autocorrectionDisabled()
                } else {
                    SecureField(placeholder, text: binding)
                }
            }
            Button {
                showPassword.toggle()
            } label: {
                Image(systemName: showPassword ? "eye.slash" : "eye")
                    .foregroundStyle(Color(white: 0.45))
                    .frame(width: 32, height: 32)
            }
        }
        .fieldStyle()
    }

    @ViewBuilder
    private var errorView: some View {
        let error = mode == .signIn ? auth.signInError : auth.signUpError
        if let error {
            HStack(alignment: .top, spacing: 6) {
                Image(systemName: "exclamationmark.circle.fill")
                    .foregroundStyle(.red).font(.footnote)
                Text(error)
                    .font(.footnote).foregroundStyle(.red)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 4)
        }

        if mode == .createAccount && !confirmPassword.isEmpty && confirmPassword != password {
            HStack(alignment: .top, spacing: 6) {
                Image(systemName: "exclamationmark.circle.fill")
                    .foregroundStyle(.orange).font(.footnote)
                Text("Passwords don't match.")
                    .font(.footnote).foregroundStyle(.orange)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 4)
        }
    }

    private var actionButton: some View {
        Button {
            Task {
                if mode == .signIn {
                    await auth.signIn(email: email, password: password)
                } else {
                    await auth.signUp(email: email, password: password)
                }
            }
        } label: {
            ZStack {
                if isLoading {
                    ProgressView().tint(.white)
                } else {
                    Text(mode == .signIn ? "Sign In" : "Create Account")
                        .fontWeight(.semibold)
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 50)
        }
        .background(canSubmit ? AnyShapeStyle(LinearGradient.brand) : AnyShapeStyle(Color(white: 0.2)))
        .foregroundStyle(.white)
        .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
        .disabled(!canSubmit)
        .animation(.easeInOut(duration: 0.15), value: canSubmit)
    }

    // MARK: - Email confirmation pending

    private var confirmationPendingView: some View {
        VStack(spacing: 24) {
            Spacer()

            Image(systemName: "envelope.badge.fill")
                .font(.system(size: 52))
                .foregroundStyle(Color.brandAccent)

            VStack(spacing: 10) {
                Text("Check your email")
                    .font(.title2).fontWeight(.bold).foregroundStyle(.white)
                Text("We sent a confirmation link to\n\(email)")
                    .font(.subheadline)
                    .foregroundStyle(Color(white: 0.55))
                    .multilineTextAlignment(.center)
            }

            Text("After confirming, come back here and sign in.")
                .font(.footnote)
                .foregroundStyle(Color(white: 0.4))
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)

            Button("Back to Sign In") {
                auth.emailConfirmationPending = false
                mode = .signIn
                password = ""
                confirmPassword = ""
            }
            .font(.subheadline).fontWeight(.semibold)
            .foregroundStyle(Color.brandAccent)

            Spacer()
        }
        .padding(28)
    }

    // MARK: - Background

    /// Mirrors the web dashboard's --bg-gradient (globals.css): a dark
    /// vertical base with four soft radial glows (orange top-left, blue
    /// top-right, purple center, teal bottom) — this screen used to be flat
    /// black, which didn't match the rest of the app at all.
    private var dashboardBackground: some View {
        ZStack {
            LinearGradient(
                colors: [Color(hex: "#181220"), Color(hex: "#0E0C13"), Color(hex: "#06050A")],
                startPoint: .top, endPoint: .bottom
            )
            GeometryReader { geo in
                Circle().fill(Color(hex: "#FB8A4C").opacity(0.16))
                    .frame(width: geo.size.width * 1.3, height: geo.size.height * 0.55)
                    .position(x: geo.size.width * 0.1, y: 0)
                    .blur(radius: 80)
                Circle().fill(Color(hex: "#5B7FFF").opacity(0.18))
                    .frame(width: geo.size.width * 1.3, height: geo.size.height * 0.65)
                    .position(x: geo.size.width * 0.92, y: 0)
                    .blur(radius: 80)
                Circle().fill(Color(hex: "#A66BF5").opacity(0.09))
                    .frame(width: geo.size.width * 0.9, height: geo.size.height * 0.5)
                    .position(x: geo.size.width * 0.5, y: geo.size.height * 0.38)
                    .blur(radius: 90)
                Circle().fill(Color(hex: "#2DD4BF").opacity(0.1))
                    .frame(width: geo.size.width, height: geo.size.height * 0.55)
                    .position(x: geo.size.width * 0.5, y: geo.size.height)
                    .blur(radius: 90)
            }
        }
        .ignoresSafeArea()
    }

    // MARK: - Helpers

    private var isLoading: Bool {
        mode == .signIn ? auth.isSigningIn : auth.isSigningUp
    }

    private var canSubmit: Bool {
        guard !isLoading, !email.isEmpty, password.count >= 6 else { return false }
        if mode == .createAccount { return password == confirmPassword }
        return true
    }
}

// MARK: - Shared modifier

private extension View {
    func fieldStyle() -> some View {
        self
            .padding(14)
            .background(Color(white: 0.11))
            .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
            .foregroundStyle(.white)
    }
}

// MARK: - Hex color

extension Color {
    init(hex: String) {
        let h = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        var rgb: UInt64 = 0
        Scanner(string: h).scanHexInt64(&rgb)
        let r = Double((rgb >> 16) & 0xFF) / 255
        let g = Double((rgb >> 8)  & 0xFF) / 255
        let b = Double(rgb         & 0xFF) / 255
        self.init(red: r, green: g, blue: b)
    }

    /// The app's single flat accent — used anywhere a gradient doesn't fit
    /// (inline text links, small icon tints). Mirrors the web app's --orange.
    static let brandAccent = Color(hex: "#FB7A3C")
}

// MARK: - Brand gradient

/// Mirrors the web app's --gradient-brand (orange → purple → blue), used for
/// primary buttons and other large fills across the native screens.
extension LinearGradient {
    static let brand = LinearGradient(
        colors: [Color(hex: "#FB8A4C"), Color(hex: "#A66BF5"), Color(hex: "#5B7FFF")],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
}
