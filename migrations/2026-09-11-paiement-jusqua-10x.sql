-- =====================================================================
-- Paiement étalé jusqu'à 10 mensualités
--
-- Ajout pur de valeurs à l'enum : aucune ligne existante n'est touchée.
-- Chaque valeur est insérée avant « autre » pour garder l'ordre naturel.
-- =====================================================================

alter type payment_plan add value if not exists '5x'  before 'autre';
alter type payment_plan add value if not exists '6x'  before 'autre';
alter type payment_plan add value if not exists '7x'  before 'autre';
alter type payment_plan add value if not exists '8x'  before 'autre';
alter type payment_plan add value if not exists '9x'  before 'autre';
alter type payment_plan add value if not exists '10x' before 'autre';
