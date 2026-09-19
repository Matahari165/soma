import SwiftUI

struct LoginView: View {
    @Environment(AppModel.self) private var model
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            Text("Soma").font(.system(size: 44, weight: .regular, design: .serif))
            Button {
                Task { await model.loginWithGoogle() }
            } label: {
                Text("Continuer avec Google").frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .controlSize(.large)
            .disabled(model.isLoading)
            .frame(minHeight: 44)

            HStack(spacing: 12) {
                Rectangle().fill(SomaTheme.rule).frame(height: 1)
                Text("ou")
                    .font(.caption)
                    .foregroundStyle(SomaTheme.secondary)
                    .accessibilityHidden(true)
                Rectangle().fill(SomaTheme.rule).frame(height: 1)
            }
            VStack(alignment: .leading, spacing: 8) {
                Text("Email").font(.caption).foregroundStyle(SomaTheme.secondary)
                TextField("nom@exemple.com", text: $email).textContentType(.emailAddress)
                Text("Mot de passe").font(.caption).foregroundStyle(SomaTheme.secondary)
                SecureField("Mot de passe", text: $password).textContentType(.password)
            }
            .textFieldStyle(.roundedBorder)
            Button {
                Task { await model.login(email: email, password: password) }
            } label: {
                Text("Se connecter").frame(maxWidth: .infinity)
            }
                .buttonStyle(SomaPrimaryButtonStyle())
                .disabled(email.isEmpty || password.isEmpty || model.isLoading)
                .frame(minHeight: 44)
            if model.isLoading { ProgressView().accessibilityLabel("Connexion en cours") }
        }
        .frame(maxWidth: 420)
        .padding(32)
    }
}
