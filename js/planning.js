// --- planning.js ---
// NOUVEAU SYSTÈME DE PLANNING - LOGIQUE MODERNE ET ROBUSTE

// État global du planning
const PlanningState = {
    currentPlanning: null,
    currentMonth: null,
    currentYear: null,
    days: [],
    companies: [],
    isLoading: false
};

/**
 * Initialise le nouveau planning après le clic sur "Continuer"
 */
window.startPlanningCreation = async function() {
    try {
        const month = document.getElementById('setup-month-select')?.value;
        const year = document.getElementById('setup-year-select')?.value;

        if (!month || !year) {
            alert("Veuillez sélectionner un mois et une année.");
            return;
        }

        // Mettre à jour l'état
        PlanningState.currentMonth = parseInt(month);
        PlanningState.currentYear = parseInt(year);
        PlanningState.companies = state.companies || [];

        // Vérifier si un planning existe déjà avec le même mois et année
        const monthName = MONTHS[month - 1];
        const { data: existingPlannings, error: checkError } = await _supabase
            .from('plannings')
            .select('*')
            .eq('month_name', monthName)
            .eq('year', parseInt(year))
            .eq('user_id', state.user.id);

        if (checkError) {
            console.error('Erreur vérification planning:', checkError);
        }

        // Si un planning existe déjà, demander confirmation
        if (existingPlannings && existingPlannings.length > 0) {
            const confirmMessage = `Un planning pour ${monthName} ${year} existe déjà.\n\nVoulez-vous vraiment créer un deuxième planning pour la même période ?`;
            
            if (!confirm(confirmMessage)) {
                // Annulation - retour au menu principal
                showView('menu-view');
                return;
            }
        }

        // Créer le planning dans Supabase
        const { data: planningData, error } = await _supabase
            .from('plannings')
            .insert([{
                month_name: monthName,
                year: parseInt(year),
                user_id: state.user.id
            }])
            .select()
            .single();

        if (error) {
            console.error('Erreur création planning:', error);
            alert('Erreur lors de la création du planning: ' + error.message);
            return;
        }

        // Stocker le planning actuel
        PlanningState.currentPlanning = planningData;
        state.currentPlanning = planningData;

        // Navigation vers la vue planning
        document.getElementById('setup-planning-section')?.classList.add('hidden');
        document.getElementById('planning-view')?.classList.remove('hidden');

        // Mettre à jour le titre
        const titleEl = document.getElementById('current-planning-title');
        if (titleEl) {
            titleEl.innerText = `${monthName} ${year}`.toUpperCase();
        }

        // Générer et afficher le calendrier
        await generateCalendar();

    } catch (error) {
        console.error('Erreur dans startPlanningCreation:', error);
        alert('Une erreur est survenue lors de la création du planning.');
    }
};

/**
 * Génère le calendrier du planning en 5 blocs semaines
 */
async function generateCalendar() {
    try {
        const container = document.getElementById('calendar-container');
        if (!container) {
            console.error('Conteneur calendar-container non trouvé');
            return;
        }

        // Vider et préparer le conteneur pour le layout en semaines
        container.innerHTML = '';
        container.className = 'calendar-list';

        // Calculer le nombre de jours dans le mois
        const daysInMonth = new Date(PlanningState.currentYear, PlanningState.currentMonth, 0).getDate();
        
        // **CRUCIAL** : Initialiser PlanningState.days avec tous les jours du mois
        PlanningState.days = [];
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(PlanningState.currentYear, PlanningState.currentMonth - 1, day);
            // Calculer le jour de la semaine (0=Lundi, 6=Dimanche)
            const dayOfWeek = (date.getDay() + 6) % 7; // Convertir de 0=Dimanche à 0=Lundi
            PlanningState.days.push({
                day: day,
                date: date,
                dayOfWeek: dayOfWeek,
                shift: null
            });
        }
        
        // Organiser les jours en semaines réelles
        const weeks = organizeDaysIntoWeeks(daysInMonth, PlanningState.currentMonth, PlanningState.currentYear);
        
        // Créer 5 blocs semaines directement dans le conteneur principal
        const weekBlocks = [];
        for (let i = 0; i < 5; i++) {
            const weekBlock = createWeekBlock(i + 1, weeks[i] || []);
            weekBlocks.push(weekBlock);
            container.appendChild(weekBlock);
        }

        // Charger les données existantes
        await loadPlanningData();

    } catch (error) {
        console.error('Erreur génération calendrier:', error);
    }
}

/**
 * Récupère les horaires à afficher dans la cell-3
 */
function getCellHours(dayData) {
    // Si pas de shift ou pas d'horaires, affiche vide
    if (!dayData?.shift || !dayData.shift.horaire_saisi) {
        return '';
    }
    
    return dayData.shift.horaire_saisi;
}

/**
 * Récupère le contenu à afficher dans la cell-2 (repos/entreprise)
 */
