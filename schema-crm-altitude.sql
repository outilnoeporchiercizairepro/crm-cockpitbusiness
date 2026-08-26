-- =====================================================================
-- CRM ALTITUDE — Schéma v1 (pipeline de vente)
-- Cible : Supabase Postgres (eu-west-3)
-- Ordre d'exécution : ce fichier en une seule fois, base vierge.
-- =====================================================================

create extension if not exists "pgcrypto";

-- citext expose une trentaine de fonctions ; dans `public` elles seraient
-- publiées par PostgREST en /rest/v1/rpc/. On la range dans `extensions`.
create schema if not exists extensions;
create extension if not exists "citext" with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;

-- =====================================================================
-- 1. ÉNUMÉRATIONS
-- =====================================================================

create type user_role          as enum ('admin', 'setter', 'closer');
create type icp_status         as enum ('inconnu', 'icp', 'hors_icp');
create type activity_type      as enum ('appel', 'dm_linkedin', 'whatsapp', 'sms', 'email', 'note');
create type activity_direction as enum ('entrant', 'sortant', 'interne');
create type appointment_kind   as enum ('setting', 'closing', 'suivi');
create type appointment_status as enum ('planifie', 'honore', 'no_show', 'replanifie', 'annule');
create type payment_plan       as enum ('1x', '2x', '3x', '4x', 'autre');
create type payment_processor  as enum ('mollie', 'stripe', 'virement', 'especes', 'autre');
create type legal_entity       as enum ('auto', 'sasu');
create type task_status        as enum ('a_faire', 'fait', 'annule');
create type payment_status     as enum ('attendu', 'encaisse', 'echoue', 'rembourse', 'annule');

-- =====================================================================
-- 2. UTILISATEURS
-- =====================================================================

create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null,
  email       citext not null unique,
  role        user_role not null default 'setter',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table profiles is 'Un profil par utilisateur authentifié. Le rôle porte les permissions RLS.';

-- Helper SECURITY DEFINER : évite la récursion RLS quand une policy
-- sur profiles doit lire profiles.
create or replace function current_role_name()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role = 'admin' and is_active from profiles where id = auth.uid()), false);
$$;

-- Le compte de l'appelant est-il actif ? Toutes les policies en dépendent :
-- sans ce verrou, `is_active` ne serait qu'une décoration et désactiver un
-- utilisateur ne l'empêcherait ni de lire ni d'écrire.
create or replace function est_actif()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_active from profiles where id = auth.uid()), false);
$$;

-- Création automatique du profil à la première connexion.
-- Le tout premier compte devient admin : sans ça, personne ne pourrait
-- administrer quoi que ce soit sans passer par du SQL manuel.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_premier boolean;
  v_role    user_role;
begin
  select count(*) = 0 into v_premier from public.profiles;

  v_role := case
    when v_premier then 'admin'::user_role
    else coalesce((new.raw_user_meta_data->>'role')::user_role, 'setter'::user_role)
  end;

  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1)),
    new.email,
    v_role
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- =====================================================================
-- 3. TABLES DE CONFIGURATION (administrables)
-- =====================================================================

