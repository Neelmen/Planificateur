// --- auth.js ---

/**
 * Gère la connexion avec la logique (pseudo)@planning.com
 */
async function handleLogin() {
    const pseudo = document.getElementById('username').value.trim().toLowerCase();
    const pass = document.getElementById('password').value;
    const errorEl = document.getElementById('error-msg');

    // Reconstruction de l'email factice
    const fakeEmail = `${pseudo}@planning.com`;

    // Appel à la méthode d'authentification officielle de Supabase
    const { data, error } = await _supabase.auth.signInWithPassword({
        email: fakeEmail,
        password: pass,
    });

    if (error) {
        console.error("Erreur Auth:", error.message);
        errorEl.innerText = "Pseudo ou mot de passe incorrect";
        return;
    }

    // Si la connexion réussit
    if (data.user) {
        state.user = data.user; // Stockage de l'utilisateur dans l'état global[cite: 9]
        initApp(pseudo); // Lancement de l'application
    }
}

/**
 * Déconnexion officielle
 */
async function logout() {
    await _supabase.auth.signOut();
    location.reload();
}