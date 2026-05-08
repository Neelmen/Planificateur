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
    // 1. On cache toutes les vues
    document.querySelectorAll('.content-view').forEach(v => v.classList.add('hidden'));

    // 2. On affiche la vue demandée
    const targetView = document.getElementById(viewId);
    if (targetView) targetView.classList.remove('hidden');

    // 3. Mise à jour du titre
    const titles = {
        'menu-view': 'Menu',
        'planning-view': 'Éditeur',
        'setup-planning-view': 'Nouveau'
    };
    document.getElementById('nav-page-title').innerText = titles[viewId] || 'Planning Pro';

    // 4. Gestion du bouton retour
    const backBtn = document.querySelector('.btn-icon');
    if (backBtn) {
        if (viewId === 'menu-view') {
            // Force la disparition totale immédiate
            backBtn.style.display = 'none';
        } else {
            backBtn.style.display = 'flex';
            backBtn.onclick = () => showView('menu-view'); // Utilise showView directement
        }
    }
}