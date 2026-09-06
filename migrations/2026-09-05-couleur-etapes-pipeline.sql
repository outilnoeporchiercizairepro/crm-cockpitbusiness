-- =====================================================================
-- Couleur d'étiquette par étape du pipeline
--
-- Même palette fermée que les sources : ce sont les tons du composant
-- Badge, donc l'étiquette reste lisible sur le thème sombre comme clair.
--
-- Les valeurs de départ reprennent exactement ce que le code calculait
-- jusqu'ici (gagné → vert, perdu → rouge, le reste → bleu) : la mise en
-- place ne change rien à l'écran tant que rien n'est retouché en admin.
-- =====================================================================

alter table pipeline_stages add column if not exists color text not null default 'altitude';

alter table pipeline_stages drop constraint if exists etape_couleur_connue;
alter table pipeline_stages add constraint etape_couleur_connue
  check (color in ('neutre', 'altitude', 'succes', 'alerte', 'danger', 'violet'));

comment on column pipeline_stages.color is
  'Ton du composant Badge, réglable depuis l''écran d''administration.';

update pipeline_stages set color = 'succes' where is_won;
update pipeline_stages set color = 'danger' where is_lost;
