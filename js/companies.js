// --- companies.js ---

async function loadCompanies() {
    const { data, error } = await _supabase
        .from('entreprises')
        .select('*')
        .order('nom', { ascending: true });

    if (!error) {
        state.companies = data || []; // Mise à jour du cache
    }
}

async function saveCompany(mode = 'pc') {
    // Sélection des IDs selon la source (PC ou Mobile)
    const isM = mode === 'mobile';
    const idNom = isM ? 'comp-name-m' : 'pc-comp-name';
    const idSal = isM ? 'comp-salary-m' : 'pc-comp-salary';
    const idType = isM ? 'comp-type-m' : 'pc-comp-type';
    const idCol = isM ? 'comp-color-m' : 'pc-comp-color';

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
        // Reset des champs
        document.getElementById(idNom).value = '';
        document.getElementById(idSal).value = '';

        await loadCompanies(); // Recharge les données
        renderCompaniesUI();   // Rafraîchit l'affichage[cite: 3]
        isM ? toggleDrawer(false) : toggleCompanyFormPC(false);
    } else {
        alert("Erreur : " + error.message);
    }
}

function renderCompaniesUI() {
    const listPC = document.getElementById('companies-list-desktop');
    const listMob = document.getElementById('companies-list');
    const editRowSelect = document.getElementById('editrow-company');
    const selectShift = document.getElementById('shift-company');

    // 1. Préparation des templates (évite de toucher au DOM dans la boucle)
    let htmlPC = '';
    let htmlMob = '';
    let optionsEditRow = '<option value="">-- Choisir une entreprise --</option><option value="repos">Repos</option>';
    let optionsShift = '<option value="Repos">-- Repos --</option>';

    state.companies.forEach(comp => {
        const net = (comp.taux_horaire_brut * 0.78).toFixed(2);

        // Template PC
        htmlPC += `
            <div class="company-row-inline" style="border-left: 5px solid ${comp.couleur_hex}">
                <div style="flex:1.5"><b>${comp.nom}</b></div>
                <div style="flex:1">${net}€ Net</div>
                <button class="btn-delete" onclick="deleteCompany('${comp.id}')">×</button>
            </div>`;

        // Template Mobile
        htmlMob += `
            <div class="mini-item">
                <div class="mini-item-color" style="background:${comp.couleur_hex}"></div>
                <div class="mini-item-info"><b>${comp.nom}</b><span>${net}€ Net</span></div>
                <button onclick="deleteCompany('${comp.id}')">×</button>
            </div>`;

        // Construction des options de sélecteurs
        optionsEditRow += `<option value="${comp.id}">${comp.nom}</option>`;
        optionsShift += `<option value="🏢 ${comp.nom}">🏢 ${comp.nom}</option>`;
    });

    // 2. Injection unique dans le DOM (Plus performant)
    if (listPC) listPC.innerHTML = htmlPC;
    if (listMob) listMob.innerHTML = htmlMob;
    if (editRowSelect) editRowSelect.innerHTML = optionsEditRow;
    if (selectShift) selectShift.innerHTML = optionsShift;

    // Le bloc "modalSelect" a été supprimé car il est obsolète.
}