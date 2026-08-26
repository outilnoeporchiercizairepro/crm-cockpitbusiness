'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  creerUtilisateur, definirMotDePasse, definirActif, majRole, supprimerUtilisateur,
  type Resultat,
} from '@/app/actions-admin'
import { Carte, Badge, styleChamp, styleChampInline, styleBouton, styleBoutonDoux } from '@/components/ui'
import { initiales } from '@/lib/format'
import type { Profile, UserRole } from '@/lib/database.types'

/** Mot de passe lisible et solide, pour ne pas en inventer un à la main. */
function motDePasseSuggere() {
  const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const valeurs = crypto.getRandomValues(new Uint32Array(16))
  return Array.from(valeurs, (v) => alphabet[v % alphabet.length]).join('')
}

export function AdminUtilisateurs({
  profils,
  moi,
  cleServicePresente,
}: {
  profils: Profile[]
  moi: string
  cleServicePresente: boolean
}) {
  const router = useRouter()
  const [, demarrer] = useTransition()
  const [creation, setCreation] = useState(false)
  const [mdpNouveau, setMdpNouveau] = useState('')
  const [ouvert, setOuvert] = useState<string | null>(null)
  const [mdpRemplacement, setMdpRemplacement] = useState('')
  const [retour, setRetour] = useState<Resultat | null>(null)

  function agir(fn: () => Promise<Resultat>, apres?: () => void) {
    demarrer(async () => {
      const r = await fn()
      setRetour(r)
      if (r.ok) { apres?.(); router.refresh() }
    })
  }

  return (
    <Carte className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-bordure px-4 py-3">
        <div>
          <h2 className="text-sm font-medium">Utilisateurs</h2>
          <p className="mt-1 text-xs text-texte-faible">
            Tu crées les comptes et leur mot de passe ici. Aucun e-mail n&apos;est envoyé :
            transmets le mot de passe de vive voix, la personne se connecte directement.
          </p>
        </div>
        <button
          onClick={() => {
            setCreation((v) => !v)
            setRetour(null)
            if (!creation) setMdpNouveau(motDePasseSuggere())
          }}
          className={creation ? styleBoutonDoux : styleBouton}
        >
          {creation ? 'Annuler' : 'Nouveau compte'}
        </button>
      </div>

      {!cleServicePresente && (
        <div className="border-b border-bordure bg-alerte/8 px-4 py-3">
          <p className="text-sm text-alerte">Clé de service absente</p>
          <p className="mt-1 text-sm text-texte-doux">
            Sans elle, impossible de créer un compte ou de changer un mot de passe.
            Récupère-la dans Supabase → <span className="text-texte">Project Settings → API Keys</span>{' '}
            (clé <code className="text-texte">service_role</code> / secret), puis ajoute dans{' '}
            <code className="text-texte">app/.env.local</code> :
          </p>
          <pre className="mt-2 overflow-x-auto rounded-lg border border-bordure bg-fond px-3 py-2 text-xs text-texte-doux">
SUPABASE_SECRET_KEY=sb_secret_…
          </pre>
          <p className="mt-2 text-xs text-texte-faible">
            Ne la préfixe jamais de NEXT_PUBLIC_ : elle partirait dans le navigateur
            et donnerait les pleins droits sur la base à n&apos;importe qui.
          </p>
        </div>
      )}

      {retour && (
        <p
          className={`apparait border-b border-bordure px-4 py-2 text-sm ${
            retour.ok ? 'bg-succes/8 text-succes' : 'bg-danger/8 text-danger'
          }`}
        >
          {retour.ok ? (retour.message ?? 'Fait.') : retour.erreur}
        </p>
      )}

      {creation && (
        <form
          action={(fd) => agir(() => creerUtilisateur(fd), () => { setCreation(false); setMdpNouveau('') })}
          className="apparait border-b border-bordure bg-surface-2/40 p-4"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs text-texte-doux">Nom complet</label>
              <input name="full_name" required placeholder="Sam Setter" className={styleChamp} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-texte-doux">Adresse e-mail</label>
              <input name="email" type="email" required placeholder="sam@altitude.fr" className={styleChamp} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-texte-doux">Rôle</label>
              <select name="role" className={styleChamp} defaultValue="setter">
                <option value="setter">Setter</option>
                <option value="closer">Closer</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-texte-doux">
                Mot de passe <span className="text-texte-faible">(10 caractères minimum)</span>
              </label>
              <div className="flex gap-2">
                <input
                  name="password"
                  required
                  minLength={10}
                  value={mdpNouveau}
                  onChange={(e) => setMdpNouveau(e.target.value)}
                  className={`${styleChamp} font-mono`}
                />
                <button
                  type="button"
                  onClick={() => setMdpNouveau(motDePasseSuggere())}
                  title="Générer un autre mot de passe"
                  className={styleBoutonDoux}
                >
                  ↻
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button type="submit" disabled={!cleServicePresente} className={styleBouton}>
              Créer le compte
            </button>
            <p className="text-xs text-texte-faible">
              Note le mot de passe maintenant : il ne sera plus affiché.
            </p>
          </div>
        </form>
      )}

      <ul className="divide-y divide-bordure">
        {profils.map((p) => {
          const cestMoi = p.id === moi
          return (
            <li key={p.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                    p.is_active ? 'bg-surface-2 text-texte-doux' : 'bg-surface-2 text-texte-faible'
                  }`}
                >
                  {initiales(p.full_name)}
                </span>

                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-medium ${p.is_active ? '' : 'text-texte-faible line-through'}`}>
                    {p.full_name}
                    {cestMoi && <span className="ml-2 text-xs font-normal text-texte-faible">(toi)</span>}
                  </p>
                  <p className="truncate text-xs text-texte-faible">{p.email}</p>
                </div>

                {!p.is_active && <Badge ton="alerte">Désactivé</Badge>}

                <select
                  value={p.role}
                  disabled={cestMoi}
                  onChange={(e) => agir(() => majRole(p.id, e.target.value as UserRole))}
                  title={cestMoi ? 'Tu ne peux pas changer ton propre rôle' : undefined}
                  className={`${styleChampInline} disabled:opacity-50`}
                >
                  <option value="admin">Admin</option>
                  <option value="setter">Setter</option>
                  <option value="closer">Closer</option>
                </select>

                <button
                  onClick={() => { setOuvert(ouvert === p.id ? null : p.id); setMdpRemplacement(''); setRetour(null) }}
                  className="rounded-md px-2 py-1.5 text-sm text-texte-doux transition hover:bg-surface-2 hover:text-texte"
                >
                  {ouvert === p.id ? 'Fermer' : 'Gérer'}
                </button>
              </div>

              {ouvert === p.id && (
                <div className="apparait mt-3 space-y-3 rounded-lg border border-bordure bg-surface-2/40 p-3">
                  <div>
                    <label className="mb-1.5 block text-xs text-texte-doux">
                      Remplacer le mot de passe
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <input
                        value={mdpRemplacement}
                        onChange={(e) => setMdpRemplacement(e.target.value)}
                        placeholder="Nouveau mot de passe"
                        className={`${styleChamp} flex-1 font-mono`}
                      />
                      <button
                        type="button"
                        onClick={() => setMdpRemplacement(motDePasseSuggere())}
                        className={styleBoutonDoux}
                      >
                        ↻
                      </button>
                      <button
                        disabled={!cleServicePresente || mdpRemplacement.length < 10}
                        onClick={() => agir(() => definirMotDePasse(p.id, mdpRemplacement))}
                        className={styleBouton}
                      >
                        Appliquer
                      </button>
                    </div>
                  </div>

                  {!cestMoi && (
                    <div className="flex flex-wrap gap-2 border-t border-bordure pt-3">
                      <button
                        disabled={!cleServicePresente}
                        onClick={() => agir(() => definirActif(p.id, !p.is_active))}
                        className={styleBoutonDoux}
                      >
                        {p.is_active ? 'Désactiver le compte' : 'Réactiver le compte'}
                      </button>

                      <button
                        disabled={!cleServicePresente}
                        onClick={() => {
                          if (confirm(`Supprimer définitivement le compte de ${p.full_name} ?`)) {
                            agir(() => supprimerUtilisateur(p.id), () => setOuvert(null))
                          }
                        }}
                        className="rounded-lg border border-bordure px-3.5 py-2 text-sm text-texte-doux transition hover:border-danger/50 hover:text-danger disabled:opacity-50"
                      >
                        Supprimer
                      </button>

                      <p className="w-full text-xs text-texte-faible">
                        Désactiver coupe l&apos;accès immédiatement et révoque la session, tout en
                        gardant l&apos;historique intact. Supprimer est définitif, et refusé si la
                        personne a déjà loggé une activité.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </Carte>
  )
}
