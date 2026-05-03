/**
 * État global du planning
 */
const PlanningState = {
    currentPlanning: null,
    currentMonth: null,
    currentYear: null,
    days: [],
    companies: []
};

/**
 * Constantes pour les mois
 */
const MONTHS = [
    'JANVIER', 'FÉVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN',
    'JUILLET', 'AOÛT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DÉCEMBRE'
];

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
 * Génère l'affichage du calendrier mensuel au format compact
 */
async function generateCalendar() {
    try {
        const month = PlanningState.currentMonth;
        const year = PlanningState.currentYear;

        if (!month || !year) {
            console.error('Mois ou année manquant pour générer le calendrier');
            return;
        }

        // Obtenir le nombre de jours dans le mois
        const daysInMonth = new Date(year, month, 0).getDate();

        // Charger les shifts existants pour ce planning
        await loadShifts();

        // Vider le conteneur du calendrier
        const calendarContainer = document.getElementById('calendar-container');
        if (!calendarContainer) {
            console.error('Conteneur de calendrier non trouvé');
            return;
        }
        calendarContainer.innerHTML = '';

        // Créer le conteneur principal des semaines
        const weeksContainer = document.createElement('div');
        weeksContainer.className = 'planning-weeks-grid';

        // Organiser les jours en semaines
        const weeks = organizeDaysIntoWeeks(daysInMonth, month, year);

        // Créer les blocs de semaines
        weeks.forEach((week, weekIndex) => {
            const weekBlock = createWeekBlock(week, weekIndex + 1);
            weeksContainer.appendChild(weekBlock);
        });

        calendarContainer.appendChild(weeksContainer);

        // Mettre à jour les statistiques
        updateStats();

    } catch (error) {
        console.error('Erreur dans generateCalendar:', error);
    }
}

/**
 * Organise les jours en semaines
 */
function organizeDaysIntoWeeks(daysInMonth, month, year) {
    const weeks = [];
    let currentWeek = [];

    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month - 1, day);
        const dayOfWeek = date.getDay(); // 0 = Dimanche, 6 = Samedi
        
        currentWeek.push({
            day: day,
            date: date,
            dayOfWeek: dayOfWeek,
            shift: PlanningState.days[day] || null
        });

        // Si c'est samedi (6) ou dernier jour du mois, terminer la semaine
        if (dayOfWeek === 6 || day === daysInMonth) {
            weeks.push([...currentWeek]);
            currentWeek = [];
        }
    }

    // Ajouter la dernière semaine si elle n'est pas vide
    if (currentWeek.length > 0) {
        weeks.push(currentWeek);
    }

    return weeks;
}

/**
 * Crée un bloc de semaine au format compact
 */
function createWeekBlock(weekDays, weekNumber) {
    const weekBlock = document.createElement('div');
    weekBlock.className = 'week-block';

    // En-tête de semaine
    const weekHeader = document.createElement('div');
    weekHeader.className = 'week-header';
    weekHeader.textContent = `SEMAINE ${weekNumber}`;
    weekBlock.appendChild(weekHeader);

    // Ajouter les jours de la semaine
    weekDays.forEach(dayData => {
        const dayRow = createCompactDayRow(dayData);
        weekBlock.appendChild(dayRow);
    });

    return weekBlock;
}

/**
 * Crée une ligne de jour au format compact style Discord
 */