create table sources (
  id         uuid primary key default gen_random_uuid(),
  key        text not null unique,
  label      text not null,
  position   int  not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create table pipeline_stages (
  id         uuid primary key default gen_random_uuid(),
  key        text not null unique,
  label      text not null,
  position   int  not null unique,
  is_won     boolean not null default false,
  is_lost    boolean not null default false,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  constraint stage_not_both_won_and_lost check (not (is_won and is_lost))
);

comment on column pipeline_stages.position is 'Ordre dans le kanban. Sert aussi à calculer "a atteint au moins l''étape N".';

create table lost_reasons (
  id         uuid primary key default gen_random_uuid(),
  key        text not null unique,
  label      text not null,
  position   int  not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create table relance_rules (
  id           uuid primary key default gen_random_uuid(),
  label        text not null,
  delai_jours  int  not null check (delai_jours > 0),
  position     int  not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

comment on table relance_rules is
  'Relances posées automatiquement après un RDV honoré, tant que l''opportunité n''est ni gagnée ni perdue.';

-- =====================================================================
-- 4. CONTACTS
-- =====================================================================

create table contacts (
  id                uuid primary key default gen_random_uuid(),
  -- Un seul champ : la source (COCKPIT SUIVI) ne distingue pas prénom et nom,
  -- et les entrées vont du patronyme seul (« HANQUET ») au nom complet.
  full_name         text not null,
  email             citext,
  phone             text,
  company           text,

  -- Qualification. Volontairement minimal : les champs ICP détaillés (rôle,
  -- secteur, effectif, CA, LinkedIn) n'étaient jamais renseignés et
  -- n'affichaient que des tirets.
  main_pain         text,
  icp               icp_status not null default 'inconnu',

  source_id         uuid references sources(id) on delete set null,

  -- RGPD
  consent_marketing boolean not null default false,
  consent_at        timestamptz,

  owner_id          uuid references profiles(id) on delete set null,
  notes             text,

  created_by        uuid references profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on column contacts.owner_id is 'Null = pool non assigné. Un setter peut se saisir d''un contact du pool.';

create index contacts_owner_idx   on contacts(owner_id);
create index contacts_source_idx  on contacts(source_id);
create index contacts_email_idx   on contacts(email);
create index contacts_created_idx on contacts(created_at desc);
create index contacts_search_idx  on contacts
  using gin (to_tsvector('french', coalesce(full_name,'') || ' ' || coalesce(company,'')));

-- =====================================================================
-- 5. OPPORTUNITÉS
-- =====================================================================

create table opportunities (
  id                uuid primary key default gen_random_uuid(),
  contact_id        uuid not null references contacts(id) on delete cascade,
  stage_id          uuid not null references pipeline_stages(id),
  source_id         uuid references sources(id) on delete set null,

  setter_id         uuid references profiles(id) on delete set null,
  closer_id         uuid references profiles(id) on delete set null,

  amount_proposed   numeric(10,2),
  -- amount_signed est la référence du dashboard : c'est le HT.
  amount_signed     numeric(10,2),
  amount_ht         numeric(10,2),
  amount_ttc        numeric(10,2),
  -- Pourcentage reversé au setter. Null = pas de setter sur ce deal.
  setter_commission_pct numeric(5,2),
  payment_plan      payment_plan,

  -- « ENCAISSE SUR » du fichier source, éclaté en deux dimensions pour être
  -- filtrable au moment de la compta.
  payment_processor payment_processor,
  legal_entity      legal_entity,
  setter_paid       boolean not null default false,

  -- Drapeaux transverses (indépendants de l'étape)
  is_no_show        boolean not null default false,
  is_nurturing      boolean not null default false,
  is_disqualified   boolean not null default false,   -- hors ICP : exclu des taux

  -- Prochaine action
  next_action_at    timestamptz,
  next_action_label text,

  lost_reason_id    uuid references lost_reasons(id) on delete set null,
  lost_note         text,

  won_at            timestamptz,
  lost_at           timestamptz,

  created_by        uuid references profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint commission_setter_plausible
    check (setter_commission_pct is null
           or (setter_commission_pct >= 0 and setter_commission_pct <= 100)),

  -- L'entité juridique impose le processeur. Contrainte plutôt que simple
  -- règle d'interface : l'API et n8n ne doivent pas pouvoir créer
  -- d'incohérence comptable.
  constraint entite_impose_processeur check (
    legal_entity is null
    or payment_processor is null
    or (legal_entity = 'sasu' and payment_processor = 'stripe')
    or (legal_entity = 'auto' and payment_processor = 'mollie')
  )
);

comment on table opportunities is
  'Une tentative de vente. Un contact peut en avoir plusieurs successives : les taux de conversion se calculent ici, pas sur contacts.';

create index opportunities_contact_idx  on opportunities(contact_id);
create index opportunities_stage_idx    on opportunities(stage_id);
create index opportunities_setter_idx   on opportunities(setter_id);
create index opportunities_closer_idx   on opportunities(closer_id);
create index opportunities_next_idx     on opportunities(next_action_at) where next_action_at is not null;
create index opportunities_created_idx  on opportunities(created_at desc);

-- =====================================================================
-- 6. JOURNAL D'ACTIVITÉ (immuable)
-- =====================================================================

create table activities (
  id             uuid primary key default gen_random_uuid(),
  opportunity_id uuid references opportunities(id) on delete cascade,
  contact_id     uuid not null references contacts(id) on delete cascade,
  type           activity_type not null,
  direction      activity_direction not null default 'sortant',
  outcome        text,                 -- 'repondu', 'pas_de_reponse', 'rappel_demande', ...
  content        text,
  -- on delete set null, pas restrict : sinon un compte ayant loggé le moindre
  -- échange devient impossible à supprimer, y compris pour une demande
  -- d'effacement. L'attribution est préservée par author_name ci-dessous.
  author_id      uuid references profiles(id) on delete set null,
  -- Nom figé à l'écriture : survit à la suppression du compte.
  author_name    text not null,
  occurred_at    timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

comment on table activities is
  'Journal immuable : pas d''UPDATE de contenu hors admin, DELETE réservé à l''admin par RLS. L''auteur reste lisible via author_name même après suppression de son compte.';

create index activities_contact_idx     on activities(contact_id, occurred_at desc);
create index activities_opportunity_idx on activities(opportunity_id, occurred_at desc);
create index activities_author_idx      on activities(author_id, occurred_at desc);

-- =====================================================================
-- 7. RENDEZ-VOUS
-- =====================================================================

create table appointments (
  id             uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  contact_id     uuid not null references contacts(id) on delete cascade,
  kind           appointment_kind not null,
  scheduled_at   timestamptz not null,
  duration_min   int not null default 45,
  status         appointment_status not null default 'planifie',
  host_id        uuid references profiles(id) on delete set null,
  location       text,                 -- lien visio ou téléphone
  notes          text,
  rescheduled_to uuid references appointments(id) on delete set null,
  created_by     uuid references profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index appointments_opportunity_idx on appointments(opportunity_id);
create index appointments_host_day_idx    on appointments(host_id, scheduled_at);
create index appointments_sched_idx       on appointments(scheduled_at);

-- =====================================================================
-- 8. TÂCHES / RELANCES
-- =====================================================================

create table tasks (
  id             uuid primary key default gen_random_uuid(),
  opportunity_id uuid references opportunities(id) on delete cascade,
  contact_id     uuid references contacts(id) on delete cascade,
  title          text not null,
  details        text,
  due_at         timestamptz not null,
  assignee_id    uuid references profiles(id) on delete set null,
  status         task_status not null default 'a_faire',
  completed_at   timestamptz,
  created_by     uuid references profiles(id) on delete set null,
  -- Trace de l'origine : distingue les relances automatiques des manuelles,
  -- évite les doublons et permet de n'annuler que les premières.
  relance_rule_id uuid references relance_rules(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint task_has_a_parent check (opportunity_id is not null or contact_id is not null)
);

create index tasks_regle_idx on tasks(opportunity_id, relance_rule_id);

create index tasks_due_idx      on tasks(assignee_id, due_at) where status = 'a_faire';
create index tasks_opp_idx      on tasks(opportunity_id);

-- =====================================================================
-- 9. HISTORIQUE DES ÉTAPES (alimenté par trigger)
-- =====================================================================

create table stage_transitions (
  id             bigserial primary key,
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  from_stage_id  uuid references pipeline_stages(id),
  to_stage_id    uuid not null references pipeline_stages(id),
  changed_by     uuid references profiles(id) on delete set null,
  changed_at     timestamptz not null default now(),
  seconds_in_previous_stage bigint
);

comment on table stage_transitions is
  'Écrit automatiquement. Sans cette table on ne mesure que l''instantané : c''est elle qui rend les taux et les temps de cycle calculables a posteriori.';

create index stage_transitions_opp_idx  on stage_transitions(opportunity_id, changed_at);
create index stage_transitions_to_idx   on stage_transitions(to_stage_id, changed_at);

-- =====================================================================
-- 10. ENCAISSEMENTS (préparé v2 — saisie manuelle en v1)
-- =====================================================================

create table payments (
  id              uuid primary key default gen_random_uuid(),
  opportunity_id  uuid not null references opportunities(id) on delete cascade,
  installment_no  int not null default 1,
  due_date        date not null,
  amount_expected numeric(10,2) not null,
  amount_received numeric(10,2),
  received_at     timestamptz,
  status          payment_status not null default 'attendu',
  method          text,
  processor       payment_processor,
  legal_entity    legal_entity,
  external_ref    text,               -- id Stripe / Mollie en v2
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (opportunity_id, installment_no)
);

create index payments_due_idx on payments(due_date) where status = 'attendu';

-- =====================================================================
-- 11. TRIGGERS
-- =====================================================================

-- 11.1 updated_at
create or replace function touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger t_profiles_touch      before update on profiles      for each row execute function touch_updated_at();
create trigger t_contacts_touch      before update on contacts      for each row execute function touch_updated_at();
create trigger t_opportunities_touch before update on opportunities for each row execute function touch_updated_at();
create trigger t_appointments_touch  before update on appointments  for each row execute function touch_updated_at();
create trigger t_tasks_touch         before update on tasks         for each row execute function touch_updated_at();
create trigger t_payments_touch      before update on payments      for each row execute function touch_updated_at();

-- 11.2 Horodatage gagné/perdu (BEFORE : on écrit sur NEW, pas de second UPDATE)
create or replace function stamp_won_lost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_won  boolean;
  v_lost boolean;
begin
  select is_won, is_lost into v_won, v_lost from pipeline_stages where id = new.stage_id;

  new.won_at  := case when v_won  then coalesce(new.won_at,  now()) else null end;
  new.lost_at := case when v_lost then coalesce(new.lost_at, now()) else null end;

  return new;
end;
$$;

create trigger t_opportunity_stamp_won_lost
  before insert or update of stage_id on opportunities
  for each row execute function stamp_won_lost();

-- 11.3 Historisation des changements d'étape
--      AFTER obligatoire : la FK de stage_transitions exige que la ligne existe.
create or replace function log_stage_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev_at timestamptz;
begin
  if tg_op = 'UPDATE' and new.stage_id is not distinct from old.stage_id then
    return null;
  end if;

  select coalesce(max(changed_at), new.created_at)
    into v_prev_at
    from stage_transitions
   where opportunity_id = new.id;

  insert into stage_transitions (opportunity_id, from_stage_id, to_stage_id, changed_by, seconds_in_previous_stage)
  values (
    new.id,
    case when tg_op = 'UPDATE' then old.stage_id else null end,
    new.stage_id,
    auth.uid(),
    case when tg_op = 'UPDATE'
         then extract(epoch from (now() - coalesce(v_prev_at, new.created_at)))::bigint
         else null end
  );

  return null;
end;
$$;

create trigger t_opportunity_log_stage
  after insert or update of stage_id on opportunities
  for each row execute function log_stage_transition();

-- 11.4 Motif de perte obligatoire sur une étape "perdue"
create or replace function require_lost_reason()
returns trigger language plpgsql set search_path = public as $$
declare v_lost boolean;
begin
  select is_lost into v_lost from pipeline_stages where id = new.stage_id;
  if v_lost and new.lost_reason_id is null then
    raise exception 'Un motif de perte est obligatoire pour passer une opportunité en étape perdue.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger t_opportunity_require_lost_reason
  before insert or update on opportunities
  for each row execute function require_lost_reason();

-- 11.5 Un RDV en no_show lève le drapeau sur l'opportunité
create or replace function sync_no_show_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'no_show' and (tg_op = 'INSERT' or old.status is distinct from 'no_show') then
    update opportunities set is_no_show = true where id = new.opportunity_id;
  elsif new.status = 'honore' then
    update opportunities set is_no_show = false where id = new.opportunity_id;
  end if;
  return null;
end;
$$;

create trigger t_appointment_sync_no_show
  after insert or update of status on appointments
  for each row execute function sync_no_show_flag();

-- 11.6bis Nom de l'auteur figé à l'écriture, pour que le journal reste
--         attribuable après suppression du compte. Posé en base : n8n et
--         l'API produisent la même chose que l'application.
create or replace function figer_auteur_activite()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.author_name is null then
    select full_name into new.author_name from profiles where id = new.author_id;
    new.author_name := coalesce(new.author_name, 'Compte supprimé');
  end if;
  return new;
end;
$$;

create trigger t_activities_auteur
  before insert on activities
  for each row execute function figer_auteur_activite();

-- 11.6 Journal immuable : blocage des UPDATE hors admin
-- Cible la substance du journal, pas la ligne entière : un verrou global
-- bloquerait aussi l'UPDATE que Postgres émet lui-même pour appliquer
-- `on delete set null` sur author_id, et supprimer un compte redeviendrait
-- impossible.
create or replace function block_activity_mutation()
returns trigger language plpgsql set search_path = public as $$
begin
  if is_admin() then return new; end if;

  if (new.type, new.direction, new.outcome, new.content,
      new.contact_id, new.opportunity_id, new.occurred_at, new.author_name)
     is distinct from
     (old.type, old.direction, old.outcome, old.content,
      old.contact_id, old.opportunity_id, old.occurred_at, old.author_name)
  then
    raise exception 'Le journal d''activité est immuable : ajoute une nouvelle entrée plutôt que de corriger celle-ci.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

-- UPDATE uniquement : un BEFORE DELETE se déclencherait aussi sur les
-- suppressions en cascade (contacts -> activities) et rendrait tout effacement
-- de contact impossible — y compris une demande d'effacement RGPD.
-- Le DELETE est verrouillé pour setter/closer par l'absence de policy RLS.
create trigger t_activities_immutable
  before update on activities
  for each row execute function block_activity_mutation();

-- 11.7 Relances automatiques après un RDV honoré.
--      Posées en base plutôt que dans l'application : un RDV marqué honoré
--      par n8n ou par l'API doit produire les mêmes relances qu'un clic.
create or replace function creer_relances_auto()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r record; v_gagnee boolean; v_perdue boolean; v_assignee uuid; v_contact uuid;
begin
  if new.status <> 'honore' then return null; end if;
  if tg_op = 'UPDATE' and old.status = 'honore' then return null; end if;

  select o.won_at is not null, o.lost_at is not null,
         coalesce(o.setter_id, o.closer_id, o.created_by), o.contact_id
    into v_gagnee, v_perdue, v_assignee, v_contact
    from opportunities o where o.id = new.opportunity_id;

  -- Une affaire déjà conclue ou perdue n'a pas à être relancée.
  if v_gagnee or v_perdue then return null; end if;

  for r in select * from relance_rules where is_active order by position loop
    -- Idempotent : rejouer le passage en « honoré » ne duplique rien.
    if not exists (select 1 from tasks t
                    where t.opportunity_id = new.opportunity_id
                      and t.relance_rule_id = r.id) then
      insert into tasks (opportunity_id, contact_id, title, details, due_at,
                         assignee_id, created_by, relance_rule_id)
      values (new.opportunity_id, coalesce(new.contact_id, v_contact), r.label,
              'Relance automatique ' || r.delai_jours || ' jour(s) après le rendez-vous.',
              new.scheduled_at + (r.delai_jours || ' days')::interval,
              coalesce(new.host_id, v_assignee), coalesce(new.host_id, v_assignee), r.id);
    end if;
  end loop;

  return null;
end;
$$;

create trigger t_appointment_relances_auto
  after insert or update of status on appointments
  for each row execute function creer_relances_auto();

-- 11.8 Une affaire conclue ou perdue annule ses relances automatiques.
--      Les relances écrites à la main sont laissées : si quelqu'un les a
--      saisies, c'est qu'il avait une raison.
create or replace function annuler_relances_auto()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update tasks set status = 'annule'
   where opportunity_id = new.id
     and relance_rule_id is not null
     and status = 'a_faire';
  return null;
end;
$$;

-- Le filtre est dans la clause WHEN et non dans `update of won_at` : ce
-- dernier se déclenche selon les colonnes citées dans le SET, or won_at est
-- posé par le trigger BEFORE stamp_won_lost et n'y figure jamais.
create trigger t_opportunity_annule_relances
  after update on opportunities
  for each row
  when ((new.won_at is not null or new.lost_at is not null)
        and old.won_at is null and old.lost_at is null)
  execute function annuler_relances_auto();

-- =====================================================================
-- 12. VUES DE MESURE
-- =====================================================================

-- 12.1 Étape maximale atteinte par opportunité (courante + historique)
create or replace view v_opportunity_reach
with (security_invoker = on) as
select
  o.id as opportunity_id,
  o.contact_id,
  o.source_id,
  o.setter_id,
  o.closer_id,
  o.created_at,
  o.won_at,
  o.lost_at,
  o.amount_signed,
  o.is_disqualified,
  greatest(
    coalesce((select ps.position
                from pipeline_stages ps
               where ps.id = o.stage_id
                 and not ps.is_lost), 0),
    coalesce((select max(ps2.position)
                from stage_transitions st
                join pipeline_stages ps2 on ps2.id = st.to_stage_id
               where st.opportunity_id = o.id
                 and not ps2.is_lost), 0)
  ) as max_position_reached
from opportunities o;

comment on view v_opportunity_reach is
  'Position d''étape maximale atteinte, étapes perdues exclues du max. Base des taux de conversion cumulés.';

-- 12.2 Entonnoir : combien d'opportunités ont atteint chaque étape
create or replace view v_funnel
with (security_invoker = on) as
select
  ps.position,
  ps.key,
  ps.label,
  (select count(*)
     from v_opportunity_reach r
    where not r.is_disqualified
      and r.max_position_reached >= ps.position) as reached
from pipeline_stages ps
where ps.is_active and not ps.is_lost
order by ps.position;

comment on view v_funnel is
  'Entonnoir global. Les opportunités hors ICP sont exclues pour ne pas polluer les taux. Filtrer par période/source/personne côté applicatif via v_opportunity_reach.';

-- 12.3 Show rate par type de RDV
create or replace view v_show_rate
with (security_invoker = on) as
select
  a.kind,
  date_trunc('month', a.scheduled_at) as month,
  a.host_id,
  count(*) filter (where a.status in ('honore','no_show')) as rdv_aboutis,
  count(*) filter (where a.status = 'honore')              as honores,
  round(
    100.0 * count(*) filter (where a.status = 'honore')
    / nullif(count(*) filter (where a.status in ('honore','no_show')), 0), 1
  ) as show_rate_pct
from appointments a
group by a.kind, date_trunc('month', a.scheduled_at), a.host_id;

-- 12.4 Ventes
create or replace view v_sales
with (security_invoker = on) as
select
  o.id as opportunity_id,
  o.contact_id,
  c.full_name,
  c.company,
  s.label     as source,
  p.full_name as closer,
  o.amount_signed,
  o.payment_plan,
  o.payment_processor,
  o.legal_entity,
  o.setter_paid,
  o.won_at,
  extract(epoch from (o.won_at - o.created_at)) / 86400.0 as cycle_days
from opportunities o
join contacts c        on c.id = o.contact_id
left join sources s    on s.id = o.source_id
left join profiles p   on p.id = o.closer_id
where o.won_at is not null;

-- =====================================================================
-- 13. ROW LEVEL SECURITY
-- =====================================================================

alter table profiles          enable row level security;
alter table sources           enable row level security;
alter table pipeline_stages   enable row level security;
alter table lost_reasons      enable row level security;
alter table relance_rules     enable row level security;
alter table contacts          enable row level security;
alter table opportunities     enable row level security;
alter table activities        enable row level security;
alter table appointments      enable row level security;
alter table tasks             enable row level security;
alter table stage_transitions enable row level security;
alter table payments          enable row level security;

-- 13.1 Principe : tout utilisateur authentifié ET ACTIF lit tout.
--      Exception sur profiles : chacun lit toujours le sien, même désactivé,
--      sinon l'application ne peut pas lui expliquer pourquoi elle le refuse.
create policy read_all on profiles          for select to authenticated using (id = auth.uid() or est_actif());
create policy read_all on sources           for select to authenticated using (est_actif());
create policy read_all on pipeline_stages   for select to authenticated using (est_actif());
create policy read_all on lost_reasons      for select to authenticated using (est_actif());
create policy read_all on relance_rules     for select to authenticated using (est_actif());
create policy read_all on contacts          for select to authenticated using (est_actif());
create policy read_all on opportunities     for select to authenticated using (est_actif());
create policy read_all on activities        for select to authenticated using (est_actif());
create policy read_all on appointments      for select to authenticated using (est_actif());
create policy read_all on tasks             for select to authenticated using (est_actif());
create policy read_all on stage_transitions for select to authenticated using (est_actif());
create policy read_all on payments          for select to authenticated using (est_actif());

-- 13.2 Config : écriture admin seulement.
create policy admin_write on sources         for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_write on pipeline_stages for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_write on lost_reasons    for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_write on relance_rules   for all to authenticated using (is_admin()) with check (is_admin());

-- 13.3 Profils : chacun modifie le sien (sauf son rôle), l'admin modifie tout.
create policy self_update on profiles
  for update to authenticated
  using (is_admin() or (id = auth.uid() and est_actif()))
  with check (
    is_admin()
    -- Personne ne s'auto-promeut ni ne se réactive tout seul.
    or (id = auth.uid() and est_actif()
        and role = current_role_name()
        and is_active = true)
  );

create policy admin_manage on profiles
  for all to authenticated
  using (is_admin()) with check (is_admin());

-- 13.4 Contacts : création libre pour tout rôle actif ;
--      modification si on en est propriétaire, ou si le contact est au pool.
create policy insert_own on contacts
  for insert to authenticated
  with check (est_actif() and (created_by = auth.uid() or is_admin()));

create policy update_owned_or_pool on contacts
  for update to authenticated
  using (est_actif() and (is_admin() or owner_id = auth.uid() or owner_id is null))
  with check (est_actif() and (is_admin() or owner_id = auth.uid() or owner_id is null));

create policy admin_delete on contacts
  for delete to authenticated
  using (is_admin());

-- 13.5 Opportunités : le setter porte les siennes et le pool,
--      le closer porte celles dont il est closer.
create policy insert_opportunity on opportunities
  for insert to authenticated
  with check (est_actif() and (is_admin() or setter_id = auth.uid() or closer_id = auth.uid() or setter_id is null));

create policy update_carried on opportunities
  for update to authenticated
  using (
    est_actif() and (
      is_admin()
      or (current_role_name() = 'setter' and (setter_id = auth.uid() or setter_id is null))
      or (current_role_name() = 'closer' and closer_id = auth.uid())
    )
  )
  with check (
    est_actif() and (
      is_admin()
      or (current_role_name() = 'setter' and (setter_id = auth.uid() or setter_id is null))
      or (current_role_name() = 'closer' and closer_id = auth.uid())
    )
  );

create policy admin_delete on opportunities
  for delete to authenticated using (is_admin());

-- 13.6 Activités : chacun écrit les siennes, personne ne les modifie
--      (le trigger 11.6 double-verrouille).
create policy insert_own on activities
  for insert to authenticated
  with check (est_actif() and author_id = auth.uid());

create policy admin_all on activities
  for all to authenticated
  using (is_admin()) with check (is_admin());

-- 13.7 RDV, tâches : création libre, modification par l'hôte/assigné ou l'admin.
create policy insert_any on appointments
  for insert to authenticated with check (est_actif() and (created_by = auth.uid() or is_admin()));

create policy update_host on appointments
  for update to authenticated
  using (est_actif() and (is_admin() or host_id = auth.uid() or created_by = auth.uid()))
  with check (est_actif() and (is_admin() or host_id = auth.uid() or created_by = auth.uid()));

create policy admin_delete on appointments
  for delete to authenticated using (is_admin());

create policy insert_any on tasks
  for insert to authenticated with check (est_actif() and (created_by = auth.uid() or is_admin()));

create policy update_assignee on tasks
  for update to authenticated
  using (est_actif() and (is_admin() or assignee_id = auth.uid() or created_by = auth.uid()))
  with check (est_actif() and (is_admin() or assignee_id = auth.uid() or created_by = auth.uid()));

create policy admin_delete on tasks
  for delete to authenticated using (is_admin());

-- 13.8 Paiements : saisie admin/closer en v1.
create policy write_payments on payments
  for all to authenticated
  using (
    est_actif() and (
      is_admin()
      or exists (select 1 from opportunities o where o.id = payments.opportunity_id and o.closer_id = auth.uid())
    )
  )
  with check (
    est_actif() and (
      is_admin()
      or exists (select 1 from opportunities o where o.id = payments.opportunity_id and o.closer_id = auth.uid())
    )
  );

-- 13.9 stage_transitions : lecture seule côté client, écriture par trigger
--      (fonction SECURITY DEFINER, donc pas de policy d'insert nécessaire).

-- =====================================================================
-- 13bis. DURCISSEMENT DES FONCTIONS
--        PostgREST expose toute fonction du schéma public en /rest/v1/rpc/.
--        Les fonctions de trigger n'ont rien à y faire.
-- =====================================================================

-- Postgres accorde EXECUTE à PUBLIC par défaut sur toute fonction : révoquer
-- à anon/authenticated seuls ne suffit pas, il faut viser PUBLIC.
-- Le déclenchement d'un trigger ne vérifie pas EXECUTE sur sa fonction :
-- ces révocations n'empêchent aucun trigger de s'exécuter.
revoke execute on function handle_new_user()         from public, anon, authenticated;
revoke execute on function log_stage_transition()    from public, anon, authenticated;
revoke execute on function stamp_won_lost()          from public, anon, authenticated;
revoke execute on function sync_no_show_flag()       from public, anon, authenticated;
revoke execute on function require_lost_reason()     from public, anon, authenticated;
revoke execute on function block_activity_mutation() from public, anon, authenticated;
revoke execute on function figer_auteur_activite()   from public, anon, authenticated;
revoke execute on function touch_updated_at()        from public, anon, authenticated;
revoke execute on function creer_relances_auto()     from public, anon, authenticated;
revoke execute on function annuler_relances_auto()   from public, anon, authenticated;

-- is_admin() et current_role_name() sont évaluées DANS les policies RLS, avec
-- les droits de l'appelant : authenticated doit conserver EXECUTE.
revoke execute on function is_admin()          from public, anon;
revoke execute on function current_role_name() from public, anon;
revoke execute on function est_actif()         from public, anon;
grant  execute on function is_admin()          to authenticated;
grant  execute on function current_role_name() to authenticated;
grant  execute on function est_actif()         to authenticated;

-- =====================================================================
-- 14. SEED DE CONFIGURATION
--     (§10 du CDC — à valider, ce sont des lignes éditables dans l'admin)
-- =====================================================================

-- Étapes reprises telles quelles du CRM existant (COCKPIT SUIVI).
-- « Mauvais ICP » est une étape perdue ET porte is_disqualified sur
-- l'opportunité : visible dans le kanban, exclue des taux de conversion.
-- Closé en dernier : la colonne des ventes se lit à droite du kanban, après
-- les impasses. L'ordre des positions ne fausse pas l'entonnoir, qui exclut
-- les étapes perdues du calcul de « position maximale atteinte ».
insert into pipeline_stages (key, label, position, is_won, is_lost) values
  ('lead',        'Lead',        1, false, false),
  ('en_attente',  'En attente',  2, false, false),
  ('perdu',       'Perdu',       3, false, true),
  ('mauvais_icp', 'Mauvais ICP', 4, false, true),
  ('close',       'Closé',       5, true,  false);

-- « Source » désigne qui amène le RDV, pas le canal d'acquisition.
insert into sources (key, label, position) values
  ('direct', 'Direct', 1),
  ('setter', 'Setter', 2);

insert into relance_rules (label, delai_jours, position) values
  ('Relance J+2', 2, 1),
  ('Relance J+5', 5, 2);

insert into lost_reasons (key, label, position) values
  ('budget',        'Budget',            1),
  ('timing',        'Pas le bon moment', 2),
  ('pas_decideur',  'Pas décideur',      3),
  ('hors_icp',      'Hors ICP',          4),
  ('ghosting',      'Ghosting',          5),
  ('concurrent',    'Parti chez un concurrent', 6),
  ('autre',         'Autre',             99);

-- =====================================================================
-- 15. POINT D'ENTRÉE AUTOMATISATION (n8n)
--     Un RDV reçu par mail = contact + opportunité + rendez-vous.
--     Une seule transaction : trois appels HTTP enchaînés laisseraient un
--     contact orphelin si l'un d'eux échouait.
-- =====================================================================

create or replace function crm_entree_rdv(
  p_nom          text,
  p_date_rdv     timestamptz,
  p_email        text default null,
  p_telephone    text default null,
  p_entreprise   text default null,
  p_source       text default null,            -- 'direct' | 'setter'
  p_type         text default 'closing',       -- 'setting' | 'closing' | 'suivi'
  p_duree_min    int  default 45,
  p_lieu         text default null,
  p_notes        text default null
)
returns jsonb
language plpgsql
security definer
-- `extensions` est nécessaire : citext y a été déplacé pour ne pas exposer
-- ses fonctions dans l'API REST.
set search_path = public, extensions
as $$
declare
  v_hote uuid; v_source uuid; v_contact uuid; v_opp uuid; v_rdv uuid; v_etape uuid;
  v_cree_contact boolean := false;
  v_cree_opp     boolean := false;
  v_doublon      boolean := false;
begin
  if coalesce(trim(p_nom), '') = '' then
    raise exception 'Le nom est obligatoire.' using errcode = 'check_violation';
  end if;
  if p_date_rdv is null then
    raise exception 'La date du rendez-vous est obligatoire.' using errcode = 'check_violation';
  end if;

  select id into v_hote from profiles
   where role = 'admin' and is_active order by created_at limit 1;
  if v_hote is null then
    raise exception 'Aucun administrateur actif : impossible d''attribuer le RDV.';
  end if;

  select id into v_source from sources where key = p_source and is_active;

  -- 1. Contact : retrouvé par e-mail (citext, insensible à la casse), à
  --    défaut par téléphone normalisé. Sinon créé.
  if nullif(trim(p_email), '') is not null then
    select id into v_contact from contacts
     where email = trim(p_email)::citext order by created_at limit 1;
  end if;

  if v_contact is null and nullif(trim(p_telephone), '') is not null then
    select id into v_contact from contacts
     where regexp_replace(coalesce(phone, ''), '\D', '', 'g') =
           regexp_replace(p_telephone, '\D', '', 'g')
       and regexp_replace(p_telephone, '\D', '', 'g') <> ''
     order by created_at limit 1;
  end if;

  if v_contact is null then
    insert into contacts (full_name, email, phone, company, source_id, owner_id, created_by, notes)
    values (trim(p_nom), nullif(trim(p_email), '')::citext, nullif(trim(p_telephone), ''),
            nullif(trim(p_entreprise), ''), v_source, v_hote, v_hote, nullif(trim(p_notes), ''))
    returning id into v_contact;
    v_cree_contact := true;
  else
    -- Contact connu : on comble les trous sans écraser l'existant.
    update contacts set
      email   = coalesce(email, nullif(trim(p_email), '')::citext),
      phone   = coalesce(phone, nullif(trim(p_telephone), '')),
      company = coalesce(company, nullif(trim(p_entreprise), ''))
    where id = v_contact;
  end if;

  -- 2. Opportunité encore ouverte réutilisée, sinon nouvelle. Un contact
  --    reclosé plus tard aura donc deux opportunités distinctes et les taux
  --    resteront justes.
  select o.id into v_opp from opportunities o
   where o.contact_id = v_contact and o.won_at is null and o.lost_at is null
   order by o.created_at desc limit 1;

  if v_opp is null then
    select id into v_etape from pipeline_stages where key = 'lead';
    insert into opportunities (contact_id, stage_id, source_id, closer_id, created_by)
    values (v_contact, v_etape, v_source, v_hote, v_hote)
    returning id into v_opp;
    v_cree_opp := true;
  end if;

  -- 3. Le RDV fait passer l'opportunité en « En attente ».
  select id into v_etape from pipeline_stages where key = 'en_attente';
  update opportunities set stage_id = v_etape, source_id = coalesce(source_id, v_source)
   where id = v_opp and stage_id <> v_etape;

  -- 4. Idempotent sur (opportunité, créneau) : n8n peut rejouer un webhook.
  select id into v_rdv from appointments
   where opportunity_id = v_opp and scheduled_at = p_date_rdv;

  if v_rdv is not null then
    v_doublon := true;
  else
    insert into appointments (opportunity_id, contact_id, kind, scheduled_at, duration_min,
                              status, host_id, location, notes, created_by)
    values (v_opp, v_contact, coalesce(nullif(trim(p_type), ''), 'closing')::appointment_kind,
            p_date_rdv, coalesce(p_duree_min, 45), 'planifie', v_hote,
            nullif(trim(p_lieu), ''), nullif(trim(p_notes), ''), v_hote)
    returning id into v_rdv;
  end if;

  return jsonb_build_object(
    'contact_id', v_contact, 'opportunity_id', v_opp, 'appointment_id', v_rdv,
    'contact_cree', v_cree_contact, 'opportunite_creee', v_cree_opp,
    'rdv_deja_present', v_doublon);
end;
$$;

comment on function crm_entree_rdv is
  'Point d''entrée n8n : contact + opportunité + RDV en une transaction. Idempotent sur (opportunité, créneau).';

-- Réservée au service_role, la clé que porte n8n.
revoke execute on function crm_entree_rdv(text, timestamptz, text, text, text, text, text, int, text, text)
  from public, anon, authenticated;
grant execute on function crm_entree_rdv(text, timestamptz, text, text, text, text, text, int, text, text)
  to service_role;
