-- =====================================================================
-- Répartition des affaires déjà en « En attente »
--
-- Règle : une affaire reste « En attente » seulement si son closing a
-- réellement eu lieu (un rendez-vous au statut « honoré »). Tout le reste
-- — RDV encore à venir, RDV passé jamais traité, no-show — repart en
-- « Closing planifié » : ce sont des closings qui restent à mener.
--
-- À exécuter une seule fois, dans l'éditeur SQL Supabase.
-- =====================================================================

-- Aperçu avant d'écrire : vérifie la répartition proposée.
select c.full_name,
       case when exists (select 1 from appointments a
                          where a.opportunity_id = o.id and a.status = 'honore')
            then 'reste En attente' else 'passe en Closing planifié' end as destination
  from opportunities o
  join contacts c            on c.id  = o.contact_id
  join pipeline_stages ps    on ps.id = o.stage_id
 where ps.key = 'en_attente'
 order by 2, 1;

-- Puis, si la répartition te convient :
update opportunities o
   set stage_id = (select id from pipeline_stages where key = 'closing_planifie')
 where o.stage_id = (select id from pipeline_stages where key = 'en_attente')
   and not exists (select 1 from appointments a
                    where a.opportunity_id = o.id and a.status = 'honore');
