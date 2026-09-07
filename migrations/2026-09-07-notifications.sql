-- =====================================================================
-- Notifications d'équipe
--
-- Diffusées à tout le monde, mais filtrées par le périmètre de sources :
-- la même policy que les autres tables de données, appliquée à une
-- source dénormalisée sur la notification. Dénormalisée justement pour
-- que le filtre n'ait aucune jointure à faire à chaque lecture.
--
-- Les notifications sont posées par des déclencheurs et non par le code
-- applicatif : un changement d'étape peut venir du kanban, de la fiche,
-- du webhook n8n ou d'une requête SQL, et seul un trigger les voit tous.
-- =====================================================================

create table if not exists notifications (
  id             uuid primary key default gen_random_uuid(),
  genre          text not null check (genre in ('etape', 'rdv_decale', 'rdv_pris')),
  opportunity_id uuid references opportunities(id) on delete cascade,
  contact_id     uuid references contacts(id) on delete cascade,
  -- Copie de la source au moment des faits : porte le filtre de périmètre.
  source_id      uuid references sources(id) on delete set null,
  titre          text not null,
  detail         text,
  -- Nom figé : survit à la suppression du compte, comme sur activities.
  acteur_nom     text not null,
  created_at     timestamptz not null default now()
);

create index if not exists notifications_recentes_idx on notifications(created_at desc);

alter table notifications enable row level security;

drop policy if exists read_perimetre on notifications;
create policy read_perimetre on notifications
  for select to authenticated
  using (est_actif() and source_autorisee(source_id));

-- Personne n'écrit à la main : seuls les triggers (SECURITY DEFINER) posent.
drop policy if exists admin_purge on notifications;
create policy admin_purge on notifications
  for delete to authenticated using (is_admin());

-- Dernière consultation de la cloche. Un simple horodatage plutôt qu'une
-- table de lectures par utilisateur : la cloche n'a besoin que de « combien
-- depuis la dernière ouverture », et une ligne par notification et par
-- compte coûterait bien plus cher que ce qu'elle apporte.
alter table profiles add column if not exists notifications_vues_le timestamptz;

-- ---------------------------------------------------------------------
-- Qui a fait l'action. Null quand ça vient du webhook n8n, qui utilise la
-- clé de service et n'a donc pas d'utilisateur.
-- ---------------------------------------------------------------------
create or replace function acteur_courant()
returns text language sql stable security definer set search_path = public
as $$
  select coalesce((select full_name from profiles where id = auth.uid()), 'Automatisation');
$$;

-- ---------------------------------------------------------------------
-- Changement d'étape
-- ---------------------------------------------------------------------
create or replace function notifier_changement_etape()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_contact text;
  v_avant   text;
  v_apres   text;
begin
  if new.stage_id is not distinct from old.stage_id then return null; end if;

  select full_name into v_contact from contacts where id = new.contact_id;
  select label into v_avant from pipeline_stages where id = old.stage_id;
  select label into v_apres from pipeline_stages where id = new.stage_id;

  insert into notifications (genre, opportunity_id, contact_id, source_id, titre, detail, acteur_nom)
  values ('etape', new.id, new.contact_id, new.source_id,
          coalesce(v_contact, 'Un contact') || ' passe en « ' || coalesce(v_apres, '?') || ' »',
          case when v_avant is null then null else 'Depuis « ' || v_avant || ' »' end,
          acteur_courant());
  return null;
end;
$$;

drop trigger if exists t_notifier_etape on opportunities;
create trigger t_notifier_etape
  after update of stage_id on opportunities
  for each row execute function notifier_changement_etape();

-- ---------------------------------------------------------------------
-- Rendez-vous : report et prise
-- ---------------------------------------------------------------------
create or replace function notifier_rdv_decale()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_contact text;
  v_source  uuid;
  v_nouveau timestamptz;
begin
  if new.status <> 'replanifie' or old.status = 'replanifie' then return null; end if;

  select full_name into v_contact from contacts where id = new.contact_id;
  select source_id into v_source from opportunities where id = new.opportunity_id;
  select scheduled_at into v_nouveau from appointments where id = new.rescheduled_to;

  insert into notifications (genre, opportunity_id, contact_id, source_id, titre, detail, acteur_nom)
  values ('rdv_decale', new.opportunity_id, new.contact_id, v_source,
          'RDV décalé — ' || coalesce(v_contact, 'contact inconnu'),
          to_char(old.scheduled_at at time zone 'Europe/Paris', 'DD/MM à HH24:MI')
            || ' → '
            || coalesce(to_char(v_nouveau at time zone 'Europe/Paris', 'DD/MM à HH24:MI'), 'créneau à définir'),
          acteur_courant());
  return null;
end;
$$;

drop trigger if exists t_notifier_rdv_decale on appointments;
create trigger t_notifier_rdv_decale
  after update of status on appointments
  for each row execute function notifier_rdv_decale();

create or replace function notifier_rdv_pris()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_contact text;
  v_source  uuid;
begin
  select full_name into v_contact from contacts where id = new.contact_id;
  select source_id into v_source from opportunities where id = new.opportunity_id;

  insert into notifications (genre, opportunity_id, contact_id, source_id, titre, detail, acteur_nom)
  values ('rdv_pris', new.opportunity_id, new.contact_id, v_source,
          'Nouveau RDV — ' || coalesce(v_contact, 'contact inconnu'),
          to_char(new.scheduled_at at time zone 'Europe/Paris', 'DD/MM à HH24:MI'),
          acteur_courant());
  return null;
end;
$$;

drop trigger if exists t_notifier_rdv_pris on appointments;
create trigger t_notifier_rdv_pris
  after insert on appointments
  for each row execute function notifier_rdv_pris();

-- ---------------------------------------------------------------------
-- Temps réel. La publication était vide : l'abonnement du kanban sur
-- `opportunities` ne recevait donc jamais rien, malgré son code.
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table notifications;
alter publication supabase_realtime add table opportunities;

-- ---------------------------------------------------------------------
-- Correctif appliqué dans la foulée : un report crée un rendez-vous, donc
-- le trigger d'insertion posait aussi un « Nouveau RDV » en doublon du
-- « RDV décalé ». La colonne appointment_id permet de retirer le premier.
-- ---------------------------------------------------------------------
alter table notifications add column if not exists appointment_id uuid
  references appointments(id) on delete cascade;
-- notifier_rdv_pris renseigne désormais appointment_id, et
-- notifier_rdv_decale supprime la notification « rdv_pris » du créneau de
-- remplacement avant de poser la sienne. Voir la définition en base.