function getCellContent(dayData) {
    // 1. Logs de débogage (optionnels, à retirer en production)
    console.log('getCellContent - dayData:', dayData);

    // 2. Sécurité : Si pas de données ou pas de shift, on affiche REPOS
    if (!dayData || !dayData.shift) {
        console.log('getCellContent - Pas de données, affiche REPOS');
        return 'REPOS';
    }

    const entId = dayData.shift.entreprise_id;

    // 3. Vérification si c'est explicitement un repos
    if (!entId || entId === 'repos') {
        console.log('getCellContent - entreprise_id absent ou "repos"');
        return 'REPOS';
    }

    // 4. Recherche de l'entreprise dans le state global
    // On utilise String() pour comparer l'ID Supabase (int) avec l'ID du sélecteur (string)
    const company = state.companies.find(c => String(c.id) === String(entId));

    if (company) {
        console.log('getCellContent - Entreprise trouvée :', company.nom);
        return company.nom;
    }

    // 5. Fallback final si l'ID ne correspond à aucune entreprise connue
    console.warn('getCellContent - ID entreprise inconnu :', entId);
    return 'REPOS';
}

/**
 * Organise les jours en semaines réelles selon le calendrier (Lundi-Dimanche)
 */
function organizeDaysIntoWeeks(daysInMonth, month, year) {
    const weeks = [];
    
    // Trouver le premier jour du mois (0 = Dimanche, 1 = Lundi, etc.)
    const firstDay = new Date(year, month - 1, 1).getDay();
    
    // Convertir en système Lundi-Dimanche (0 = Lundi, 1 = Mardi, ..., 6 = Dimanche)
    const firstDayMondaySystem = firstDay === 0 ? 6 : firstDay - 1;
    
    // Calculer le début de la première semaine (peut être le mois précédent)
    let currentDay = 1;
    let weekNumber = 1;
    
    while (currentDay <= daysInMonth && weekNumber <= 5) {
        const weekDays = [];
        
        // Parcourir les 7 jours de la semaine (Lundi=0 à Dimanche=6)
        for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
            // Calculer le jour actuel
            const dayInMonth = (weekNumber - 1) * 7 + dayOfWeek - firstDayMondaySystem + 1;
            
            // Vérifier si le jour est dans le mois
            if (dayInMonth >= 1 && dayInMonth <= daysInMonth) {
                const date = new Date(year, month - 1, dayInMonth);
                weekDays.push({
                    day: dayInMonth,
                    date: date,
                    dayOfWeek: dayOfWeek,
                    shift: null
                });
            }
        }
        
        // Ajouter la semaine seulement si elle contient des jours
        if (weekDays.length > 0) {
            weeks.push(weekDays);
            weekNumber++;
        }
        
        currentDay += 7;
    }
    
    return weeks;
}

/**
 * Crée un bloc semaine avec le style Discord
 */
function createWeekBlock(weekNumber, weekDays) {
    const weekBlock = document.createElement('div');
    weekBlock.className = 'week-block';
    
    // En-tête de semaine
    const weekHeader = document.createElement('div');
    weekHeader.className = 'week-header';
    weekHeader.textContent = `Semaine ${weekNumber}`;
    weekBlock.appendChild(weekHeader);
    
    // Contenu de la semaine
    const weekContent = document.createElement('div');
    weekContent.className = 'week-content';
    
    // Ajouter les jours de la semaine
    weekDays.forEach(dayData => {
        const dayRow = createCompactDayRow(dayData);
        weekContent.appendChild(dayRow);
    });
    
    weekBlock.appendChild(weekContent);
    
    return weekBlock;
}

/**
 * Crée une ligne de jour compacte style Discord
 */
/**
 * Crée une ligne de jour compacte style Discord (Optimisée)
 */
function createCompactDayRow(dayData) {
    const dayRow = document.createElement('div');
    dayRow.className = 'day-row grid-layout';
    dayRow.setAttribute('data-day', dayData.day);

    // 1. Gestion des classes de style
    if (dayData.dayOfWeek === 6) { // Dimanche
        dayRow.classList.add('weekend');
    }

    // 2. Création des 5 colonnes pour la première ligne
    const dayNames = ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM'];
    const company = PlanningState.companies.find(c => c.id === dayData.shift?.entreprise_id);

    // Structure grille avec numéro du jour, repos, horaires et nom du jour
    const dayName = dayNames[dayData.dayOfWeek] || '???';
    const displayContent = getCellContent(dayData);
    const displayHours = getCellHours(dayData);
    dayRow.innerHTML = `
    <div class="grid-cell cell-1">${String(dayData.day).padStart(2, '0')}</div>
    <div class="grid-cell cell-2">${displayContent}</div>
    <div class="grid-cell cell-3">${displayHours}</div>
    <div class="grid-cell cell-4"></div>
    <div class="grid-cell cell-5">${dayName}</div>
    <div class="grid-cell cell-6"></div>
    <div class="grid-cell cell-7-8"></div>
`;
dayRow.style.borderLeft = '4px solid transparent';
dayRow.classList.remove('has-work');

    // 4. Gestionnaire d'événement
    dayRow.onclick = () => openEditRow(dayData.day);

    return dayRow;
}

/**
 * Crée un élément jour pour le calendrier
 */
