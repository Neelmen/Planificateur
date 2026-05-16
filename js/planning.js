// --- planning.js ---
// État global du planning
const PlanningState = {
    currentPlanning: null,
    currentMonth: null,
    currentYear: null,
    days: [],
    companies: [],
    isLoading: false
};
let internalClipboard = null; // Cache pour les données du shift
let hoveredDayNum = null;    // Jour actuellement survolé

/**
 * Initialise le nouveau planning après le clic sur "Continuer"
 */
window.startPlanningCreation = async function () {

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

        showView('planning-view');

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
        

    } catch (error) {
        console.error('Erreur génération calendrier:', error);
    }
    await loadPlanningData();
    updatePlanningStats();

}


function getCellHours(dayData) {
    const hours = dayData.shift?.horaire_saisi;
    return hours ? formatTo24h(hours) : '';
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

    // Header systématique pour l'alignement vertical des blocs entre eux
    const header = document.createElement('div');
    header.className = 'week-header';
    header.textContent = `Semaine ${weekNumber}`;
    weekBlock.appendChild(header);

    const weekContent = document.createElement('div');
    weekContent.className = 'week-content';

    const daySlots = new Array(7).fill(null);
    weekDays.forEach(dayData => {
        const date = new Date(dayData.date);
        let dayIndex = date.getDay();
        dayIndex = (dayIndex === 0) ? 6 : dayIndex - 1;
        daySlots[dayIndex] = dayData;
    });

    daySlots.forEach((dayData) => {
        if (dayData) {
            weekContent.appendChild(createCompactDayRow(dayData));
        } else {
            const ghostRow = document.createElement('div');
            // On utilise EXACTEMENT les mêmes classes de structure
            ghostRow.className = 'day-row grid-layout is-empty';

            // On remplit avec du vide structurel pour forcer la hauteur de la grille
            ghostRow.innerHTML = `
                <div class="grid-cell cell-1">&nbsp;</div>
                <div class="grid-cell cell-2">&nbsp;</div>
                <div class="grid-cell cell-3">&nbsp;</div>
                <div class="grid-cell cell-5">&nbsp;</div>
                <div class="grid-cell cell-7-8">&nbsp;</div>
            `;
            weekContent.appendChild(ghostRow);
        }
    });

    weekBlock.appendChild(weekContent);
    return weekBlock;
}
function createCompactDayRow(dayData) {
    const dayRow = document.createElement('div');
    dayRow.className = 'day-row grid-layout';
    dayRow.setAttribute('data-day', dayData.day);

    // Détecter quelle ligne est survolée pour le Ctrl+C / Ctrl+V
    dayRow.addEventListener('mouseenter', () => hoveredDayNum = dayData.day);
    dayRow.addEventListener('mouseleave', () => hoveredDayNum = null);

    if (dayData.dayOfWeek === 5 || dayData.dayOfWeek === 6) {
        dayRow.classList.add('weekend');
    }

    // Positionnement dynamique
    const rowIndex = getGridRowIndex(dayData.date);
    dayRow.style.gridRow = rowIndex;
    // Identification pour le debug
    dayRow.setAttribute('data-day-index', rowIndex);

    const dayNames = ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM'];
    const dayName = dayNames[dayData.dayOfWeek] || '???';

    // --- LOGIQUE DE FILTRAGE STRICTE ---
    const isNight = dayData.shift?.is_night || false;
    const isCompany = dayData.shift?.entreprise_id && dayData.shift.entreprise_id !== 'repos';

    // On n'extrait les données que si c'est une entreprise, sinon on force le vide[cite: 1]
    const displayContent = getCellContent(dayData);
    const displayHours = isCompany ? getCellHours(dayData) : '';
    const displaySite = isCompany ? (dayData.shift?.site || '') : '';
    const kmValue = dayData.shift?.km;
    const displayKm = (isCompany && kmValue > 0) ? `${kmValue} km` : '';

    // Détermination des classes (uniquement si entreprise)[cite: 1]
    const nightClass = (isNight && isCompany) ? 'night-mode' : (isCompany ? 'day-mode' : '');
    const backgroundClass = (isCompany && isNight) ? 'night-background' : (isCompany ? 'day-background' : '');

    dayRow.innerHTML = `
        <div class="grid-cell cell-1">${String(dayData.day).padStart(2, '0')}</div>
        <div class="grid-cell cell-2 ${nightClass}">${displayContent}</div>
        <div class="grid-cell cell-3 ${nightClass}">${displayHours}</div>
        <div class="grid-cell cell-4 ${nightClass}">${displayKm}</div>
        <div class="grid-cell cell-5">${dayName}</div>
        <div class="grid-cell cell-6"></div>
        <div class="grid-cell cell-7-8 ${nightClass}">${displaySite}</div>
    `;

    // Reset et application des styles propres[cite: 1, 3]
    dayRow.style.borderLeft = '4px solid transparent';
    if (backgroundClass) {
        dayRow.classList.add(backgroundClass);
    }

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

    // 1. Logique métier
    const isCompany = dayData.shift?.entreprise_id && dayData.shift.entreprise_id !== 'repos';
    const isNight = dayData.shift?.is_night || false;
    const company = isCompany ? state.companies.find(c => String(c.id) === String(dayData.shift?.entreprise_id)) : null;

    // 2. Préparation des données
    const dayNames = ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM'];
    const dayName = dayNames[dayData.dayOfWeek] || '???';

    const displayContent = getCellContent(dayData);
    const displayHours = isCompany ? getCellHours(dayData) : '';
    const displaySite = isCompany ? (dayData.shift?.site || '') : '';
    const kmValue = dayData.shift?.km || 0;
    const displayKm = (isCompany && kmValue > 0) ? `${kmValue} km` : '';

    // Classes CSS
    const nightClass = (isNight && isCompany) ? 'night-mode' : (isCompany ? 'day-mode' : '');
    const backgroundClass = (isCompany && isNight) ? 'night-background' : (isCompany ? 'day-background' : '');

    // 3. Mise à jour du DOM
    dayRow.className = `day-row grid-layout ${dayData.dayOfWeek >= 5 ? 'weekend' : ''}`;

    dayRow.innerHTML = `
        <div class="grid-cell cell-1">${String(dayData.day).padStart(2, '0')}</div>
        <div class="grid-cell cell-2 ${nightClass}">${displayContent}</div>
        <div class="grid-cell cell-3 ${nightClass}">${displayHours}</div>
        <div class="grid-cell cell-4 ${nightClass}">${displayKm}</div>
        <div class="grid-cell cell-5">${dayName}</div>
        <div class="grid-cell cell-6"></div>
        <div class="grid-cell cell-7-8 ${nightClass}">${displaySite}</div>
    `;

    // 4. Reset et Application des styles de bordure (Couleur entreprise)
    dayRow.style.borderLeft = '4px solid transparent';
    if (isCompany && company) {
        dayRow.classList.add('has-work');
        if (company.couleur_hex) {
            dayRow.style.borderLeft = `4px solid ${company.couleur_hex}`;
        }
        if (backgroundClass) {
            dayRow.classList.add(backgroundClass);
        }
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
        const menu = document.getElementById('editrow-menu');
        const dayNumber = parseInt(menu?.getAttribute('data-current-day'));

        if (!dayNumber || !PlanningState.currentPlanning?.id) return;

        const companyId = document.getElementById('editrow-company')?.value;
        const hours = document.getElementById('editrow-hours')?.value;
        const site = document.getElementById('editrow-site')?.value;
        const km = document.getElementById('editrow-km')?.value || '0';
        const isNight = document.getElementById('editrow-is-night')?.checked;

        const dateISO = `${PlanningState.currentYear}-${String(PlanningState.currentMonth).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;

        const shiftData = {
            planning_id: PlanningState.currentPlanning.id,
            entreprise_id: (companyId === 'repos' || !companyId) ? null : companyId,
            date_jour: dateISO,
            horaire_saisi: hours,
            site: site,
            km: parseFloat(km) || 0,
            is_night: !!isNight,
            user_id: state.user.id,
            is_ferie: false
        };

        const dayData = PlanningState.days.find(d => d.day === dayNumber);
        if (dayData?.shift?.id) {
            shiftData.id = dayData.shift.id;
        }

        const { data, error } = await _supabase
            .from('shifts')
            .upsert(shiftData, { onConflict: 'planning_id, date_jour' })
            .select()
            .single();

        if (error) throw error;

        if (dayData) {
            dayData.shift = data;
            updateDayDisplayNew(dayData);
        }

        updatePlanningStats();
        closeEditRow();

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
/**
 * Calcule et affiche les statistiques du planning dans la barre d'infos Discord
 */
function updatePlanningStats() {
    console.log("Mise à jour des statistiques du planning...");

    try {
        // --- 1. INITIALISATION DES COMPTEURS ---
        let totalHours = 0;
        let totalKm = 0;
        let totalGrossSalary = 0;
        let workedDays = 0;
        let uniqueCompanies = new Set();

        // --- 2. CALCULS VIA LES DONNÉES DU PLANNING ---
        if (!PlanningState.days || PlanningState.days.length === 0) {
            console.warn("Aucun jour trouvé dans PlanningState pour calculer les stats.");
        }

        PlanningState.days.forEach(day => {
            const shift = day.shift;

            // On ne calcule que si c'est une entreprise et pas un repos
            if (shift && shift.entreprise_id && shift.entreprise_id !== 'repos') {

                // Calcul du temps de travail
                const hours = parseHoursText(shift.horaire_saisi || "0");
                totalHours += hours;

                // Identification de l'entreprise pour le salaire
                const company = state.companies.find(c => String(c.id) === String(shift.entreprise_id));
                if (company) {
                    uniqueCompanies.add(company.id);
                    if (company.taux_horaire_brut) {
                        totalGrossSalary += (hours * company.taux_horaire_brut);
                    }
                }

                // Kilométrage
                totalKm += parseFloat(shift.km || 0);

                // Incrément des jours travaillés
                workedDays++;
            }
        });

        // --- 3. LOGIQUE FINANCIÈRE ET TEMPS ---
        const totalNetSalary = totalGrossSalary * 0.77; // Ratio Brut -> Net
        const totalDaysInMonth = PlanningState.days.length;
        const restDays = totalDaysInMonth - workedDays;

        // --- 4. MISE À JOUR DU DOM (AFFICHAGE) ---

        // HEURES (Formatage h/min)
        const hoursEl = document.getElementById('stat-hours');
        if (hoursEl) {
            const h = Math.floor(totalHours);
            const m = Math.round((totalHours - h) * 60);
            hoursEl.textContent = m > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${h}h`;
        }

        // SALAIRE NET (Arrondi à l'euro supérieur)
        const salaryEl = document.getElementById('stat-salary');
        if (salaryEl) {
            salaryEl.textContent = `${Math.ceil(totalNetSalary)}€`;
        }

        // KILOMÉTRAGE
        const kmEl = document.getElementById('stat-km');
        if (kmEl) {
            kmEl.textContent = `${totalKm.toFixed(0)} km`;
        }

        // JOURS TRAVAILLÉS
        const daysEl = document.getElementById('stat-days');
        if (daysEl) {
            daysEl.textContent = `${workedDays}/${totalDaysInMonth}`;
        }

        // JOURS DE REPOS (Nouvel élément)
        const restEl = document.getElementById('stat-rest-days');
        if (restEl) {
            restEl.textContent = `${restDays}/${totalDaysInMonth}`;
        }

        // NOMBRE D'ENTREPRISES DIFFÉRENTES
        const companiesEl = document.getElementById('stat-companies');
        if (companiesEl) {
            companiesEl.textContent = uniqueCompanies.size;
        }

        console.log(`Stats calculées : ${workedDays}j travaillés, ${restDays}j repos, ${totalHours}h totales.`);

    } catch (error) {
        console.error('Erreur critique dans updatePlanningStats:', error);
    }
}

