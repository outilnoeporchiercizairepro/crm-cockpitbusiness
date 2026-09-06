-- =====================================================================
-- 1. Nouvelle étape « Closing planifié »
--
-- « En attente » mélangeait deux situations opposées : le closing pas
-- encore fait, et le closing fait dont on attend la réponse. Impossible
-- de savoir combien de closings restaient à mener.
--
--   lead → closing_planifie → en_attente → close / perdu
--
-- `position` porte une contrainte UNIQUE : on décale par un offset
-- intermédiaire, sinon un +1 ligne à ligne entre en collision.
-- =====================================================================

update pipeline_stages set position = position + 100 where position >= 2;

insert into pipeline_stages (key, label, position, is_won, is_lost)
values ('closing_planifie', 'Closing planifié', 2, false, false);

update pipeline_stages set position = position - 99 where position >= 102;

-- =====================================================================
-- 2. Couleur d'étiquette par source
--
-- Palette fermée et non hexadécimale : ce sont les tons du composant
-- Badge, donc l'étiquette reste lisible sur le thème sombre comme clair.
-- =====================================================================

alter table sources add column if not exists color text not null default 'neutre';

alter table sources drop constraint if exists source_couleur_connue;
alter table sources add constraint source_couleur_connue
  check (color in ('neutre', 'altitude', 'succes', 'alerte', 'danger', 'violet'));

comment on column sources.color is
  'Ton du composant Badge. Permet de reconnaître la provenance d''un lead au coup d''œil.';

update sources set color = 'altitude' where key = 'direct' and color = 'neutre';
update sources set color = 'violet'   where key = 'sl'     and color = 'neutre';
