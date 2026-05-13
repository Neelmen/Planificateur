// --- holidays.js ---
// Gestion des jours fériés français via API calendrier.api.gouv.fr

/**
 * Récupère les jours fériés pour une année donnée
 * @param {number} year - L'année (ex: 2026)
 * @returns {Promise<Array>} - Tableau des jours fériés
 */
async function getFrenchHolidays(year) {
    try {
        const response = await fetch(`https://calendrier.api.gouv.fr/jours-feries/${year}.json`);
        if (!response.ok) {
            throw new Error('Erreur API jours fériés');
        }
        const holidays = await response.json();
        return holidays;
    } catch (error) {
        console.error('Erreur récupération jours fériés:', error);
        return {};
    }
}

/**
 * Vérifie si une date est un jour férié
 * @param {Date} date - La date à vérifier
 * @param {Object} holidays - Objet des jours fériés
 * @returns {boolean} - True si c'est un jour férié
 */
function isHoliday(date, holidays) {
    const dateStr = date.toISOString().split('T')[0]; // Format YYYY-MM-DD
    return holidays.hasOwnProperty(dateStr);
}

/**
 * Formate le nom du jour férié pour l'affichage
 * @param {Date} date - La date du jour férié
 * @param {Object} holidays - Objet des jours fériés
 * @returns {string} - Nom du jour férié
 */
function getHolidayName(date, holidays) {
    const dateStr = date.toISOString().split('T')[0];
    return holidays[dateStr] || 'Férié';
}

/**
 * Charge les jours fériés et les stocke dans l'état global
 * @param {number} year - L'année à charger
 */
async function loadHolidaysForYear(year) {
    if (!state.holidays || state.holidaysYear !== year) {
        state.holidays = await getFrenchHolidays(year);
        state.holidaysYear = year;
    }
    return state.holidays;
}

/**
 * Ajoute les badges FÉRIÉ aux éléments de jour concernés
 * @param {number} month - Le mois (1-12)
 * @param {number} year - L'année
 */
async function addHolidayBadges(month, year) {
    const holidays = await loadHolidaysForYear(year);
    
    for (let day = 1; day <= 31; day++) {
        const date = new Date(year, month - 1, day);
        
        // Vérifier si la date est valide (pour les mois < 31 jours)
        if (date.getMonth() !== month - 1) break;
        
        if (isHoliday(date, holidays)) {
            const dayElement = document.querySelector(`[data-day="${day}"]`);
            if (dayElement && !dayElement.querySelector('.holiday-badge')) {
                const badge = document.createElement('div');
                badge.className = 'holiday-badge';
                badge.textContent = 'FÉRIÉ';
                dayElement.appendChild(badge);
                dayElement.classList.add('is-holiday');
            }
        }
    }
}