function createDayElement(dayNumber) {
    const date = new Date(PlanningState.currentYear, PlanningState.currentMonth - 1, dayNumber);
    const dayName = date.toLocaleDateString('fr-FR', { weekday: 'short' });
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;

    // Créer l'élément principal
    const dayElement = document.createElement('div');
    dayElement.className = `day-row ${isWeekend ? 'weekend' : ''}`;
    dayElement.setAttribute('data-day', dayNumber);
    
    // Structure HTML du jour
    dayElement.innerHTML = `
        <div class="day-date">
            <div class="day-num">${dayNumber}</div>
            <div class="day-name">${dayName.toUpperCase()}</div>
        </div>
        <div class="shift-main-content">
            <div id="company-${dayNumber}" class="shift-display">
                <!-- Entreprise -->
            </div>
            <div id="hours-${dayNumber}" class="shift-display">
                <!-- Heures -->
            </div>
            <div id="site-${dayNumber}" class="shift-display">
                <!-- Site -->
            </div>
            <div id="type-${dayNumber}" class="shift-display">
                <!-- Type -->
            </div>
        </div>
    `;

    return {
        dayNumber,
        element: dayElement,
        date: date.toISOString().split('T')[0],
        shift: null
    };
}

/**
 * Charge les données du planning depuis Supabase
 */
async function loadPlanningData() {
    try {
        if (!PlanningState.currentPlanning?.id) return;

        const { data: shifts, error } = await _supabase
            .from('shifts')
            .select('*')
            .eq('planning_id', PlanningState.currentPlanning.id)
            .order('date_jour');

        if (error) {
            console.error('Erreur chargement shifts:', error);
            return;
        }

        // Mettre à jour les jours avec les shifts
        shifts?.forEach(shift => {
            const day = new Date(shift.date_jour).getDate();
            const dayData = PlanningState.days.find(d => d.day === day);
            if (dayData) {
                dayData.shift = shift;
                updateDayDisplay(dayData);
            }
        });

    } catch (error) {
        console.error('Erreur loadPlanningData:', error);
    }
}

/**
 * Met à jour l'affichage d'un jour (ancienne fonction - obsolète)
 * @deprecated Utiliser updateDayDisplayNew() à la place
 */
function updateDayDisplay(dayData) {
    console.warn('updateDayDisplay est obsolète, utilisation de updateDayDisplayNew');
    updateDayDisplayNew(dayData);
}

/**
 * Met à jour l'affichage d'un jour - utilise la même logique que createCompactDayRow
 */
function updateDayDisplayNew(dayData) {
    const dayRow = document.querySelector(`[data-day="${dayData.day}"]`);
    if (!dayRow) return;

    const dayNames = ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM'];
    const dayName = dayNames[dayData.dayOfWeek] || '???';
    const displayContent = getCellContent(dayData);
    const displayHours = getCellHours(dayData);
    
    // Correction : On récupère l'entreprise pour la couleur (Source unique : state.companies)
    const company = state.companies.find(c => c.id === dayData.shift?.entreprise_id);

    dayRow.innerHTML = `
        <div class="grid-cell cell-1">${String(dayData.day).padStart(2, '0')}</div>
        <div class="grid-cell cell-2">${displayContent}</div>
        <div class="grid-cell cell-3">${displayHours}</div>
        <div class="grid-cell cell-4"></div>
        <div class="grid-cell cell-5">${dayName}</div>
        <div class="grid-cell cell-6"></div>
        <div class="grid-cell cell-7-8"></div>
    `;

    // APPLICATION DU STYLE (Le point qui manquait)
    if (company && company.couleur_hex) {
        dayRow.style.borderLeft = `4px solid ${company.couleur_hex}`;
        dayRow.classList.add('has-work');
    } else {
        dayRow.style.borderLeft = '4px solid transparent';
        dayRow.classList.remove('has-work');
    }
}

/* --- EditRow System Functions --- */

/**
 * Ouvre le menu EditRow pour modifier un jour
 */
function openEditRow(dayNumber) {
    const dayData = PlanningState.days.find(d => d.day === dayNumber);
    if (!dayData) return;

    // Préparer le menu
    const menu = document.getElementById('editrow-menu');
    if (!menu) {
        console.error('Menu EditRow non trouvé');
        return;
    }

    // Titre formaté
    const monthName = MONTHS[PlanningState.currentMonth - 1];
    const title = dayNumber === 1 ? `1er ${monthName}` : `${dayNumber} ${monthName}`;
    document.getElementById('editrow-title').innerText = title;

    // Stocker le jour en cours
    menu.setAttribute('data-current-day', dayNumber);

    // Remplir les sélecteurs
    populateEditRowSelectors();

    // Pré-remplir avec les données existantes
    if (dayData.shift) {
        fillEditRowWithData(dayData.shift);
    } else {
        resetEditRow();
    }

    // Afficher le menu
    menu.classList.remove('hidden');
}

/**
 * Remplit les sélecteurs du menu EditRow
 */
/**
 * Récupère les sites uniques depuis tous les plannings de l'utilisateur
 */
async function loadUserSites() {
    try {
        if (!state.user?.id) {
            console.warn('Utilisateur non connecté, impossible de charger les sites');
            return [];
        }

        const { data, error } = await _supabase
            .from('shifts')
            .select('site')
            .eq('user_id', state.user.id)
            .not('site', 'is', null)
            .not('site', 'eq', '');

        if (error) {
            console.error('Erreur chargement sites:', error);
            return [];
        }

        // Extraire les sites uniques
        const uniqueSites = [...new Set(data?.map(shift => shift.site).filter(Boolean))];
        console.log('Sites utilisateur chargés:', uniqueSites);
        return uniqueSites;

    } catch (error) {
        console.error('Erreur loadUserSites:', error);
        return [];
    }
}

