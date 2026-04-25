const SUPABASE_URL = 'https://sbdmhhrmgcstsduovroo.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNiZG1oaHJtZ2NzdHNkdW92cm9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxNTI5MzQsImV4cCI6MjA5MjcyODkzNH0.cFeD93mLC3Xf1XGDJru7PoC8p7T0cIeGo9Ehy6VDEyw';

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- AUTHENTIFICATION ---

async function handleLogin() {
    const errorDisplay = document.getElementById('error-msg');
    const username = document.getElementById('username').value.trim();
    const pass = document.getElementById('password').value;

    if (!username || !pass) {
        errorDisplay.innerText = "Veuillez remplir tous les champs.";
        return;
    }

    const fakeEmail = `${username.toLowerCase()}@planning.com`;

    try {
        const { data, error } = await _supabase.auth.signInWithPassword({
            email: fakeEmail,
            password: pass,
        });

        if (error) {
            errorDisplay.innerText = "Erreur : " + error.message;
        } else {
            showDashboard(username);
        }
    } catch (err) {
        errorDisplay.innerText = "Erreur de connexion.";
    }
}

function showDashboard(username) {
    // On SUPPRIME le bloc de login du document pour qu'il ne prenne plus de place
    const loginPage = document.getElementById('login-page');
    if (loginPage) {
        loginPage.remove();
    }

    // On affiche le dashboard
    const dashboard = document.getElementById('dashboard-page');
    dashboard.classList.remove('hidden');
    dashboard.style.display = 'block';

    // Formatage du nom
    const formattedName = username.charAt(0).toUpperCase() + username.slice(1).toLowerCase();
    document.getElementById('user-display').innerText = formattedName;

    loadMenuData();
}

function updateStorageUI(percent) {
    const info = document.getElementById('storage-info');
    const fill = document.getElementById('storage-fill');
    if (info && fill) {
        info.innerText = `Stockage : ${percent}%`;
        fill.style.width = `${percent}%`;
    }
}

// --- MENU & MOSAÏQUE ---

function loadMenuData() {
    const mosaicContainer = document.getElementById('preview-mosaic');
    if (!mosaicContainer) return;
    mosaicContainer.innerHTML = '';

    const recent = [
        { month: "Avril", year: 2026 },
        { month: "Mars", year: 2026 }
    ];

    for (let i = 0; i < 3; i++) {
        const item = document.createElement('div');
        if (recent[i]) {
            item.className = "mosaic-item active";
            item.innerHTML = `
                <span style="font-size: 1.2rem; font-weight: bold; color: white;">${recent[i].month}</span>
                <span style="color: #b5bac1;">${recent[i].year}</span>
            `;
            item.onclick = () => alert("Ouverture de " + recent[i].month);
        } else {
            item.className = "mosaic-item";
            item.innerHTML = `<span style="color: #4e5058; font-size: 0.9rem;">Emplacement libre</span>`;
        }
        mosaicContainer.appendChild(item);
    }
}

async function handleLogout() {
    await _supabase.auth.signOut();
    location.reload();
}

// --- INITIALISATION ---

window.onload = async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (session) {
        const username = session.user.email.split('@')[0];
        showDashboard(username);
    }
};