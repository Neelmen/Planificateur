// --- ui.js ---
function toggleDrawer(open) {
    const drawer = document.getElementById('side-drawer');
    const overlay = document.getElementById('drawer-overlay');
    if (open) {
        drawer.classList.add('open');
        overlay.classList.remove('hidden');
    } else {
        drawer.classList.remove('open');
        overlay.classList.add('hidden');
    }
}

function toggleCompanyFormPC(show) {
    const container = document.getElementById('form-container-pc');
    const btn = document.getElementById('btn-show-form-pc');
    if (show) {
        container.classList.remove('hidden');
        btn.classList.add('hidden');
    } else {
        container.classList.add('hidden');
        btn.classList.remove('hidden');
    }
}

function showView(viewId) {
    document.querySelectorAll('.content-view').forEach(v => v.classList.add('hidden'));
    document.getElementById(viewId).classList.remove('hidden');

    // Titre de la barre de navigation
    const titles = { 'menu-view': 'Menu', 'planning-view': 'Éditeur', 'setup-planning-view': 'Nouveau' };
    document.getElementById('nav-page-title').innerText = titles[viewId] || 'Planning Pro';
    
    // Gérer la visibilité du bouton retour
    const backBtn = document.querySelector('.btn-icon');
    if (backBtn) {
        // Cacher le bouton retour dans le menu principal
        if (viewId === 'menu-view') {
            backBtn.style.display = 'none';
        } else {
            backBtn.style.display = 'flex';
            // Mettre à jour l'onclick pour utiliser backToMainMenu
            backBtn.onclick = backToMainMenu;
        }
    }
}