/**
 * Remplit les sélecteurs du menu EditRow en utilisant l'état global
 */
async function populateEditRowSelectors() {
    // 1. Sélecteur d'entreprises
    const companySelect = document.getElementById('editrow-company');

    if (companySelect) {
        // Reset et options par défaut
        companySelect.innerHTML = `
            <option value="">-- Choisir une entreprise --</option>
            <option value="repos">Repos</option>
        `;

        // UTILISATION DE state.companies (chargé au démarrage dans app.js)
        const companies = state.companies || [];

        if (companies.length > 0) {
            companies.forEach(company => {
                const option = document.createElement('option');
                option.value = company.id;
                option.textContent = company.nom;
                companySelect.appendChild(option);
            });
            console.log(`${companies.length} entreprises ajoutées au sélecteur.`);
        } else {
            console.warn('Aucune entreprise disponible dans state.companies');
        }
    }

    // 2. Champ de site avec suggestions dynamiques (datalist)
    const siteInput = document.getElementById('editrow-site');
    const siteDatalist = document.getElementById('site-suggestions');
    
    if (siteInput && siteDatalist) {
        // Vider les suggestions existantes
        siteDatalist.innerHTML = '';
        
        // Charger les sites depuis les plannings de l'utilisateur
        const userSites = await loadUserSites();
        
        if (userSites.length > 0) {
            userSites.forEach(site => {
                const option = document.createElement('option');
                option.value = site;
                siteDatalist.appendChild(option);
            });
            console.log(`${userSites.length} sites utilisateur ajoutés comme suggestions.`);
        } else {
            console.log('Aucun site utilisateur trouvé, champ libre uniquement.');
        }
    }
}

/**
 * Remplit le menu EditRow avec les données d'un shift
 */
function fillEditRowWithData(shift) {
    const companySelect = document.getElementById('editrow-company');
    const hoursInput = document.getElementById('editrow-hours');
    const siteSelect = document.getElementById('editrow-site');
    const kmInput = document.getElementById('editrow-km');
    const nightSwitch = document.getElementById('editrow-is-night');

    // Correction : vérifier si entreprise_id existe et n'est pas 'repos'
    if (companySelect) {
        if (shift.entreprise_id && shift.entreprise_id !== 'repos') {
            companySelect.value = shift.entreprise_id;
        } else {
            companySelect.value = 'repos';
        }
    }
    
    if (hoursInput) hoursInput.value = shift.horaire_saisi || '';
    if (siteSelect) siteSelect.value = shift.site || '';
    if (kmInput) kmInput.value = shift.km || '';
    if (nightSwitch) nightSwitch.checked = shift.is_night || false;

    updateEditRowSwitchText();
}

/**
 * Réinitialise le menu EditRow
 */
function resetEditRow() {
    const companySelect = document.getElementById('editrow-company');
    const hoursInput = document.getElementById('editrow-hours');
    const siteSelect = document.getElementById('editrow-site');
    const kmInput = document.getElementById('editrow-km');
    const nightSwitch = document.getElementById('editrow-is-night');

    if (companySelect) companySelect.value = '';
    if (hoursInput) hoursInput.value = '';
    if (siteSelect) siteSelect.value = '';
    if (kmInput) kmInput.value = '';
    if (nightSwitch) nightSwitch.checked = false;

    updateEditRowSwitchText();
}

/**
 * Ferme le menu EditRow
 */
window.closeEditRow = function() {
    const menu = document.getElementById('editrow-menu');
    if (menu) {
        menu.classList.add('hidden');
    }
};

/**
 * Met à jour le texte du switch EditRow
 */
window.updateEditRowSwitchText = function() {
    const isNight = document.getElementById('editrow-is-night')?.checked;
    const switchText = document.querySelector('#editrow-is-night + .editrow-slider .editrow-switch-text');
    if (switchText) {
        switchText.textContent = isNight ? 'Nuit' : 'Jour';
    }
};

/**
 * Sauvegarde les données du menu EditRow
 */
