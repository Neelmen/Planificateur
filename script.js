const SUPABASE_URL = 'https://sbdmhhrmgcstsduovroo.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNiZG1oaHJtZ2NzdHNkdW92cm9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxNTI5MzQsImV4cCI6MjA5MjcyODkzNH0.cFeD93mLC3Xf1XGDJru7PoC8p7T0cIeGo9Ehy6VDEyw';

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// VARIABLES GLOBALES (Déclarées une seule fois)
let currentPlanningId = null;
let currentYear = null;
let currentMonth = null;
let currentEditingDay = null;

// --- AUTHENTIFICATION ---
async function handleLogin() {
    const errorDisplay = document.getElementById('error-msg');
    const usernameField = document.getElementById('username');
    const passField = document.getElementById('password');

    if (!usernameField || !passField) return;

    const username = usernameField.value.trim();
    const pass = passField.value;

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
    const loginPage = document.getElementById('login-page');
    if (loginPage) loginPage.style.display = 'none';

    const dashboard = document.getElementById('dashboard-page');
    if (dashboard) {
        dashboard.classList.remove('hidden');
        dashboard.style.display = 'block';
    }

    const userDisp = document.getElementById('display-username');
    if (userDisp) {
        const formattedName = username.charAt(0).toUpperCase() + username.slice(1).toLowerCase();
        userDisp.innerText = formattedName;
    }

    loadMenuData();
    loadCompanies();
}

// --- MENU & MOSAÏQUE ---
async function loadMenuData() {
    // On essaie de cibler par ID, sinon par classe pour être sûr de ne rien rater
    const mosaicContainer = document.getElementById('preview-mosaic') || document.querySelector('.mosaic-grid');

    if (!mosaicContainer) {
        console.error("Conteneur mosaïque introuvable !");
        return;
    }

    // 1. NETTOYAGE RADICAL : On vide tout le contenu HTML
    mosaicContainer.innerHTML = '';

    const { data: plannings, error } = await _supabase
        .from('plannings')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Erreur Supabase:", error.message);
        return;
    }

    const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
        "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

    // 2. RECONSTRUCTION : On crée un fragment pour injecter tout d'un coup (évite les duplications visuelles)
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < 3; i++) {
        const item = document.createElement('div');

        if (plannings && plannings[i]) {
            const p = plannings[i];
            const mIndex = monthNames.indexOf(p.month_name);

            item.className = "mosaic-item active";
            item.innerHTML = `
                <span style="font-size: 1.2rem; font-weight: bold; color: white;">${p.month_name}</span>
                <span style="color: #b5bac1;">${p.year}</span>
            `;
            item.onclick = () => openPlanning(p.id, mIndex, p.year);
        } else {
            item.className = "mosaic-item";
            item.innerHTML = `
                <span style="color: #4e5058; font-size: 1.5rem; margin-bottom: 5px;">+</span>
                <span style="color: #4e5058; font-size: 0.9rem;">Emplacement libre</span>
            `;
            item.onclick = () => createNewPlanning();
        }

        fragment.appendChild(item);
    }

    // 3. INJECTION FINALE : On vide une dernière fois juste avant d'injecter le nouveau bloc
    mosaicContainer.innerHTML = '';
    mosaicContainer.appendChild(fragment);
}


async function loadShifts(planningId) {
    const { data: shifts, error } = await _supabase
        .from('shifts')
        .select('*')
        .eq('planning_id', planningId);

    if (error) return;

    // Reset visuel
    document.querySelectorAll('.day-row').forEach(row => {
        row.querySelector('.day-info').innerHTML = '<span class="day-company">Repos</span><span class="day-hours">---</span>';
        row.style.borderLeft = "5px solid transparent";
    });

    if (shifts) {
        shifts.forEach(shift => {
            const dayIndex = new Date(shift.date_jour).getDate() - 1;
            const row = document.querySelectorAll('.day-row')[dayIndex];
            if (!row) return;

            const icon = shift.is_night ? '🌙' : '☀️';
            const color = shift.is_night ? 'var(--blurple)' : 'var(--warning)';
            const infoZone = row.querySelector('.day-info');

            infoZone.innerHTML = `
                <span class="day-company">${shift.type_jour || 'Repos'}</span>
                <span class="day-hours" style="color:${color}">${icon} ${shift.horaire_saisi || '---'}</span>
            `;
            row.style.borderLeft = `5px solid ${color}`;
        });
    }
}
// --- EDITEUR DE SHIFT ---
function openShiftEditor(dayNumber) {
    currentEditingDay = dayNumber;
    document.getElementById('modal-date-title').innerText = `Jour ${dayNumber}`;
    document.getElementById('edit-day-number').value = dayNumber;
    document.getElementById('shift-modal').classList.remove('hidden');
    document.getElementById('drawer-overlay').classList.remove('hidden');
    fillActivitySelect();
    
    const nightSwitch = document.getElementById('is-night-mode');
    if (nightSwitch) {
        nightSwitch.checked = true;
    }
}