/**
 * Analyse le texte des heures (ex: "19h-07h")
 */
/**
 * Analyse de manière ultra-flexible le texte des heures (ex: "07h-19h", "7pm-7am", "07:30-15:45")
 */
function parseHoursText(hoursText) {
    if (!hoursText) return 0;

    // Nettoyage et séparation du début et de la fin (gère -, /, " à ", etc.)
    const parts = hoursText.toLowerCase().split(/[-/]|(?:\s+à\s+)/);

    const parsePart = (str) => {
        if (!str) return null;
        // Extrait les nombres et le modificateur am/pm
        const match = str.match(/(\d+)(?:[h:/\s](\d+))?\s*(am|pm)?/);
        if (!match) return null;

        let hours = parseInt(match[1]);
        let minutes = parseInt(match[2] || 0);
        const meridian = match[3];

        // Conversion AM/PM
        if (meridian === 'pm' && hours < 12) hours += 12;
        if (meridian === 'am' && hours === 12) hours = 0;

        return hours + (minutes / 60);
    };

    const start = parsePart(parts[0]);
    const end = parsePart(parts[1]);

    if (start === null) return 0;

    // Si une seule heure est saisie (ex: "7h"), on considère 0h de travail ou on attend la fin
    if (end === null) return 0;

    let duration = end - start;

    // Gestion du passage à minuit (ex: 19h-07h)
    if (duration < 0) {
        duration += 24;
    }

    return duration;
}