window.saveEditRow = async function () {
    try {
        console.log('saveEditRow - Début de la fonction');

        const menu = document.getElementById('editrow-menu');
        const dayNumber = parseInt(menu?.getAttribute('data-current-day'));

        if (!dayNumber || !PlanningState.currentPlanning?.id) {
            console.error('saveEditRow - Données manquantes', { dayNumber, planningId: PlanningState.currentPlanning?.id });
            return;
        }

        // 1. Récupération des valeurs (avec les IDs corrects de ton HTML)
        const companyId = document.getElementById('editrow-company')?.value;
        const hours = document.getElementById('editrow-hours')?.value;
        const site = document.getElementById('editrow-site')?.value;
        const km = document.getElementById('editrow-km')?.value || '0';
        const isNight = document.getElementById('editrow-is-night')?.checked; // ID corrigé ici

        // 2. Préparation de la date ISO stable
        const dateISO = `${PlanningState.currentYear}-${String(PlanningState.currentMonth).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;

        // 3. Construction de l'objet shiftData
        const shiftData = {
            planning_id: PlanningState.currentPlanning.id,
            entreprise_id: companyId === 'repos' || !companyId ? null : companyId,
            date_jour: dateISO,
            horaire_saisi: hours,
            site: site,
            km: parseFloat(km) || 0,
            is_night: !!isNight,
            user_id: state.user.id,
            type_jour: isNight ? 'Nuit' : 'Jour',
            is_ferie: false
        };

        const dayData = PlanningState.days.find(d => d.day === dayNumber);

        // 4. Gestion de l'ID pour éviter le conflit (Conflict 409)
        // Si on a un ID de shift en local, on l'ajoute pour forcer l'UPDATE par l'upsert
        if (dayData?.shift?.id) {
            shiftData.id = dayData.shift.id;
        }

        console.log('saveEditRow - Opération Upsert sur:', shiftData);

        // 5. Utilisation de UPSERT au lieu de IF/ELSE (plus robuste)
        const { data, error } = await _supabase
            .from('shifts')
            .upsert(shiftData, {
                onConflict: 'planning_id, date_jour'
            })
            .select()
            .single();

        if (error) throw error;

        // 6. Mise à jour de l'état local et de l'UI (tes fonctions d'origine)
        const currentDayData = PlanningState.days.find(d => d.day === dayNumber);
        if (currentDayData) {
            currentDayData.shift = data;
            updateDayDisplayNew(currentDayData);
        }
        updatePlanningStats();
        closeEditRow();

        console.log('saveEditRow - Sauvegarde terminée avec succès');

    } catch (error) {
        console.error('saveEditRow - Erreur:', error);
        alert('Erreur lors de la sauvegarde : ' + (error.message || 'Erreur inconnue'));
    }
};







/**
 * Sauvegarde les données de la modale (ancienne fonction - obsolète)
 * @deprecated Utiliser saveEditRow() à la place
 */
window.saveDayModal = async function() {
    console.warn('saveDayModal est obsolète, utilisation de saveEditRow');
    // Rediriger vers la nouvelle fonction si possible
    alert('Cette fonction est obsolète. Veuillez utiliser le menu EditRow.');
};

/**
 * Calcule et affiche les statistiques du planning
 */
function updatePlanningStats() {
    try {
        let totalHours = 0;
        let totalKM = 0;
        let totalSalary = 0;
        let workedDays = 0;
        let uniqueCompanies = new Set();

        PlanningState.days.forEach(dayData => {
            if (dayData.shift && dayData.shift.entreprise_id) {
                // Calculer les heures
                if (dayData.shift.horaire_saisi) {
                    totalHours += parseHoursText(dayData.shift.horaire_saisi);
                }
                
                // Ajouter les KM
                totalKM += dayData.shift.km || 0;
                
                // Calculer le salaire
                const company = PlanningState.companies.find(c => c.id === dayData.shift.entreprise_id);
                if (company) {
                    const dayHours = parseHoursText(dayData.shift.horaire_saisi);
                    totalSalary += dayHours * (company.taux_horaire_brut || 0);
                    uniqueCompanies.add(company.id);
                }
                
                workedDays++;
            }
        });

        // Mettre à jour l'affichage avec les nouveaux IDs
        const hoursEl = document.getElementById('stat-hours');
        const salaryEl = document.getElementById('stat-salary');
        const kmEl = document.getElementById('stat-km');
        const daysEl = document.getElementById('stat-days');
        const companiesEl = document.getElementById('stat-companies');

        if (hoursEl) hoursEl.textContent = formatHours(totalHours);
        if (salaryEl) salaryEl.textContent = `${totalSalary.toFixed(2)}€`;
        if (kmEl) kmEl.textContent = `${totalKM} km`;
        if (daysEl) daysEl.textContent = `${workedDays}/${PlanningState.days.length}`;
        if (companiesEl) companiesEl.textContent = uniqueCompanies.size;

    } catch (error) {
        console.error('Erreur updatePlanningStats:', error);
    }
}

/**
 * Analyse le texte des heures (ex: "19h-07h")
 */
function parseHoursText(hoursText) {
    if (!hoursText) return 0;
    
    const match = hoursText.match(/(\d+)h-(\d+)h/);
    if (!match) return 0;
    
    let start = parseInt(match[1]);
    let end = parseInt(match[2]);
    
    // Gérer les shifts de nuit (ex: 19h-07h)
    if (end < start) {
        end += 24;
    }
    
    return end - start;
}

/**
 * Formate les heures pour l'affichage
 */
function formatHours(hours) {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}h${m > 0 ? m : ''}`;
}

// --- GESTION DES 3 DERNIERS PLANNINGS ---

/**
 * Charge les 3 derniers plannings
 */
window.loadRecentPlannings = async function() {
    try {
        const { data, error } = await _supabase
            .from('plannings')
            .select('*')
            .eq('user_id', state.user.id)
            .order('created_at', { ascending: false })
            .limit(3);

        if (!error && data) {
            displayRecentPlannings(data);
        }
    } catch (error) {
        console.error('Erreur loadRecentPlannings:', error);
    }
};

/**
 * Affiche les 3 cases de planning récent
 * Disposition : plus récent à droite (case 3), moins récent à gauche (case 1)
 * Vérifie si les plannings existent toujours et met à jour les cases vides
 */
function displayRecentPlannings(plannings) {
    // Inverser l'ordre pour que le plus récent soit à droite
    const reversedPlannings = [...plannings].reverse();
    
    for (let i = 1; i <= 3; i++) {
        const monthEl = document.getElementById(`planning-month-${i}`);
        const yearEl = document.getElementById(`planning-year-${i}`);
        const boxEl = document.getElementById(`planning-box-${i}`);
        
        if (reversedPlannings[i - 1]) {
            const planning = reversedPlannings[i - 1];
            if (monthEl) monthEl.innerText = planning.month_name || '--';
            if (yearEl) yearEl.innerText = planning.year || '----';
            if (boxEl) {
                boxEl.classList.remove('empty');
                boxEl.setAttribute('data-planning-id', planning.id);
                // S'assurer que le onclick pointe vers la bonne fonction
                boxEl.onclick = () => loadRecentPlanning(i);
            }
        } else {
            // Case vide - proposer la création d'un nouveau planning
            if (monthEl) monthEl.innerText = '--';
            if (yearEl) yearEl.innerText = '----';
            if (boxEl) {
                boxEl.classList.add('empty');
                boxEl.removeAttribute('data-planning-id');
                // Garder le onclick pour créer un nouveau planning
                boxEl.onclick = () => loadRecentPlanning(i);
            }
        }
    }
}

/**
 * Supprime le planning actuel et retourne au menu principal
 */
window.deleteCurrentPlanning = async function() {
    try {
        if (!PlanningState.currentPlanning?.id) {
            console.error('Aucun planning à supprimer');
            return;
        }

        // Supprimer tous les shifts associés au planning
        const { error: shiftsError } = await _supabase
            .from('shifts')
            .delete()
            .eq('planning_id', PlanningState.currentPlanning.id);

        if (shiftsError) {
            console.error('Erreur suppression shifts:', shiftsError);
        }

        // Supprimer le planning lui-même
        const { error: planningError } = await _supabase
            .from('plannings')
            .delete()
            .eq('id', PlanningState.currentPlanning.id);

        if (planningError) {
            console.error('Erreur suppression planning:', planningError);
            alert('Erreur lors de la suppression du planning');
            return;
        }

        // Réinitialiser l'état
        PlanningState.currentPlanning = null;
        PlanningState.currentMonth = null;
        PlanningState.currentYear = null;
        PlanningState.days = [];
        state.currentPlanning = null;

        // Retourner au menu principal
        showView('menu-view');
        
        // Recharger les plannings récents avec la bonne disposition
        await loadRecentPlannings();

    } catch (error) {
        console.error('Erreur deleteCurrentPlanning:', error);
        alert('Une erreur est survenue lors de la suppression');
    }
};

/**
 * Réinitialise le planning actuel (supprime tous les shifts mais garde le planning)
 */
window.resetCurrentPlanning = async function() {
    try {
        if (!PlanningState.currentPlanning?.id) {
            console.error('Aucun planning à réinitialiser');
            return;
        }

        // Supprimer tous les shifts associés au planning
        const { error } = await _supabase
            .from('shifts')
            .delete()
            .eq('planning_id', PlanningState.currentPlanning.id);

        if (error) {
            console.error('Erreur réinitialisation shifts:', error);
            alert('Erreur lors de la réinitialisation du planning');
            return;
        }

        // Réinitialiser l'état local des jours
        PlanningState.days.forEach(dayData => {
            dayData.shift = null;
            updateDayDisplay(dayData);
        });

        // Mettre à jour les statistiques
        updatePlanningStats();

        console.log('Planning réinitialisé avec succès');

    } catch (error) {
        console.error('Erreur resetCurrentPlanning:', error);
        alert('Une erreur est survenue lors de la réinitialisation');
    }
};

/**
 * Actualise tous les éléments du menu principal
 */
async function refreshMainMenu() {
    try {
        // 1. Réinitialiser l'état des plannings
        resetPlanningState();
        
        // 2. Actualiser les plannings récents avec vérification
        await loadRecentPlannings();
        
        // 3. Réinitialiser le formulaire de création de planning
        resetPlanningCreationForm();
        
        // 4. Actualiser les entreprises (si nécessaire)
        if (typeof loadCompanies === 'function') {
            await loadCompanies();
            if (typeof renderCompaniesUI === 'function') {
                renderCompaniesUI();
            }
        }
        
        // 5. Fermer toute modale ouverte
        closeAllModals();
        
        // 6. S'assurer que tous les boutons sont correctement configurés
        ensureButtonsReady();
        
        console.log('Menu principal actualisé avec succès');
        
    } catch (error) {
        console.error('Erreur refreshMainMenu:', error);
    }
}

/**
 * Réinitialise l'état des plannings pour éviter les plannings vides
 */
function resetPlanningState() {
    try {
        // Réinitialiser l'état global
        PlanningState.currentPlanning = null;
        PlanningState.currentMonth = null;
        PlanningState.currentYear = null;
        PlanningState.days = [];
        state.currentPlanning = null;
        
        console.log('État des plannings réinitialisé');
        
    } catch (error) {
        console.error('Erreur resetPlanningState:', error);
    }
}

/**
 * S'assure que tous les boutons du menu principal sont prêts à l'usage
 */
function ensureButtonsReady() {
    try {
        // Vérifier les 3 cases de plannings récents
        for (let i = 1; i <= 3; i++) {
            const boxEl = document.getElementById(`planning-box-${i}`);
            if (boxEl) {
                const planningId = boxEl.getAttribute('data-planning-id');
                
                if (planningId) {
                    // S'assurer que le onclick pointe vers loadRecentPlanning
                    boxEl.onclick = () => loadRecentPlanning(i);
                    boxEl.classList.remove('empty');
                } else {
                    // Case vide - s'assurer qu'elle propose la création
                    boxEl.onclick = () => loadRecentPlanning(i);
                    boxEl.classList.add('empty');
                }
            }
        }
        
        // Vérifier le bouton "Liste des plannings"
        const listButton = document.querySelector('.btn-planning-list');
        if (listButton) {
            listButton.onclick = togglePlanningList;
        }
        
        // NE PAS toucher au bouton "Créer un nouveau planning" 
        // Il a déjà le bon onclick dans le HTML et ne doit pas être modifié
        
        console.log('Boutons du menu principal vérifiés et prêts');
        
    } catch (error) {
        console.error('Erreur ensureButtonsReady:', error);
    }
}

/**
 * Réinitialise le formulaire de création de planning
 */
function resetPlanningCreationForm() {
    try {
        // Réinitialiser les sélecteurs de mois et année
        const monthSelect = document.getElementById('setup-month-select');
        const yearSelect = document.getElementById('setup-year-select');
        
        if (monthSelect && yearSelect) {
            // Vider les sélecteurs
            monthSelect.innerHTML = '';
            yearSelect.innerHTML = '';
            
            // Obtenir la date actuelle
            const currentDate = new Date();
            const currentMonth = currentDate.getMonth() + 1;
            const currentYear = currentDate.getFullYear();
            
            // Régénérer les options de mois
            for (let i = 0; i < 12; i++) {
                const monthIndex = (currentMonth + i) % 12;
                const monthValue = monthIndex + 1;
                monthSelect.innerHTML += `<option value="${monthValue}">${MONTHS[monthIndex]}</option>`;
            }
            
            // Régénérer les options d'année
            for (let i = 0; i < 4; i++) {
                yearSelect.innerHTML += `<option value="${currentYear + i}">${currentYear + i}</option>`;
            }
            
            // Sélectionner les valeurs par défaut
            monthSelect.selectedIndex = 0;
            yearSelect.selectedIndex = 0;
        }
        
        // Masquer la section de setup si elle est visible
        const setupSection = document.getElementById('setup-planning-section');
        if (setupSection) {
            setupSection.classList.add('hidden');
        }
        
    } catch (error) {
        console.error('Erreur resetPlanningCreationForm:', error);
    }
}

/**
 * Ferme toutes les modales ouvertes
 */
function closeAllModals() {
    try {
        // Fermer la modale de liste des plannings
        const planningListModal = document.getElementById('planning-list-modal');
        if (planningListModal) {
            planningListModal.classList.add('hidden');
        }
        
        // Fermer la modale d'édition de jour
        const dayModal = document.getElementById('day-modal');
        if (dayModal) {
            dayModal.classList.add('hidden');
        }
        
        // Fermer le side-drawer mobile
        const sideDrawer = document.getElementById('side-drawer');
        if (sideDrawer) {
            sideDrawer.classList.remove('open');
        }
        
        // Fermer l'overlay du drawer
        const drawerOverlay = document.getElementById('drawer-overlay');
        if (drawerOverlay) {
            drawerOverlay.classList.add('hidden');
        }
        
    } catch (error) {
        console.error('Erreur closeAllModals:', error);
    }
}

/**
 * Retourne au menu principal avec rechargement complet (équivalent F5)
 */
window.backToMainMenu = function() {
    try {
        // Recharger complètement la page (équivalent F5)
        location.reload();
        
    } catch (error) {
        console.error('Erreur backToMainMenu:', error);
        // Fallback : rechargement forcé si location.reload() échoue
        window.location.href = window.location.href;
    }
};

/**
 * Partage le planning actuel
 */
window.sharePlanning = function() {
    try {
        if (!PlanningState.currentPlanning) {
            alert('Aucun planning à partager');
            return;
        }

        // Créer un lien de partage (URL actuelle avec ID du planning)
        const shareUrl = `${window.location.origin}${window.location.pathname}?planning=${PlanningState.currentPlanning.id}`;
        
        // Copier dans le presse-papiers
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(shareUrl).then(() => {
                alert('Lien de planning copié dans le presse-papiers !\n\n' + shareUrl);
            }).catch(err => {
                console.error('Erreur copie:', err);
                // Fallback si clipboard ne fonctionne pas
                prompt('Copiez ce lien pour partager votre planning:', shareUrl);
            });
        } else {
            // Fallback pour anciens navigateurs
            prompt('Copiez ce lien pour partager votre planning:', shareUrl);
        }

    } catch (error) {
        console.error('Erreur sharePlanning:', error);
        alert('Une erreur est survenue lors du partage');
    }
};

