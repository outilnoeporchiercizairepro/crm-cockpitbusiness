-- =====================================================================
-- Le setter est en lecture seule, sauf les notes du contact
--
-- Il consulte son périmètre et peut y ajouter de l'information. Il ne
-- déplace pas d'étape, ne crée ni contact ni opportunité, ne pose ni RDV
-- ni relance.
--
-- La restriction est en base : l'interface masque déjà ces gestes, mais
-- un POST direct sur PostgREST ne passe pas par l'interface.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Contacts : mise à jour limitée à la colonne `notes`.
--
-- La RLS filtre des lignes, pas des colonnes : il faut un trigger. On
-- lève une exception plutôt que de réécrire silencieusement les valeurs
-- refusées — une écriture ignorée qui répond « ok » est pire que rien.
-- ---------------------------------------------------------------------
create or replace function setter_limite_aux_notes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if is_admin() or current_role_name() is distinct from 'setter' then
    return new;
  end if;

  -- Comparaison de la ligne entière moins les colonnes autorisées : ajouter
  -- une colonne à la table la verrouille automatiquement, sans y penser.
  if (to_jsonb(new) - 'notes' - 'updated_at') is distinct from (to_jsonb(old) - 'notes' - 'updated_at') then
    raise exception 'Un setter ne peut modifier que les notes du contact.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists t_setter_limite_notes on contacts;
create trigger t_setter_limite_notes
  before update on contacts
  for each row execute function setter_limite_aux_notes();

-- Création de contact : plus ouverte aux setters.
drop policy if exists insert_own on contacts;
create policy insert_own on contacts
  for insert to authenticated
  with check (est_actif()
              and (created_by = auth.uid() or is_admin())
              and source_autorisee(source_id)
              and (is_admin() or current_role_name() is distinct from 'setter'));

-- ---------------------------------------------------------------------
-- Opportunités : ni création ni modification. C'est ici que se jouait le
-- déplacement d'étape, qui n'est qu'un update de stage_id.
-- ---------------------------------------------------------------------
drop policy if exists insert_opportunity on opportunities;
create policy insert_opportunity on opportunities
  for insert to authenticated
  with check (est_actif()
              and source_autorisee(source_id)
              and (is_admin() or (current_role_name() = 'closer' and closer_id = auth.uid())));

drop policy if exists update_carried on opportunities;
create policy update_carried on opportunities
  for update to authenticated
  using (
    est_actif() and source_autorisee(source_id)
    and (is_admin() or (current_role_name() = 'closer' and closer_id = auth.uid()))
  )
  with check (
    est_actif() and source_autorisee(source_id)
    and (is_admin() or (current_role_name() = 'closer' and closer_id = auth.uid()))
  );

-- ---------------------------------------------------------------------
-- Journal, rendez-vous, relances : lecture seule pour le setter.
-- ---------------------------------------------------------------------
drop policy if exists insert_own on activities;
create policy insert_own on activities
  for insert to authenticated
  with check (est_actif() and author_id = auth.uid()
              and (is_admin() or current_role_name() is distinct from 'setter'));

drop policy if exists insert_any on appointments;
create policy insert_any on appointments
  for insert to authenticated
  with check (est_actif() and (created_by = auth.uid() or is_admin())
              and (is_admin() or current_role_name() is distinct from 'setter'));

drop policy if exists update_host on appointments;
create policy update_host on appointments
  for update to authenticated
  using (est_actif() and (is_admin() or host_id = auth.uid() or created_by = auth.uid())
         and (is_admin() or current_role_name() is distinct from 'setter'))
  with check (est_actif() and (is_admin() or host_id = auth.uid() or created_by = auth.uid())
              and (is_admin() or current_role_name() is distinct from 'setter'));

drop policy if exists insert_any on tasks;
create policy insert_any on tasks
  for insert to authenticated
  with check (est_actif() and (created_by = auth.uid() or is_admin())
              and (is_admin() or current_role_name() is distinct from 'setter'));

drop policy if exists update_assignee on tasks;
create policy update_assignee on tasks
  for update to authenticated
  using (est_actif() and (is_admin() or assignee_id = auth.uid() or created_by = auth.uid())
         and (is_admin() or current_role_name() is distinct from 'setter'))
  with check (est_actif() and (is_admin() or assignee_id = auth.uid() or created_by = auth.uid())
              and (is_admin() or current_role_name() is distinct from 'setter'));