function createCompactDayRow(dayData) {
    const dayRow = document.createElement('div');
    dayRow.className = 'day-row';
    
    // Ajouter les classes pour le style
    if (dayData.shift) {
        dayRow.classList.add('has-work');
    }
    
    if (dayData.dayOfWeek === 0 || dayData.dayOfWeek === 6) {
        dayRow.classList.add('weekend');
    }

    // Formatter le contenu
    const dayNumber = document.createElement('span');
    dayNumber.className = 'day-number';
    dayNumber.textContent = String(dayData.day).padStart(2, '0');

    const dayName = document.createElement('span');
    dayName.className = 'day-name';
    const dayNames = ['DIMANCHE', 'LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI'];
    dayName.textContent = dayNames[dayData.dayOfWeek];

    if (dayData.shift && dayData.shift.company) {
        const companyName = document.createElement('span');
        companyName.className = 'company-name';
        companyName.textContent = dayData.shift.company.name;
        dayRow.appendChild(companyName);

        const workHours = document.createElement('span');
        workHours.className = 'work-hours';
        workHours.textContent = dayData.shift.hours || '';
        dayRow.appendChild(workHours);

        const workSite = document.createElement('span');
        workSite.className = 'work-site';
        workSite.textContent = dayData.shift.site || '';
        dayRow.appendChild(workSite);
    } else {
        const emptySpace = document.createElement('span');
        emptySpace.style.color = '#7289da';
        emptySpace.textContent = 'REPOS';
        dayRow.appendChild(emptySpace);
    }

    // Insérer le numéro et le nom du jour au début
    dayRow.insertBefore(dayName, dayRow.firstChild);
    dayRow.insertBefore(dayNumber, dayRow.firstChild);

    // Ajouter le gestionnaire de clic
    dayRow.onclick = () => openDayModal(dayData.day, dayData.shift);

    return dayRow;
}

/**
 * Charge les shifts depuis Supabase
 */
async function loadShifts() {
    try {
        if (!PlanningState.currentPlanning?.id) {
            console.log('Pas de planning actuel, chargement des shifts annulé');
            return;
        }

        const { data: shifts, error } = await _supabase
            .from('shifts')
            .select('*')
            .eq('planning_id', PlanningState.currentPlanning.id)
            .order('date_jour');

        if (error) {
            console.error('Erreur chargement shifts:', error);
            return;
        }

        // Mettre à jour l'état des jours
        PlanningState.days = [];
        for (let day = 1; day <= 31; day++) {
            PlanningState.days.push({
                dayNumber: day,
                shift: null
            });
        }

        // Associer les shifts aux jours
        shifts?.forEach(shift => {
            const day = new Date(shift.date_jour).getDate();
            const dayData = PlanningState.days.find(d => d.dayNumber === day);
            if (dayData) {
                dayData.shift = shift;
            }
        });

    } catch (error) {
        console.error('Erreur loadShifts:', error);
    }
}

/**
 * Met à jour les statistiques du planning
 */
function updateStats() {
    try {
        let totalHours = 0;
        let totalSalary = 0;
        let totalKm = 0;

        PlanningState.days.forEach(dayData => {
            if (dayData.shift && dayData.shift.company) {
                // Calculer les heures
                if (dayData.shift.hours) {
                    const hours = parseHours(dayData.shift.hours);
                    totalHours += hours;
                    
                    // Calculer le salaire
                    const hourlyRate = parseFloat(dayData.shift.company.salary) || 0;
                    totalSalary += hours * hourlyRate;
                }
                
                // Ajouter les kilomètres
                if (dayData.shift.km) {
                    totalKm += parseInt(dayData.shift.km) || 0;
                }
            }
        });

        // Mettre à jour l'affichage
        const hoursEl = document.getElementById('stat-hours');
        if (hoursEl) {
            hoursEl.textContent = `${totalHours.toFixed(1)}h`;
        }

        const salaryEl = document.getElementById('stat-salary');
        if (salaryEl) {
            salaryEl.textContent = `${totalSalary.toFixed(2)}€`;
        }

        const kmEl = document.getElementById('stat-km');
        if (kmEl) {
            kmEl.textContent = `${totalKm} km`;
        }

    } catch (error) {
        console.error('Erreur updateStats:', error);
    }
}

/**
 * Parse les heures au format "19H00 - 07H00"
 */
function parseHours(hoursString) {
    try {
        if (!hoursString || typeof hoursString !== 'string') {
            return 0;
        }

        const parts = hoursString.split(' - ');
        if (parts.length !== 2) {
            return 0;
        }

        const startTime = parts[0].replace('H', ':');
        const endTime = parts[1].replace('H', ':');

        const [startHour, startMin] = startTime.split(':').map(Number);
        const [endHour, endMin] = endTime.split(':').map(Number);

        let totalHours = 0;

        if (endHour > startHour) {
            totalHours = endHour - startHour + (endMin - startMin) / 60;
        } else {
            // Travail de nuit (ex: 19h - 07h)
            totalHours = (24 - startHour) + endHour + (endMin - startMin) / 60;
        }

        return totalHours;
    } catch (error) {
        console.error('Erreur parseHours:', error);
        return 0;
    }
}