/**
 * Affiche la confirmation de suppression (remplace showDeleteConfirm)
 */
window.showDeleteConfirm = function() {
    if (confirm('Êtes-vous sûr de vouloir supprimer ce planning ? Cette action est irréversible.')) {
        deleteCurrentPlanning();
    }
};

/**
 * Bascule l'affichage de la liste des plannings
 */
window.togglePlanningList = async function() {
    const modal = document.getElementById('planning-list-modal');
    
    if (modal.classList.contains('hidden')) {
        // Afficher la modale et charger tous les plannings
        await loadAllPlannings();
        modal.classList.remove('hidden');
    } else {
        // Cacher la modale
        modal.classList.add('hidden');
    }
};

/**
 * Charge tous les plannings de l'utilisateur avec tri par date logique
 */
async function loadAllPlannings() {
    try {
        const { data: plannings, error } = await _supabase
            .from('plannings')
            .select('*')
            .eq('user_id', state.user.id)
            .order('year', { ascending: true })
            .order('month_name', { ascending: true });

        if (error) {
            console.error('Erreur chargement tous plannings:', error);
            return;
        }

        // Trier par date logique par rapport à la date actuelle
        const sortedPlannings = sortPlanningsByLogicalDate(plannings || []);
        
        // Afficher la liste
        displayPlanningList(sortedPlannings);

    } catch (error) {
        console.error('Erreur loadAllPlannings:', error);
    }
}