/**
 * Formate les heures pour l'affichage
 */
function formatHours(hours) {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}h${m > 0 ? String(m).padStart(2, '0') : ''}`;
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
window.deletePlanning = function () {
    const planningId = PlanningState.currentPlanning?.id;
    if (!planningId) return console.error('Aucun planning à supprimer');

    const modal = document.getElementById('confirm-modal');
    modal.classList.remove('hidden');

    // On définit l'action du bouton de confirmation directement ici
    document.getElementById('confirm-delete-btn').onclick = async () => {
        try {
            // 1. Suppression Shifts + Planning (Supabase gère souvent la cascade, sinon on fait les deux)
            await _supabase.from('shifts').delete().eq('planning_id', planningId);
            await _supabase.from('plannings').delete().eq('id', planningId);

            // 2. Reset de l'état et interface
            Object.assign(PlanningState, { currentPlanning: null, days: [] });
            state.currentPlanning = null;

            modal.classList.add('hidden'); // Ferme la modale
            showView('menu-view');
            await loadRecentPlannings();
        } catch (err) {
            alert('Erreur lors de la suppression');
        }
    };
};

window.closeConfirmModal = () => document.getElementById('confirm-modal').classList.add('hidden');

/**
 * Réinitialise le planning actuel (supprime tous les shifts mais garde le planning)
 */
window.resetPlanning = async function() {
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
// js/planning.js

async function sharePlanning() {
    const captureArea = document.getElementById('capture-area');
    const title = document.getElementById('current-planning-title').innerText;

    if (!captureArea) {
        alert("Erreur : Impossible de trouver la zone de capture.");
        return;
    }

    // Afficher un indicateur de chargement (optionnel mais recommandé)
    const shareBtn = document.querySelector('.action-btn-discord[onclick="sharePlanning()"]');
    const originalText = shareBtn.innerHTML;
    shareBtn.innerHTML = '<span class="icon">⌛</span><span class="label">Génération...</span>';
    shareBtn.style.opacity = '0.7';

    try {
        // 1. html2canvas prend une capture de la zone
        const canvas = await html2canvas(captureArea, {
            backgroundColor: '#36393f', // Force le fond Discord
            scale: 2, // Augmente la qualité pour les écrans Retina
            logging: false,
            useCORS: true, // Nécessaire si tu as des images externes (ex: photos de profil)
        });

        // 2. Convertir le canvas en Blob .webp
        canvas.toBlob(async (blob) => {
            if (!blob) {
                alert("Erreur lors de la génération de l'image.");
                return;
            }

            // 3. Préparer le fichier pour le partage
            const fileName = `${title.replace(/ /g, '_')}.webp`;
            const file = new File([blob], fileName, { type: 'image/webp' });

                // FALLBACK : Télécharger l'image (pour PC)
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = fileName;
                link.click();
                showDiscordToast("Image téléchargée !", '.action-btn-discord[onclick="sharePlanning()"]');
            }, 'image/webp', 0.99); // Qualité de 99%

    } catch (error) {
        console.error("Erreur lors de la capture :", error);
        alert("Désolé, une erreur est survenue lors de la création de l'image.");
    } finally {
        // Restaurer le bouton
        shareBtn.innerHTML = originalText;
        shareBtn.style.opacity = '1';
    }
}

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
/**
 * Service de calcul de segmentation des heures
 * Calcule : Heures Classiques, Nuit (21h-06h), Dimanche, Jours Fériés
 */
const HoursCalculator = {
    // Configuration des constantes
    NIGHT_START: 21, // 21h
    NIGHT_END: 6,    // 06h

    /**
     * Calcule la répartition des heures pour un shift
     * @param {Date} start - Date et heure de début
     * @param {Date} end - Date et heure de fin
     * @param {Array<string>} feries - Liste des dates fériées (format YYYY-MM-DD)
     */
    calculateDistribution(start, end, feries = []) {
        const stats = {
            heuresClassiques: 0,
            heuresNuit: 0,
            heuresDimanche: 0,
            heuresFerie: 0,
            total: 0
        };

        // On avance minute par minute (ou par tranche de 15min pour la performance)
        let current = new Date(start);
        const stepMinutes = 15; // Précision au quart d'heure
        const stepDecimal = stepMinutes / 60;

        while (current < end) {
            const h = current.getHours();
            const dateStr = current.toISOString().split('T')[0];
            const isDimanche = current.getDay() === 0;
            const isFerie = feries.includes(dateStr);
            const isNuit = (h >= this.NIGHT_START || h < this.NIGHT_END);

            // 1. Priorité aux majorations (cumulables ou non selon ta convention)
            if (isFerie) {
                stats.heuresFerie += stepDecimal;
            } else if (isDimanche) {
                stats.heuresDimanche += stepDecimal;
            }

            // 2. Calcul de la nuit (indépendant du jour)
            if (isNuit) {
                stats.heuresNuit += stepDecimal;
            }

            // 3. Heures normales (si ni férié ni dimanche)
            if (!isFerie && !isDimanche && !isNuit) {
                stats.heuresClassiques += stepDecimal;
            }

            stats.total += stepDecimal;
            current.setMinutes(current.getMinutes() + stepMinutes);
        }

        return stats;
    }
};
/**
 * Calcule l'estimation financière basée sur la distribution des heures
 */
function estimateSalary(distribution, company) {
    const { taux_horaire_brut, maj_nuit, maj_dimanche, maj_ferie } = company;

    // Calcul des montants avec multiplicateurs
    const totalBrut =
        (distribution.heuresClassiques * taux_horaire_brut) +
        (distribution.heuresNuit * taux_horaire_brut * (1 + (maj_nuit / 100))) +
        (distribution.heuresDimanche * taux_horaire_brut * (1 + (maj_dimanche / 100))) +
        (distribution.heuresFerie * taux_horaire_brut * (1 + (maj_ferie / 100)));

    return {
        brut: totalBrut.toFixed(2),
        net: (totalBrut * 0.78).toFixed(2) // Estimation rapide net
    };
}
/**
 * Calcule le salaire brut et net basé sur la segmentation horaire
 * @param {Object} stats - Objet contenant (heuresClassiques, heuresNuit, heuresDimanche, heuresFerie)
 * @param {number} tauxHoraireBrut - Taux de base de l'entreprise
 */
function calculateSalaryBreakdown(stats, tauxHoraireBrut) {
    // Définition des coefficients de majoration
    const COEF_NUIT = 1.10;     // +10%
    const COEF_DIMANCHE = 1.10; // +10%
    const COEF_FERIE = 2.00;    // +100% (Heure de base + 100% de majoration)
    const COEF_NET = 0.78;      // Conversion Brut -> Net

    // Calcul du brut par catégorie
    const brutClassique = stats.heuresClassiques * tauxHoraireBrut;
    const brutNuit = stats.heuresNuit * tauxHoraireBrut * COEF_NUIT;
    const brutDimanche = stats.heuresDimanche * tauxHoraireBrut * COEF_DIMANCHE;
    const brutFerie = stats.heuresFerie * tauxHoraireBrut * COEF_FERIE;

    const salaireBrutTotal = brutClassique + brutNuit + brutDimanche + brutFerie;
    const salaireNetTotal = salaireBrutTotal * COEF_NET;

    return {
        brut: salaireBrutTotal.toFixed(2),
        net: salaireNetTotal.toFixed(2),
        details: {
            classique: brutClassique.toFixed(2),
            nuit: brutNuit.toFixed(2),
            dimanche: brutDimanche.toFixed(2),
            ferie: brutFerie.toFixed(2)
        }
    };
}
// Exemple de rendu dans ton composant React/Vue/Svelte
const displaySalaryInfo = (result) => {
    return `
        ### Détails Financiers
        * **Heures normales :** ${result.details.classique}€
        * **Majoration Nuit (10%) :** ${result.details.nuit}€
        * **Majoration Dimanche (10%) :** ${result.details.dimanche}€
        * **Majoration Férié (100%) :** ${result.details.ferie}€
        ---
        * **TOTAL SALAIRE BRUT :** ${result.brut}€
        * **TOTAL SALAIRE NET (0.78) :** ${result.net}€
    `;
};
function formatTo24h(hoursText) {
    if (!hoursText) return '';

    const parts = hoursText.toLowerCase().split(/[-/]|(?:\s+à\s+)/);
    if (parts.length < 2) return hoursText; // Retourne tel quel si pas de séparateur

    const formatPart = (str) => {
        const match = str.match(/(\d+)(?:[h:/\s](\d+))?/);
        if (!match) return str;

        let hours = match[1].padStart(2, '0');
        let minutes = (match[2] || '00').padStart(2, '0');
        return `${hours}h${minutes}`;
    };

    return `${formatPart(parts[0])}-${formatPart(parts[1])}`;
}
function getGridRowIndex(dateString) {
    const date = new Date(dateString);
    const day = date.getDay(); // 0 (Dimanche) à 6 (Samedi)
    return day === 0 ? 7 : day; // Transforme 0 en 7, sinon garde le chiffre
}
function showDiscordToast(message, targetSelector) {
    const target = document.querySelector(targetSelector);
    if (!target) return;

    // Créer la bulle
    const toast = document.createElement('div');
    toast.className = 'discord-toast';
    toast.innerText = message;

    // L'ajouter au parent du bouton pour qu'elle soit bien positionnée
    target.parentElement.style.position = 'relative';
    target.parentElement.appendChild(toast);

    // Supprimer après 3 secondes
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 200);
    }, 3000);
}

let copiedRowData = null; // Notre "presse-papier" interne
let focusedRowId = null;  // Pour savoir quelle ligne est survolée/cliquée

// 1. Gérer le clic droit sur les lignes
document.addEventListener('contextmenu', (e) => {
    const row = e.target.closest('.day-row');
    if (row) {
        e.preventDefault();
        focusedRowId = row.dataset.id; // On stocke l'ID de la ligne

        const menu = document.getElementById('custom-context-menu');
        menu.style.top = `${e.clientY}px`;
        menu.style.left = `${e.clientX}px`;
        menu.classList.remove('hidden');
    } else {
        document.getElementById('custom-context-menu').classList.add('hidden');
    }
});

// 2. Cacher le menu si on clique ailleurs
document.addEventListener('click', () => {
    document.getElementById('custom-context-menu').classList.add('hidden');
});

// 3. Gérer les raccourcis clavier (Ctrl+C, Ctrl+V)
document.addEventListener('keydown', (e) => {
    // Si on n'est pas sur une ligne, on ne fait rien
    if (!focusedRowId) return;

    if (e.ctrlKey && e.key === 'c') {
        e.preventDefault();
        copyRowData(focusedRowId);
    }
    if (e.ctrlKey && e.key === 'v') {
        e.preventDefault();
        pasteRowData(focusedRowId);
    }
});

// --- FONCTIONS LOGIQUES ---
function copyRowData(rowId) {
    // On cherche les données dans ton PlanningState.days
    const dayData = PlanningState.days.find(d => d.id == rowId);
    if (dayData) {
        copiedRowData = { ...dayData }; // Copie superficielle
        delete copiedRowData.id;       // On ne copie pas l'ID unique
        delete copiedRowData.date;     // On ne copie pas la date
        console.log("Données copiées :", copiedRowData);
    }
}

async function pasteRowData(rowId) {
    if (!copiedRowData) return;

    // On met à jour l'objet dans ton état local
    const dayIndex = PlanningState.days.findIndex(d => d.id == rowId);
    if (dayIndex !== -1) {
        // On fusionne les données copiées sur la ligne actuelle
        PlanningState.days[dayIndex] = {
            ...PlanningState.days[dayIndex],
            ...copiedRowData
        };

        // Appeler ta fonction de rendu pour mettre à jour l'affichage
        renderPlanning();

        // Optionnel : Sauvegarder automatiquement sur Supabase
        // await saveDayToSupabase(PlanningState.days[dayIndex]);
    }
}
/** * LOGIQUE DE GESTION DU CLAVIER ET CLIC DROIT
 */
document.addEventListener('keydown', async (e) => {
    // Si la souris n'est pas sur une ligne, on ignore
    if (!hoveredDayNum) return;

    // --- CTRL + C (COPIER) ---
    if (e.ctrlKey && e.key === 'c') {
        e.preventDefault();
        const dayData = PlanningState.days.find(d => d.day === hoveredDayNum);

        if (dayData && dayData.shift) {
            // CRUCIAL : On crée un NOUVEL objet sans l'ID d'origine
            // pour ne pas perturber les futures sauvegardes (UPSERT)
            internalClipboard = {
                entreprise_id: dayData.shift.entreprise_id,
                horaire_saisi: dayData.shift.horaire_saisi,
                site: dayData.shift.site,
                km: dayData.shift.km,
                is_night: dayData.shift.is_night
            };

            console.log(`📋 Copie réussie (Jour ${hoveredDayNum}) :`, internalClipboard);

            // Optionnel : un petit effet visuel pour confirmer la copie
            const row = document.querySelector(`[data-day="${hoveredDayNum}"]`);
            row.style.opacity = "0.5";
            setTimeout(() => row.style.opacity = "1", 200);
        }
    }

    // --- CTRL + V (COLLER) ---
    if (e.ctrlKey && e.key === 'v') {
        e.preventDefault();
        if (!internalClipboard) return;

        console.log(`📥 Collage sur Jour ${hoveredDayNum}...`);
        await pasteToDay(hoveredDayNum);
    }

    // --- DELETE / BACKSPACE (EFFACER) ---
    if (e.key === 'Delete' || e.key === 'Backspace') {
        const dayData = PlanningState.days.find(d => d.day === hoveredDayNum);
        if (dayData && dayData.shift) {
            if (confirm(`Effacer le contenu du jour ${hoveredDayNum} ?`)) {
                await clearDay(hoveredDayNum);
            }
        }
    }
});

/**
 * Fonction pour coller les données et synchroniser avec Supabase
 */
async function pasteToDay(dayNumber) {
    const dayData = PlanningState.days.find(d => d.day === dayNumber);
    if (!dayData || !PlanningState.currentPlanning) return;

    const dateISO = `${PlanningState.currentYear}-${String(PlanningState.currentMonth).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;

    // On prépare l'objet pour l'UPSERT (mise à jour ou création)
    const shiftToSave = {
        ...internalClipboard,
        planning_id: PlanningState.currentPlanning.id,
        user_id: state.user.id,
        date_jour: dateISO,
        is_ferie: false
    };

    // Si la cible a déjà un ID, on le garde pour écraser la ligne existante
    if (dayData.shift && dayData.shift.id) {
        shiftToSave.id = dayData.shift.id;
    }

    try {
        const { data, error } = await _supabase
            .from('shifts')
            .upsert(shiftToSave)
            .select()
            .single();

        if (error) throw error;

        // Mise à jour locale et visuelle
        dayData.shift = data;
        updateDayDisplayNew(dayData);
        updatePlanningStats();

    } catch (err) {
        console.error("Erreur collage:", err);
    }
}