async function saveShift() {
    if (!currentPlanningId) {
        alert("Erreur : Aucun planning chargé.");
        return;
    }
    const activity = document.getElementById('shift-company').value;
    const hours = document.getElementById('shift-hours').value;
    const km = document.getElementById('shift-km').value || 0;
    const isDay = document.getElementById('is-night-mode').checked;
    const isNightValue = !isDay;

    const dateIso = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(currentEditingDay).padStart(2, '0')}`;

    const shiftData = {
        planning_id: currentPlanningId,
        date_jour: dateIso,
        type_jour: activity, // Enregistre "🏢 Nom" ou "🌴 Vacances"
        horaire_saisi: activity === "Repos" ? "" : hours,
        km: parseFloat(km),
        is_night: isNightValue
    };

    const { error } = await _supabase.from('shifts').upsert([shiftData], { onConflict: 'planning_id, date_jour' });

    if (error) {
        alert("Erreur : " + error.message);
    } else {
        loadShifts(currentPlanningId);
        closeShiftModal();
    }
}

// --- FONCTIONS SUPPRIMÉES OU MANQUANTES À RAJOUTER ---

function parseHours(str) {
    if (!str || !str.includes('-')) return null;
    // Logique simplifiée : calcule la différence entre deux heures (ex: 07h-15h)
    const parts = str.replace(/h/g, ':').split('-');
    const start = new Date(`2024-01-01 ${parts[0]}`);
    const end = new Date(`2024-01-01 ${parts[1]}`);
    let diff = (end - start) / (1000 * 60 * 60);
    if (diff < 0) diff += 24; // Gestion nuit
    return { total: diff, night: 0 }; // 'night' à calculer selon tes règles
}

function updateGlobalStats(shifts) {
    let totalH = 0, totalKM = 0, workDays = 0;
    shifts.forEach(s => {
        const calcul = parseHours(s.horaire_saisi);
        if (calcul) {
            totalH += calcul.total;
            totalKM += parseFloat(s.km || 0);
            workDays++;
        }
    });
    if (document.getElementById('stat-total-hours')) document.getElementById('stat-total-hours').innerText = totalH.toFixed(2) + 'h';
    if (document.getElementById('stat-total-km')) document.getElementById('stat-total-km').innerText = totalKM;
    if (document.getElementById('stat-work-days')) document.getElementById('stat-work-days').innerText = workDays;
}

function closeShiftModal() {
    document.getElementById('shift-modal').classList.add('hidden');
    document.getElementById('drawer-overlay').classList.add('hidden');
    document.getElementById('shift-form').reset();
}

async function fillActivitySelect() {
    const select = document.getElementById('shift-company');
    if (!select) return;

    const { data: companies } = await _supabase.from('entreprises').select('nom').order('nom');

    const systems = ['🌴 Vacances', '📚 Formation', '🚫 Indisponible'];

    let html = '<option value="Repos">-- Repos --</option>';

    if (companies) {
        companies.forEach(c => html += `<option value="🏢 ${c.nom}">🏢 ${c.nom}</option>`);
    }

    html += '<option disabled>──────────</option>';
    systems.forEach(s => html += `<option value="${s}">${s}</option>`);

    select.innerHTML = html;
}

function isFrenchPublicHoliday(date) {
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const d = date.getDate();
    const fixes = [`${y}-01-01`, `${y}-05-01`, `${y}-05-08`, `${y}-07-14`, `${y}-08-15`, `${y}-11-01`, `${y}-11-11`, `${y}-12-25`];
    const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    return fixes.includes(dateStr);
}

// Initialisation au chargement
window.onload = async () => {
    const { data: { session } } = await _supabase.auth.getSession();

    const loginPage = document.getElementById('login-page');
    const dashboardPage = document.getElementById('dashboard-page');

    if (session) {
        // Si une session existe, on affiche directement le tableau de bord
        const username = session.user.email.split('@')[0];
        showDashboard(username);
    } else {
        // Sinon, on s'assure que seul le login est visible
        loginPage.style.display = 'flex';
        dashboardPage.classList.add('hidden');
        dashboardPage.style.display = 'none';
    }
};

// --- DÉCONNEXION ---
async function logout() {
    try {
        // Déconnexion au niveau de Supabase
        const { error } = await _supabase.auth.signOut();

        if (error) throw error;

        // Le rechargement de la page réinitialise toutes les variables globales
        // et renvoie l'utilisateur vers le formulaire de connexion via window.onload
        window.location.reload();

    } catch (err) {
        console.error("Erreur déconnexion:", err.message);
        alert("Impossible de se déconnecter : " + err.message);
    }
}

// Gestion clic extérieur
window.onclick = function (event) {
    if (event.target == document.getElementById('drawer-overlay')) {
        closeShiftModal();
        toggleDrawer(false);
    }
};
// Fonction pour ajouter une entreprise via le formulaire PC
async function saveCompanyPC() {
    const nom = document.getElementById('pc-comp-name').value;
    const salaire = document.getElementById('pc-comp-salary').value;
    const type = document.getElementById('pc-comp-type').value;
    const couleur = document.getElementById('pc-comp-color').value;
    if (!nom || !salaire) return alert("Veuillez remplir le nom et le salaire");

    const { error } = await _supabase
        .from('entreprises')
        .insert([{
            nom: nom,
            taux_horaire_brut: parseFloat(salaire),
            type_contrat: type,
            couleur_hex: couleur
        }]);

    if (!error) {
        // Reset des champs
        document.getElementById('pc-comp-name').value = '';
        document.getElementById('pc-comp-salary').value = '';
        loadCompanies(); // Recharge la liste
    } else {
        alert("Erreur : " + error.message);
    }
}

async function loadCompanies() {
    const desktopList = document.getElementById('companies-list-desktop'); // Liste PC
    const drawerList = document.getElementById('companies-list');          // Liste Mobile (Drawer)
    const shiftSelect = document.getElementById('shift-company');          // Selecteur dans le planning

    // 1. Récupération des données depuis Supabase
    const { data: companies, error } = await _supabase
        .from('entreprises')
        .select('*')
        .order('nom', { ascending: true });

    if (error) {
        console.error("Erreur chargement entreprises:", error);
        return;
    }

    // --- FONCTION DE SUPPRESSION (Pour garder la main sur tes données) ---
    window.deleteCompany = async (id) => {
        if (!confirm("Supprimer cette entreprise ?")) return;
        const { error: delErr } = await _supabase.from('entreprises').delete().eq('id', id);
        if (!delErr) loadCompanies(); // Rafraîchir partout
    };

    // --- MISE À JOUR DU SÉLECTEUR (Menu déroulant du planning) ---
    if (shiftSelect) {
        shiftSelect.innerHTML = '<option value="">-- Aucune / Repos --</option>';
        companies.forEach(comp => {
            const opt = document.createElement('option');
            opt.value = comp.nom;
            opt.textContent = comp.nom;
            shiftSelect.appendChild(opt);
        });
    }

    // --- FONCTION DE RENDU GÉNÉRIQUE ---
    const renderToContainer = (container, isDesktop) => {
        if (!container) return;
        container.innerHTML = '';

        if (companies.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:gray; padding:10px;">Aucune entreprise enregistrée.</p>';
            return;
        }

        companies.forEach(comp => {
            const salaireNet = (comp.taux_horaire_brut * 0.78).toFixed(2);
            const item = document.createElement('div');

            if (isDesktop) {
                // STYLE LIGNE UNIQUE (PC)
                item.className = 'company-row-inline';
                item.style.borderLeft = `5px solid ${comp.couleur_hex}`;
                item.innerHTML = `
                    <div style="flex:1.5"><b>${comp.nom}</b></div>
                    <div style="flex:1">Type: <b>${comp.type_contrat}</b></div>
                    <div style="flex:1">Brut: <b>${comp.taux_horaire_brut}€</b></div>
                    <div style="flex:1">Net: <b>${salaireNet}€</b></div>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div style="width:15px; height:15px; border-radius:50%; background:${comp.couleur}"></div>
                        <button onclick="deleteCompany('${comp.id}')" style="background:none; border:none; color:var(--danger); cursor:pointer; font-weight:bold;">×</button>
                    </div>
                `;
            } else {
                // STYLE CARTE COMPACTE (Mobile/Drawer)
                item.className = 'mini-item'; // Garde tes styles existants pour le drawer
                item.innerHTML = `
                    <div class="mini-item-color" style="background:${comp.couleur_hex}"></div>
                    <div class="mini-item-info">
                        <b>${comp.nom}</b>
                        <span>${comp.type_contrat} - ${salaireNet}€ Net</span>
                    </div>
                    <button class="btn-delete-mini" onclick="deleteCompany('${comp.id}')">×</button>
                `;
            }
            container.appendChild(item);
        });
    };

    // 2. On lance le rendu pour les deux zones
    renderToContainer(desktopList, true);  // Mode PC
    renderToContainer(drawerList, false);  // Mode Mobile
}
function backToMenu() {
    // 1. Cacher la barre d'outils (Toolbar)
    const toolbar = document.getElementById('planning-toolbar');
    if (toolbar) toolbar.classList.add('hidden');

    // 2. Remettre le titre de la barre de navigation
    const navTitle = document.getElementById('nav-page-title');
    if (navTitle) navTitle.innerText = "Tableau de bord";

    // 3. Gestion des vues (Switching)
    const menuView = document.getElementById('menu-view');
    const planningView = document.getElementById('planning-view');
    const setupView = document.getElementById('setup-planning-view');

    if (planningView) planningView.classList.add('hidden');
    if (setupView) setupView.classList.add('hidden');
    if (menuView) menuView.classList.remove('hidden');

    // 4. Rafraîchir les données du menu et remonter en haut de page
    loadMenuData();
    window.scrollTo(0, 0);
}

function createNewPlanning() {
    const monthSelect = document.getElementById('setup-month-select');
    const yearSelect = document.getElementById('setup-year-select');
    const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

    // Calcul de la date par défaut (Mois actuel + 1)
    let now = new Date();
    let defaultMonth = now.getMonth() + 1; // getMonth() est 0-11, donc +1 = mois suivant
    let defaultYear = now.getFullYear();

    if (defaultMonth > 11) { // Si on est en Décembre, on passe à Janvier de l'année suivante
        defaultMonth = 0;
        defaultYear++;
    }

    // Remplissage du sélecteur de mois
    monthSelect.innerHTML = '';
    monthNames.forEach((name, index) => {
        const opt = document.createElement('option');
        opt.value = index;
        opt.textContent = name;
        if (index === defaultMonth) opt.selected = true;
        monthSelect.appendChild(opt);
    });

    // Remplissage du sélecteur d'année (Année actuelle +/- 2 ans)
    yearSelect.innerHTML = '';
    for (let y = now.getFullYear() - 1; y <= now.getFullYear() + 2; y++) {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        if (y === defaultYear) opt.selected = true;
        yearSelect.appendChild(opt);
    }

    // Affichage de la vue de configuration
    document.getElementById('menu-view').classList.add('hidden');
    document.getElementById('setup-planning-view').classList.remove('hidden');
    document.getElementById('nav-title').innerText = "Configuration";
    document.getElementById('nav-back-btn').classList.remove('hidden');
}

async function confirmCreatePlanning() {
    const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
    const mIndex = parseInt(document.getElementById('setup-month-select').value);
    const year = parseInt(document.getElementById('setup-year-select').value);

    // 1. Insertion dans Supabase
    const { data, error } = await _supabase
        .from('plannings')
        .insert([{
            month_name: monthNames[mIndex],
            year: year
        }])
        .select();

    if (error) {
        alert("Erreur lors de la création : " + error.message);
    } else {
        // 2. Aller directement dans le planning créé
        document.getElementById('setup-planning-view').classList.add('hidden');
        openPlanning(data[0].id, mIndex, year);
    }
}


// Ouvre ou ferme le volet latéral
function toggleDrawer(open) {
    const drawer = document.getElementById('side-drawer');
    const overlay = document.getElementById('drawer-overlay');

    if (open) {
        drawer.classList.add('open');
        overlay.classList.remove('hidden');
        loadCompanies(); // On recharge la liste au cas où
    } else {
        drawer.classList.remove('open');
        overlay.classList.add('hidden');
    }
}

// Enregistre une entreprise dans Supabase
async function saveCompanyPC() {
    const nom = document.getElementById('pc-comp-name').value;
    const salaire = document.getElementById('pc-comp-salary').value;
    const type = document.getElementById('pc-comp-type').value;
    const couleur = document.getElementById('pc-comp-color').value;

    if (!nom || !salaire) return alert("Veuillez remplir le nom et le salaire");

    const { error } = await _supabase
        .from('entreprises')
        .insert([{
            nom: nom,
            taux_horaire_brut: parseFloat(salaire),
            type_contrat: type,
            couleur_hex: couleur
        }]);

    if (!error) {
        // Reset
        document.getElementById('pc-comp-name').value = '';
        document.getElementById('pc-comp-salary').value = '';
        // Fermer le formulaire et recharger
        toggleCompanyFormPC(false);
        loadCompanies();
    } else {
        alert("Erreur : " + error.message);
    }
}

// Affiche ou cache le formulaire d'ajout sur PC
function toggleCompanyFormPC(show) {
    const form = document.getElementById('form-container-pc');
    const btn = document.getElementById('btn-show-form-pc');

    if (show) {
        form.classList.remove('hidden');
        btn.classList.add('hidden');
    } else {
        form.classList.add('hidden');
        btn.classList.remove('hidden');
    }
}

//PARTIE PLANNING
function openPlanning(id, monthIndex, year) {
    currentPlanningId = id;
    currentMonth = monthIndex;
    currentYear = year;

    const toolbar = document.getElementById('planning-toolbar');
    if (toolbar) toolbar.classList.remove('hidden');

    const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
        "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

    // 1. MISE À JOUR DE LA BARRE SUPÉRIEURE (Vérification des IDs réels)
    const btnOptions = document.getElementById('btn-options-planning');
    if (btnOptions) btnOptions.classList.remove('hidden');

    // On utilise l'ID 'nav-page-title' qui est dans ton HTML
    const navTitle = document.getElementById('nav-page-title');
    if (navTitle) navTitle.innerText = `${monthNames[monthIndex]} ${year}`;

    // 2. PASSAGE DES VUES
    document.getElementById('menu-view').classList.add('hidden');
    document.getElementById('planning-view').classList.remove('hidden');

    // 3. CHARGEMENT DES DONNÉES
    renderPlanning(monthIndex, year);
    loadShifts(id);
}

function renderPlanning(month, year) {
    const container = document.getElementById('calendar-vertical-list');
    if (!container) return;
    container.innerHTML = '';

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

    for (let i = 1; i <= daysInMonth; i++) {
        const date = new Date(year, month, i);
        const dayOfWeek = date.getDay();
        const isFerie = isFrenchPublicHoliday(date);

        const row = document.createElement('div');
        row.className = 'day-row';
        if (dayOfWeek === 0) row.classList.add('sunday');
        if (dayOfWeek === 6) row.classList.add('saturday');
        if (isFerie) row.classList.add('ferie');

        row.onclick = () => openShiftEditor(i);

        row.innerHTML = `
            <div class="day-date">
                <span class="day-num">${i}</span>
                <span class="day-name">${daysNames[dayOfWeek]}</span>
            </div>
            <div class="day-info">
                <span class="day-company">Repos</span>
                <span class="day-hours">---</span>
            </div>
        `;
        container.appendChild(row);
    }
}

// Afficher/Cacher les options
function toggleOptionsModal(show) {
    const modal = document.getElementById('options-modal');
    modal.classList.toggle('hidden', !show);
}

// Afficher la confirmation de suppression
function showDeleteConfirm() {
    toggleOptionsModal(false); // On ferme d'abord le menu options
    document.getElementById('delete-confirm-modal').classList.remove('hidden');
}

function closeDeleteConfirm() {
    document.getElementById('delete-confirm-modal').classList.add('hidden');
}

// Fonction de suppression réelle dans Supabase
async function deleteCurrentPlanning() {
    if (!currentPlanningId) return;

    const { error } = await _supabase
        .from('plannings') // Vérifie bien que ta table s'appelle 'plannings'
        .delete()
        .eq('id', currentPlanningId);

    if (error) {
        alert("Erreur lors de la suppression : " + error.message);
    } else {
        closeDeleteConfirm();
        backToMenu(); // On retourne à l'accueil
        loadMenuData(); // On rafraîchit la liste des plannings
    }
}
function showDeleteConfirm() {
    document.getElementById('delete-confirm-modal').classList.remove('hidden');
}

function closeDeleteConfirm() {
    document.getElementById('delete-confirm-modal').classList.add('hidden');
}
async function resetCurrentPlanning() {
    if (!confirm("Voulez-vous effacer TOUS les horaires de ce planning ?")) return;

    const { error } = await _supabase
        .from('shifts')
        .delete()
        .eq('planning_id', currentPlanningId);

    if (error) {
        alert("Erreur lors de la réinitialisation : " + error.message);
    } else {
        loadShifts(currentPlanningId); // Recharge le planning vide
    }
}
function updateSwitchUI() {
    const isNight = document.getElementById('is-night-mode').checked;
    const label = document.getElementById('switch-label-text');
    label.innerText = isNight ? "Nuit" : "Jour";
    label.style.color = isNight ? "var(--blurple)" : "var(--warning)";
}