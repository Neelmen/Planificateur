// --- config.js ---

// 1. Identifiants de connexion
const SUPABASE_URL = 'https://sbdmhhrmgcstsduovroo.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNiZG1oaHJtZ2NzdHNkdW92cm9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxNTI5MzQsImV4cCI6MjA5MjcyODkzNH0.cFeD93mLC3Xf1XGDJru7PoC8p7T0cIeGo9Ehy6VDEyw';

// 2. Initialisation UNIQUE du client (on ne le déclare qu'une fois)[cite: 9]
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// 3. État global pour synchroniser les données entre les modules[cite: 9]
const state = {
    user: null,
    companies: [],
    currentPlanning: null,
    planningShifts: [],
    holidays: null,
    holidaysYear: null,
    recentPlannings: [] // Stocker les 3 derniers plannings
};

// 4. Configuration des mois[cite: 9]
const MONTHS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

// 5. Sites prédéfinis pour les shifts (désormais dynamiques)
// Les sites sont récupérés depuis les plannings existants de l'utilisateur
const PREDEFINED_SITES = []; // Initialisé vide, sera rempli dynamiquement