/**
 * Fonction pour effacer un jour
 */
async function clearDay(dayNumber) {
    const dayData = PlanningState.days.find(d => d.day === dayNumber);
    if (!dayData || !dayData.shift?.id) return;

    try {
        const { error } = await _supabase
            .from('shifts')
            .delete()
            .eq('id', dayData.shift.id);

        if (error) throw error;

        dayData.shift = null;
        updateDayDisplayNew(dayData);
        updatePlanningStats();
    } catch (err) {
        console.error("Erreur effacement:", err);
    }
}

// Bloquer le clic droit navigateur sur le planning pour préparer ton futur menu
document.getElementById('calendar-container').addEventListener('contextmenu', (e) => {
    if (e.target.closest('.day-row')) {
        e.preventDefault();
        // C'est ici qu'on affichera ta div "liste de boutons" plus tard
    }
});
/**
 * Charge tous les plannings de l'utilisateur connecté depuis Supabase
 */

/**
 * Ouvre et initialise l'éditeur avec un planning sélectionné
 */
window.ouvrirPlanningExistant = async function (planning) {
    PlanningState.currentPlanning = planning;
    state.currentPlanning = planning;

    // Extraction du numéro de mois depuis son nom stocké
    const indexMois = MONTHS.indexOf(planning.month_name);
    PlanningState.currentMonth = indexMois !== -1 ? indexMois + 1 : new Date().getMonth() + 1;
    PlanningState.currentYear = planning.year;
    PlanningState.companies = state.companies || [];

    showView('planning-view');

    const titreEditeur = document.getElementById('current-planning-title');
    if (titreEditeur) {
        titreEditeur.innerText = `${planning.month_name} ${planning.year}`.toUpperCase();
    }

    await generateCalendar();
};