/**
 * Trie les plannings par ordre logique de date par rapport à la date actuelle
 */
function sortPlanningsByLogicalDate(plannings) {
    const currentDate = new Date();
    
    return plannings.sort((a, b) => {
        // Créer des objets date pour comparaison
        const dateA = new Date(a.year, MONTHS.indexOf(a.month_name), 1);
        const dateB = new Date(b.year, MONTHS.indexOf(b.month_name), 1);
        
        // Calculer la distance par rapport à la date actuelle
        const distanceA = Math.abs(dateA - currentDate);
        const distanceB = Math.abs(dateB - currentDate);
        
        // Si les distances sont égales, trier par date (plus récent d'abord)
        if (distanceA === distanceB) {
            return dateB - dateA;
        }
        
        // Sinon, trier par distance (plus proche d'abord)
        return distanceA - distanceB;
    });
}

/**
 * Affiche la liste de tous les plannings dans la modale
 */
function displayPlanningList(plannings) {
    const listContainer = document.getElementById('planning-list-container');
    
    if (!listContainer) return;
    
    listContainer.innerHTML = '';
    
    if (plannings.length === 0) {
        listContainer.innerHTML = '<p class="no-plannings">Aucun planning trouvé</p>';
        return;
    }
    
    plannings.forEach(planning => {
        const planningItem = document.createElement('div');
        planningItem.className = 'planning-item';
        planningItem.onclick = () => openPlanningFromList(planning.id);
        
        planningItem.innerHTML = `
            <div class="planning-item-info">
                <div class="planning-item-month">${planning.month_name}</div>
                <div class="planning-item-year">${planning.year}</div>
            </div>
            <div class="planning-item-arrow">→</div>
        `;
        
        listContainer.appendChild(planningItem);
    });
}

