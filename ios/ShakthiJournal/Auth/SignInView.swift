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
            Color.black.ignoresSafeArea()

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
                        footerNote
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
            Text("S")
                .font(.system(size: 40, weight: .bold, design: .rounded))
                .foregroundStyle(.white)
                .frame(width: 76, height: 76)
                .background(Color(hex: "#1a6ef5"))
                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))

            Text("Shakthi Journal")
                .font(.system(size: 26, weight: .bold))
                .foregroundStyle(.white)

            Text(mode == .signIn
                 ? "Sign in to sync Apple Health data\nto your dashboard"
                 : "Create an account to start syncing\nyour health data")
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
                .background(selected ? Color(hex: "#1a6ef5") : Color.clear)
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
        .background(canSubmit ? Color(hex: "#1a6ef5") : Color(white: 0.2))
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
                .foregroundStyle(Color(hex: "#1a6ef5"))

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
            .foregroundStyle(Color(hex: "#1a6ef5"))

            Spacer()
        }
        .padding(28)
    }

    // MARK: - Footer

    private var footerNote: some View {
        Text(mode == .signIn
             ? "Use the same email and password as the\nShakthi Journal web app."
             : "Your account works on both the iOS app\nand the Shakthi Journal web dashboard.")
            .font(.caption)
            .foregroundStyle(Color(white: 0.35))
            .multilineTextAlignment(.center)
            .padding(.horizontal, 40)
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
}
