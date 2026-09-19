import SwiftUI

struct LoginView: View {
    @Environment(AppModel.self) private var model
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            Text("Soma").font(.system(size: 44, weight: .regular, design: .serif))
            VStack(alignment: .leading, spacing: 8) {
                Text("Email").font(.caption).foregroundStyle(SomaTheme.secondary)
                TextField("nom@exemple.com", text: $email).textContentType(.emailAddress)
                Text("Mot de passe").font(.caption).foregroundStyle(SomaTheme.secondary)
                SecureField("Mot de passe", text: $password).textContentType(.password)
            }
            .textFieldStyle(.roundedBorder)
            Button("Se connecter") { Task { await model.login(email: email, password: password) } }
                .buttonStyle(.borderedProminent)
                .disabled(email.isEmpty || password.isEmpty || model.isLoading)
                .frame(minHeight: 44)
            if model.isLoading { ProgressView().accessibilityLabel("Connexion en cours") }
        }
        .frame(maxWidth: 420)
        .padding(32)
    }
}
