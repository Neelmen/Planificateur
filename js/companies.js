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

    const userId = (await _supabase.auth.getUser()).data.user?.id;

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

    let htmlCommon = ''; 
    let optionsEditRow = '<option value="">-- Choisir une entreprise --</option><option value="repos">Repos</option>';
    let optionsShift = '<option value="Repos">-- Repos --</option>';

    state.companies.forEach(comp => {
        const net = (comp.taux_horaire_brut * 0.78).toFixed(2);

        htmlCommon += `
        <div class="company-card" style="--company-color: ${comp.couleur_hex};">
            <div class="company-color-bar"></div>
            <div class="company-details">
                <div class="company-main-info">
                    <span class="company-name-text">${comp.nom}</span>
                </div>
                <span class="company-site-text">${net}€ Net / heure</span>
            </div>
            <div class="company-actions">
                <button class="btn-delete" onclick="deleteCompany('${comp.id}')" title="Supprimer">×</button>
            </div>
        </div>`;   

        optionsEditRow += `<option value="${comp.id}">${comp.nom}</option>`;
        optionsShift += `<option value="🏢 ${comp.nom}">🏢 ${comp.nom}</option>`;
    });

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