/**
 * Gère l'action de suppression via votre modal existante ou confirmation directe
 */
window.demanderSuppressionPlanning = async function (idPlanning, libelle) {
    if (confirm(`Voulez-vous vraiment supprimer définitivement le planning de ${libelle} ?`)) {
        try {
            // Étape 1 : Supprimer les shifts liés à ce planning
            await _supabase.from('shifts').delete().eq('planning_id', idPlanning);

            // Étape 2 : Supprimer le planning
            const { error } = await _supabase.from('plannings').delete().eq('id', idPlanning);

            if (error) throw error;

            // Rafraîchir la liste instantanément
            await window.chargerListePlannings();
        } catch (err) {
            console.error("Erreur suppression planning:", err);
            alert("Impossible de supprimer le planning.");
        }
    }
};
/**
 * Ouvre la modal et charge l'intégralité des plannings
 */
window.ouvrirModalListePlannings = async function () {
    const modal = document.getElementById('modal-liste-plannings');
    if (modal) modal.classList.remove('hidden');
    await window.chargerListeCompletePlannings();
};

/**
 * Ferme la modal de la liste
 */
window.fermerModalListePlannings = function () {
    const modal = document.getElementById('modal-liste-plannings');
    if (modal) modal.classList.add('hidden');
};

/**
 * Récupère et injecte TOUS les plannings dans la modal avec sélecteurs en français
 */
