// --- auth.js ---
let loginAttempts = 0;
let isLocked = false;
/**
 * Gère la connexion avec la logique (pseudo)@planning.com
 */
async function handleLogin() {
    const errorEl = document.getElementById('error-msg');

    // 1. Vérification du verrouillage
    if (isLocked) return;

    // 2. Vérification de la connexion internet
    if (!window.navigator.onLine) {
        errorEl.innerText = "Aucune connexion internet";
        return;
    }

    const pseudo = document.getElementById('username').value.trim().toLowerCase();
    const pass = document.getElementById('password').value;
    const fakeEmail = `${pseudo}@planning.com`;

    const { data, error } = await _supabase.auth.signInWithPassword({
        email: fakeEmail,
        password: pass,
    });

    if (error) {
        loginAttempts++;

        // 3. Gestion du blocage après 5 tentatives
        if (loginAttempts >= 5) {
            startLoginLockout(errorEl);
            return;
        }

        // 4. Message d'erreur classique
        console.error("Erreur Auth:", error.message);
        errorEl.innerText = "Identifiant ou Mot de passe incorrect";
        return;
    }

    if (data.user) {
        loginAttempts = 0; // Reset si succès
        state.user = data.user;
        initApp(pseudo);
    }
}
// compte à rebours
function startLoginLockout(errorEl) {
    isLocked = true;
    let timeLeft = 5;
    const btn = document.getElementById('btn-login');

    btn.disabled = true; // Désactive le bouton physiquement

    const timer = setInterval(() => {
        errorEl.innerText = `Trop de tentatives, merci de patienter : ${timeLeft} secondes`;
        timeLeft--;

        if (timeLeft < 0) {
            clearInterval(timer);
            isLocked = false;
            loginAttempts = 0;
            btn.disabled = false;
            errorEl.innerText = "";
        }
    }, 1000);
}
/**
 * Déconnexion officielle
 */
async function logout() {
    await _supabase.auth.signOut();
    location.reload();
}