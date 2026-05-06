// --- app.js ---
async function initApp(username) {
    document.getElementById('login-page').style.display = 'none';
    document.getElementById('dashboard-page').classList.remove('hidden');
    document.getElementById('display-username').innerText = username.toUpperCase();

    // Chargement initial des données
    await loadCompanies();
    renderCompaniesUI();
    await loadRecentPlannings(); // Charger les 3 derniers plannings
}

/**
 * Vérifie si l'utilisateur est déjà connecté au chargement de la page
 */
async function checkExistingSession() {
    try {
        const { data: { session }, error } = await _supabase.auth.getSession();
        
        if (error) {
            console.error('Erreur vérification session:', error);
            return false;
        }
        
        if (session) {
            // Utilisateur déjà connecté
            state.user = session.user;
            
            // Extraire le pseudo depuis l'email (pseudo@planning.com)
            const email = session.user.email;
            const pseudo = email ? email.replace('@planning.com', '') : 'user';
            
            // Initialiser l'application directement
            await initApp(pseudo);
            return true;
        }
        
        return false;
    } catch (error) {
        console.error('Erreur checkExistingSession:', error);
        return false;
    }
}

// Initialisation au chargement de la page
window.onload = async () => {
    // D'abord vérifier si une session existe déjà
    const hasSession = await checkExistingSession();
    
    if (!hasSession) {
        // Pas de session, afficher la page de login
        document.getElementById('login-page').style.display = 'block';
        document.getElementById('dashboard-page').classList.add('hidden');
    }
    
    // Initialiser les sélecteurs de date (toujours utile)
    const monthSelect = document.getElementById('setup-month-select');
    const yearSelect = document.getElementById('setup-year-select');

    if (monthSelect && yearSelect) {
        // Vider les sélecteurs d'abord
        monthSelect.innerHTML = '';
        yearSelect.innerHTML = '';
        
        // Obtenir la date actuelle
        const currentDate = new Date();
        const currentMonth = currentDate.getMonth() + 1; // JS months are 0-11, we need 1-12
        const currentYear = currentDate.getFullYear();
        
        // Générer les options de mois en commençant par le mois suivant
        for (let i = 0; i < 12; i++) {
            const monthIndex = (currentMonth + i) % 12; // Commencer par le mois suivant
            const monthValue = monthIndex + 1;
            monthSelect.innerHTML += `<option value="${monthValue}">${MONTHS[monthIndex]}</option>`;
        }
        
        // Générer les options d'année (année actuelle et suivantes)
        for (let i = 0; i < 4; i++) {
            yearSelect.innerHTML += `<option value="${currentYear + i}">${currentYear + i}</option>`;
        }
        
        // Sélectionner le premier mois et l'année actuelle par défaut
        monthSelect.selectedIndex = 0;
        yearSelect.selectedIndex = 0;
    }
};