/**
 * Ouvre un planning depuis la liste
 */
async function openPlanningFromList(planningId) {
    try {
        // Charger le planning
        const { data, error } = await _supabase
            .from('plannings')
            .select('*')
            .eq('id', planningId)
            .single();
        
        if (error || !data) {
            console.error('Erreur chargement planning:', error);
            return;
        }

        // Mettre à jour l'état
        PlanningState.currentPlanning = data;
        PlanningState.currentMonth = MONTHS.indexOf(data.month_name) + 1;
        PlanningState.currentYear = data.year;
        state.currentPlanning = data;

        // Navigation
        showView('planning-view');
        
        // Titre
        const titleEl = document.getElementById('current-planning-title');
        if (titleEl) {
            titleEl.innerText = `${data.month_name} ${data.year}`.toUpperCase();
        }
        
        // Générer le calendrier
        await generateCalendar();
        
        // Fermer la modale
        togglePlanningList();

    } catch (error) {
        console.error('Erreur openPlanningFromList:', error);
    }
}

/**
 * Charge un planning récent spécifique
 * Si aucun planning n'est lié à la case, propose d'en créer un nouveau
 */
window.loadRecentPlanning = async function(boxNumber) {
    try {
        const boxEl = document.getElementById(`planning-box-${boxNumber}`);
        const planningId = boxEl?.getAttribute('data-planning-id');
        
        if (!planningId) {
            // Aucun planning lié à cette case, proposer d'en créer un nouveau
            showView('setup-planning-view');
            return;
        }
        
        // Charger le planning
        const { data, error } = await _supabase
            .from('plannings')
            .select('*')
            .eq('id', planningId)
            .single();
        
        if (error || !data) {
            console.error('Erreur chargement planning:', error);
            return;
        }

        // Mettre à jour l'état
        PlanningState.currentPlanning = data;
        PlanningState.currentMonth = MONTHS.indexOf(data.month_name) + 1;
        PlanningState.currentYear = data.year;
        state.currentPlanning = data;

        // Navigation
        showView('planning-view');
        
        // Titre
        const titleEl = document.getElementById('current-planning-title');
        if (titleEl) {
            titleEl.innerText = `${data.month_name} ${data.year}`.toUpperCase();
        }
        
        // Générer le calendrier
        await generateCalendar();

    } catch (error) {
        console.error('Erreur loadRecentPlanning:', error);
    }
};