window.chargerListeCompletePlannings = async function () {
    const conteneur = document.getElementById('conteneur-liste-plannings');
    if (!conteneur) return;

    try {
        const { data: plannings, error } = await _supabase
            .from('plannings')
            .select('*')
            .eq('user_id', state.user.id)
            .order('year', { ascending: false });

        if (error) throw error;

        if (!plannings || plannings.length === 0) {
            conteneur.innerHTML = '<p class="liste-vide">Aucun planning enregistré.</p>';
            return;
        }

        conteneur.innerHTML = '';

        plannings.forEach(p => {
            const carte = document.createElement('div');
            carte.className = 'carte-planning';

            // Clic sur la carte pour ouvrir
            carte.onclick = () => {
                window.fermerModalListePlannings();
                window.ouvrirPlanningExistant(p);
            };

            carte.innerHTML = `
                <div class="info-planning">
                    <span class="mois-planning">${p.month_name}</span>
                    <span class="annee-planning">${p.year}</span>
                </div>
                <button class="bouton-supprimer-planning" title="Supprimer">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
            `;

            // Gestion de la suppression sans déclencher l'ouverture
            const boutonSuppr = carte.querySelector('.bouton-supprimer-planning');
            boutonSuppr.onclick = (e) => {
                e.stopPropagation();
                window.demanderSuppressionPlanning(p.id, `${p.month_name} ${p.year}`);
            };

            conteneur.appendChild(carte);
        });

    } catch (err) {
        console.error("Erreur lors du chargement de la liste complète :", err);
    }
};

/**
 * Modifie la fonction de suppression pour rafraîchir les deux affichages en même temps
 */
window.demanderSuppressionPlanning = async function (idPlanning, libelle) {
    if (confirm(`Voulez-vous vraiment supprimer définitivement le planning de ${libelle} ?`)) {
        try {
            // 1. Supprimer les shifts associés
            await _supabase.from('shifts').delete().eq('planning_id', idPlanning);

            // 2. Supprimer le planning
            const { error } = await _supabase.from('plannings').delete().eq('id', idPlanning);

            if (error) throw error;

            // 3. Rafraîchir la liste de la modal
            await window.chargerListeCompletePlannings();

            // 4. Mettre à jour l'affichage des récents du dashboard (displayRecentPlannings)
            if (typeof loadRecentPlannings === 'function') {
                await loadRecentPlannings();
            }
        } catch (err) {
            console.error("Erreur lors de la suppression :", err);
            alert("Erreur lors de la suppression du planning.");
        }
    }
};