/**
 * Ouvre la modale d'édition de jour
 */
function openDayModal(dayNumber, shiftData) {
    try {
        // Préparer les données du jour
        const dayDate = new Date(PlanningState.currentYear, PlanningState.currentMonth - 1, dayNumber);
        const dayName = dayDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

        // Mettre à jour la modale
        const modal = document.getElementById('day-modal');
        if (!modal) return;

        const titleEl = document.getElementById('day-modal-title');
        if (titleEl) {
            titleEl.textContent = dayName.toUpperCase();
        }

        // Remplir le formulaire
        const companySelect = document.getElementById('day-company');
        const hoursInput = document.getElementById('day-hours');
        const siteSelect = document.getElementById('day-site');
        const kmInput = document.getElementById('day-km');
        const nightToggle = document.getElementById('day-is-night');

        // Réinitialiser les champs
        if (companySelect) companySelect.value = '';
        if (hoursInput) hoursInput.value = '';
        if (siteSelect) siteSelect.value = '';
        if (kmInput) kmInput.value = '';
        if (nightToggle) nightToggle.checked = false;

        // Remplir avec les données existantes
        if (shiftData) {
            if (companySelect && shiftData.company_id) {
                companySelect.value = shiftData.company_id;
            }
            if (hoursInput && shiftData.hours) {
                hoursInput.value = shiftData.hours;
            }
            if (siteSelect && shiftData.site) {
                siteSelect.value = shiftData.site;
            }
            if (kmInput && shiftData.km) {
                kmInput.value = shiftData.km;
            }
            if (nightToggle && shiftData.is_night) {
                nightToggle.checked = shiftData.is_night;
            }
        }

        // Stocker le jour actuel pour la sauvegarde
        modal.setAttribute('data-day', dayNumber);

        // Afficher la modale
        modal.classList.remove('hidden');

    } catch (error) {
        console.error('Erreur openDayModal:', error);
    }
}

/**
 * Ferme la modale d'édition de jour
 */
window.closeDayModal = function() {
    try {
        const modal = document.getElementById('day-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    } catch (error) {
        console.error('Erreur closeDayModal:', error);
    }
};

/**
 * Sauvegarde les données du jour
 */
window.saveDayModal = async function() {
    try {
        const modal = document.getElementById('day-modal');
        if (!modal) return;

        const dayNumber = parseInt(modal.getAttribute('data-day'));
        if (!dayNumber) return;

        // Récupérer les données du formulaire
        const companySelect = document.getElementById('day-company');
        const hoursInput = document.getElementById('day-hours');
        const siteSelect = document.getElementById('day-site');
        const kmInput = document.getElementById('day-km');
        const nightToggle = document.getElementById('day-is-night');

        const companyId = companySelect?.value;
        const hours = hoursInput?.value.trim();
        const site = siteSelect?.value.trim();
        const km = kmInput?.value;
        const isNight = nightToggle?.checked;

        // Validation
        if (!companyId) {
            alert('Veuillez sélectionner une entreprise.');
            return;
        }

        // Préparer les données
        const shiftData = {
            planning_id: PlanningState.currentPlanning.id,
            date_jour: new Date(PlanningState.currentYear, PlanningState.currentMonth - 1, dayNumber).toISOString().split('T')[0],
            company_id: companyId,
            hours: hours,
            site: site,
            km: km,
            is_night: isNight
        };

        // Sauvegarder dans Supabase
        const { data, error } = await _supabase
            .from('shifts')
            .upsert(shiftData)
            .select()
            .single();

        if (error) {
            console.error('Erreur sauvegarde shift:', error);
            alert('Erreur lors de la sauvegarde: ' + error.message);
            return;
        }

        // Mettre à jour l'état local
        const dayData = PlanningState.days.find(d => d.dayNumber === dayNumber);
        if (dayData) {
            dayData.shift = data;
        }

        // Rafraîchir l'affichage
        await generateCalendar();

        // Fermer la modale
        closeDayModal();

    } catch (error) {
        console.error('Erreur saveDayModal:', error);
        alert('Une erreur est survenue lors de la sauvegarde.');
    }
};

// Exporter les fonctions nécessaires
window.generateCalendar = generateCalendar;
window.loadShifts = loadShifts;
