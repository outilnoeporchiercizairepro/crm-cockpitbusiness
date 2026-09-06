-- =====================================================================
-- Périmètre d'accès par source
--
-- Un setter ne doit voir que les affaires qu'il ramène. La restriction
-- est portée par la RLS et non par l'interface : masquer un lien de menu
-- n'empêche personne de taper l'URL, ni de lire l'API PostgREST.
--
-- Convention : aucune ligne dans profile_sources = aucune restriction.
-- Sans ce défaut, la migration couperait l'accès de tous les comptes
-- existants à la seconde où elle passe.
-- =====================================================================

create table if not exists profile_sources (
  profile_id uuid not null references profiles(id) on delete cascade,
  source_id  uuid not null references sources(id)  on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, source_id)
);

comment on table profile_sources is
  'Périmètre de visibilité d''un compte. Vide = accès à tout, sous réserve des autres policies.';

alter table profile_sources enable row level security;

drop policy if exists read_own on profile_sources;
create policy read_own on profile_sources
  for select to authenticated
  using (profile_id = auth.uid() or is_admin());

drop policy if exists admin_write on profile_sources;
create policy admin_write on profile_sources
  for all to authenticated
  using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------
-- Helpers. SECURITY DEFINER : ils lisent profile_sources et contacts sans
-- repasser par la RLS, ce qui éviterait une récursion de politique.
-- ---------------------------------------------------------------------

create or replace function source_autorisee(p_source uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select is_admin()
      or not exists (select 1 from profile_sources where profile_id = auth.uid())
      or exists (
           select 1 from profile_sources ps
            where ps.profile_id = auth.uid()
              and ps.source_id = p_source
         );
$$;

comment on function source_autorisee is
  'Vrai si l''appelant peut voir cette source. Un compte restreint ne voit pas les affaires sans source : c''est volontaire, sinon la restriction se contourne en laissant la source vide.';

create or replace function source_du_contact(p_contact uuid)
returns uuid language sql stable security definer set search_path = public
as $$ select source_id from contacts where id = p_contact; $$;

create or replace function source_de_l_opportunite(p_opp uuid)
returns uuid language sql stable security definer set search_path = public
as $$ select source_id from opportunities where id = p_opp; $$;

-- ---------------------------------------------------------------------
-- Lecture : chaque table de données passe par le périmètre.
-- ---------------------------------------------------------------------

drop policy if exists read_all on contacts;
create policy read_all on contacts for select to authenticated
  using (est_actif() and source_autorisee(source_id));

drop policy if exists read_all on opportunities;
create policy read_all on opportunities for select to authenticated
  using (est_actif() and source_autorisee(source_id));

drop policy if exists read_all on activities;
create policy read_all on activities for select to authenticated
  using (est_actif() and source_autorisee(source_du_contact(contact_id)));

drop policy if exists read_all on appointments;
create policy read_all on appointments for select to authenticated
  using (est_actif() and source_autorisee(source_du_contact(contact_id)));

drop policy if exists read_all on tasks;
create policy read_all on tasks for select to authenticated
  using (est_actif() and source_autorisee(source_du_contact(contact_id)));

drop policy if exists read_all on stage_transitions;
create policy read_all on stage_transitions for select to authenticated
  using (est_actif() and source_autorisee(source_de_l_opportunite(opportunity_id)));

drop policy if exists read_all on payments;
create policy read_all on payments for select to authenticated
  using (est_actif() and source_autorisee(source_de_l_opportunite(opportunity_id)));

-- ---------------------------------------------------------------------
-- Écriture : sans ces clauses, un compte restreint pourrait modifier une
-- affaire hors périmètre, ou en créer une pour une source qu'il ne voit
-- pas. La politique UPDATE ne dépend pas de la politique SELECT.
-- ---------------------------------------------------------------------

drop policy if exists insert_own on contacts;
create policy insert_own on contacts
  for insert to authenticated
  with check (est_actif() and (created_by = auth.uid() or is_admin())
              and source_autorisee(source_id));

drop policy if exists update_owned_or_pool on contacts;
create policy update_owned_or_pool on contacts
  for update to authenticated
  using (est_actif() and (is_admin() or owner_id = auth.uid() or owner_id is null)
         and source_autorisee(source_id))
  with check (est_actif() and (is_admin() or owner_id = auth.uid() or owner_id is null)
              and source_autorisee(source_id));

drop policy if exists insert_opportunity on opportunities;
create policy insert_opportunity on opportunities
  for insert to authenticated
  with check (est_actif()
              and (is_admin() or setter_id = auth.uid() or closer_id = auth.uid() or setter_id is null)
              and source_autorisee(source_id));

drop policy if exists update_carried on opportunities;
create policy update_carried on opportunities
  for update to authenticated
  using (
    est_actif() and source_autorisee(source_id) and (
      is_admin()
      or (current_role_name() = 'setter' and (setter_id = auth.uid() or setter_id is null))
      or (current_role_name() = 'closer' and closer_id = auth.uid())
    )
  )
  with check (
    est_actif() and source_autorisee(source_id) and (
      is_admin()
      or (current_role_name() = 'setter' and (setter_id = auth.uid() or setter_id is null))
      or (current_role_name() = 'closer' and closer_id = auth.uid())
    )
  );
