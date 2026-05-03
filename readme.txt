###
contenu des tables supabase:
##
plannings
id: uuid
month_name: texte
user_id: uuid
created_at: timestamptz
year: int

##
entreprises
id: uuid
nom: texte
user_id: uuid
taux_horaire_brut: float8
type_contrat: TEXTE
couleur_hex: texte

##
shifts
id: uuid
planning_id: uuid
entreprise_id: uuid
date_jour: date
horaire_saisi: texte
km: float8
is_ferie: bool
type_jour: texte
user_id: uuid
is_night: bool
site: texte
