// --- companies.js ---

async function loadCompanies() {
    const { data, error } = await _supabase
        .from('entreprises')
        .select('*')
        .order('nom', { ascending: true });

    if (!error) {
        state.companies = data || [];
    }
}

async function saveCompany(mode = 'pc') {
    const isM = mode === 'mobile';

    // Définition des suffixes selon ton HTML précédent
    // Mobile: comp-name-m | PC: sidebar-comp-name
    const prefix = isM ? 'comp-' : 'sidebar-comp-';
    const suffix = isM ? '-m' : '';

    const idNom = isM ? `comp-name-m` : `sidebar-comp-name`;
    const idSal = isM ? `comp-salary-m` : `sidebar-comp-salary`;
    const idType = isM ? `comp-type-m` : `sidebar-comp-type`;
    const idCol = isM ? `comp-color-m` : `sidebar-comp-color`;

    const nom = document.getElementById(idNom).value.trim().toUpperCase();
    const salaire = document.getElementById(idSal).value;
    const type = document.getElementById(idType).value;
    const couleur = document.getElementById(idCol).value;

    if (!nom || !salaire) return alert("Champs obligatoires manquants");

    const { error } = await _supabase
        .from('entreprises')
        .insert([{
            nom: nom,
            taux_horaire_brut: parseFloat(salaire),
            type_contrat: type,
            couleur_hex: couleur
        }]);

    if (!error) {
        // Reset universel
        [idNom, idSal].forEach(id => document.getElementById(id).value = '');

        await loadCompanies();
        renderCompaniesUI(); // Met à jour les selects et listes

        // Fermeture automatique du bon menu
        isM ? toggleDrawerComp(false) : null;
    } else {
        alert("Erreur : " + error.message);
    }
}

function renderCompaniesUI() {
    const listPC = document.getElementById('companies-sidebar-list'); // Liste Sidebar PC
    const listMob = document.getElementById('companies-list-m');      // Liste Drawer Mobile
    const editRowSelect = document.getElementById('editrow-company');
    const selectShift = document.getElementById('shift-company');

    let htmlCommon = '';
    // ... (ton code de génération d'options reste identique)

    state.companies.forEach(comp => {
        const net = (comp.taux_horaire_brut * 0.78).toFixed(2);
        htmlCommon += `
        <div class="company-card" style="--company-color: ${comp.couleur_hex};">
            <div class="company-details">
                <span class="company-name-text">${comp.nom}</span>
                <span class="company-site-text">${net}€ Net</span>
            </div>
            <button class="btn-delete" onclick="deleteCompany('${comp.id}')">×</button>
        </div>`;
    });

    // On injecte le même HTML dans les deux listes si elles existent
    if (listPC) listPC.innerHTML = htmlCommon;
    if (listMob) listMob.innerHTML = htmlCommon;

    if (editRowSelect) editRowSelect.innerHTML = optionsEditRow;
    if (selectShift) selectShift.innerHTML = optionsShift;
}

async function deleteCompany(id) {

    const { error } = await _supabase
        .from('entreprises')
        .delete()
        .eq('id', id);

    if (!error) {
        await loadCompanies(); 
        renderCompaniesUI();
    } else {
        alert("Erreur lors de la suppression : " + error.message);
    }
}

// --- FONCTIONS POUR LA SIDEBAR ---
function toggleCompaniesSidebar() {
    const sidebar = document.getElementById('companies-sidebar');
    const floatBtn = document.getElementById('companies-float-btn');
    
    if (sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
        floatBtn.style.display = 'flex';
    } else {
        sidebar.classList.add('open');
        floatBtn.style.display = 'none';
        loadCompaniesSidebar();
    }
}

async function loadCompaniesSidebar() {
    await loadCompanies();
    renderCompaniesSidebar();
}

// Fermer la sidebar lors d'un clic en dehors
document.addEventListener('mousedown', function (event) {
    const sidebar = document.getElementById('companies-sidebar');
    const floatBtn = document.getElementById('companies-float-btn');

    // Si la sidebar est ouverte
    if (sidebar.classList.contains('open')) {
        // Si le clic n'est NI sur la sidebar, NI sur le bouton qui l'ouvre
        if (!sidebar.contains(event.target) && !floatBtn.contains(event.target)) {
            toggleCompaniesSidebar();
        }
    }
});

// Fonction pour ouvrir/fermer le drawer
function toggleDrawerComp(isOpen) {
    const drawer = document.getElementById('drawer-comp');
    if (isOpen) {
        drawer.classList.add('open');
        // Optionnel : empêcher le scroll du body en arrière-plan
        document.body.style.overflow = 'hidden';
    } else {
        drawer.classList.remove('open');
        document.body.style.overflow = 'auto';
    }
}