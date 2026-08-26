'use client'

import { useState, useMemo, useTransition, useDeferredValue } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Carte, Badge, EnTetePage, Vide, styleChamp, styleChampInline, styleBouton, styleBoutonDoux } from '@/components/ui'
import { PanneauNouveauContact } from '@/components/panneau-nouveau-contact'
import { PanneauImport } from '@/components/panneau-import'
import { SuppressionContact } from '@/components/suppression-contact'
import { BoutonCloser } from '@/components/bouton-closer'
import { euros, jour, initiales, LIBELLE_ICP } from '@/lib/format'

export type LigneContact = {
  id: string
  nom: string
  email: string | null
  telephone: string | null
  entreprise: string | null
  icp: string
  cree_le: string
  source: string | null
  proprietaire: string | null
  estMoi: boolean
  sansProprietaire: boolean
  opportuniteId: string | null
  etape: string | null
  gagnee: boolean
  perdue: boolean
  montant: number | null
}

type Tri = 'recent' | 'nom' | 'montant'

function sansAccent(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function TableContacts({
  lignes,
  sources,
  estAdmin,
}: {
  lignes: LigneContact[]
  sources: { id: string; label: string }[]
  estAdmin: boolean
}) {
  const router = useRouter()
  const [enCours, demarrer] = useTransition()

  const [recherche, setRecherche] = useState('')
  const [etape, setEtape] = useState('')
  const [appartenance, setAppartenance] = useState<'' | 'moi' | 'pool'>('')
  const [tri, setTri] = useState<Tri>('recent')
  const [panneau, setPanneau] = useState<'aucun' | 'nouveau' | 'import'>('aucun')

  // Le filtrage suit la frappe sans la bloquer.
  const rechercheDifferee = useDeferredValue(recherche)

  const etapes = useMemo(
    () => [...new Set(lignes.map((l) => l.etape).filter(Boolean))] as string[],
    [lignes],
  )

  const filtrees = useMemo(() => {
    const q = sansAccent(rechercheDifferee.trim())
    let r = lignes

    if (q) {
      r = r.filter((l) =>
        sansAccent(
          [l.nom, l.email, l.entreprise, l.telephone].filter(Boolean).join(' '),
        ).includes(q),
      )
    }
    if (etape) r = r.filter((l) => l.etape === etape)
    if (appartenance === 'moi') r = r.filter((l) => l.estMoi)
    if (appartenance === 'pool') r = r.filter((l) => l.sansProprietaire)

    const trie = [...r]
    if (tri === 'nom') trie.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
    else if (tri === 'montant') trie.sort((a, b) => (b.montant ?? -1) - (a.montant ?? -1))
    else trie.sort((a, b) => b.cree_le.localeCompare(a.cree_le))
    return trie
  }, [lignes, rechercheDifferee, etape, appartenance, tri])

  const caFiltre = filtrees.reduce((s, l) => s + (l.gagnee ? (l.montant ?? 0) : 0), 0)
  const filtreActif = !!(recherche || etape || appartenance)

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-8 sm:px-6">
      <EnTetePage
        titre="Contacts"
        sous={
          filtreActif
            ? `${filtrees.length} sur ${lignes.length}${caFiltre ? ` · ${euros(caFiltre)} signés` : ''}`
            : `${lignes.length} contact${lignes.length > 1 ? 's' : ''}${caFiltre ? ` · ${euros(caFiltre)} signés` : ''}`
        }
        action={
          <div className="flex gap-2">
            <button
              onClick={() => setPanneau(panneau === 'import' ? 'aucun' : 'import')}
              className={styleBoutonDoux}
            >
              Importer un CSV
            </button>
            <button
              onClick={() => setPanneau(panneau === 'nouveau' ? 'aucun' : 'nouveau')}
              className={styleBouton}
            >
              Nouveau contact
            </button>
          </div>
        }
      />

      {panneau === 'nouveau' && (
        <PanneauNouveauContact
          sources={sources}
          onFini={() => { setPanneau('aucun'); demarrer(() => router.refresh()) }}
          onAnnuler={() => setPanneau('aucun')}
        />
      )}

      {panneau === 'import' && (
        <PanneauImport
          onFini={() => demarrer(() => router.refresh())}
          onFermer={() => setPanneau('aucun')}
        />
      )}

      {/* ------------------------------------------------------- filtres */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-texte-faible"
            width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher…"
            className={`${styleChamp} pl-9`}
          />
          {recherche && (
            <button
              onClick={() => setRecherche('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-texte-faible transition hover:text-texte"
              aria-label="Effacer"
            >
              ×
            </button>
          )}
        </div>

        <select value={etape} onChange={(e) => setEtape(e.target.value)} className={styleChampInline}>
          <option value="">Tous les statuts</option>
          {etapes.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>

        <div className="flex gap-0.5 rounded-lg border border-bordure p-0.5">
          {([['', 'Tous'], ['moi', 'À moi'], ['pool', 'Pool']] as const).map(([v, l]) => (
            <button
              key={v}
              onClick={() => setAppartenance(v)}
              className={`rounded-md px-2.5 py-1.5 text-sm transition ${
                appartenance === v ? 'bg-surface-2 text-texte' : 'text-texte-doux hover:text-texte'
              }`}
            >
              {l}
            </button>
          ))}
        </div>

        <select value={tri} onChange={(e) => setTri(e.target.value as Tri)} className={`${styleChampInline} ml-auto`}>
          <option value="recent">Plus récents</option>
          <option value="nom">Nom (A→Z)</option>
          <option value="montant">Montant décroissant</option>
        </select>
      </div>

      {/* -------------------------------------------------------- tableau */}
      {!filtrees.length ? (
        <Vide
          titre={lignes.length ? 'Aucun résultat' : 'Aucun contact'}
          sous={
            lignes.length
              ? 'Aucun contact ne correspond à ces filtres.'
              : 'Crée un contact ou importe un CSV pour démarrer.'
          }
          action={
            filtreActif ? (
              <button
                onClick={() => { setRecherche(''); setEtape(''); setAppartenance('') }}
                className={styleBoutonDoux}
              >
                Réinitialiser les filtres
              </button>
            ) : undefined
          }
        />
      ) : (
        <Carte className={`overflow-hidden transition-opacity ${enCours ? 'opacity-60' : ''}`}>
          <div className="scroll-fin overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-surface">
                <tr className="border-b border-bordure text-left text-xs text-texte-faible">
                  <th className="px-4 py-2.5 font-medium">Contact</th>
                  <th className="px-4 py-2.5 font-medium">Statut</th>
                  <th className="px-4 py-2.5 text-right font-medium">Montant</th>
                  <th className="px-4 py-2.5 font-medium">Source</th>
                  <th className="px-4 py-2.5 font-medium">Créé</th>
                  <th className="px-2 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-bordure">
                {filtrees.map((l) => (
                  <tr key={l.id} className="group transition hover:bg-surface-2/60">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[10px] font-medium text-texte-doux">
                          {initiales(l.nom)}
                        </span>
                        <div className="min-w-0">
                          {l.opportuniteId ? (
                            <Link
                              href={`/opportunites/${l.opportuniteId}`}
                              prefetch={false}
                              className="block truncate font-medium transition group-hover:text-altitude"
                            >
                              {l.nom}
                            </Link>
                          ) : (
                            <span className="block truncate font-medium">{l.nom}</span>
                          )}
                          <p className="truncate text-xs text-texte-faible">
                            {l.email ?? l.telephone ?? '—'}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-2.5">
                      {l.etape ? (
                        <Badge ton={l.gagnee ? 'succes' : l.perdue ? 'danger' : 'altitude'}>
                          {l.etape}
                        </Badge>
                      ) : (
                        <Badge>{LIBELLE_ICP[l.icp] ?? '—'}</Badge>
                      )}
                    </td>

                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {l.montant ? (
                        <span className={l.gagnee ? 'text-succes' : 'text-texte-doux'}>
                          {euros(l.montant)}
                        </span>
                      ) : (
                        <span className="text-texte-faible">—</span>
                      )}
                    </td>

                    <td className="px-4 py-2.5 text-texte-doux">{l.source ?? '—'}</td>

                    <td className="whitespace-nowrap px-4 py-2.5 text-texte-faible">
                      {jour(l.cree_le)}
                    </td>

                    <td className="whitespace-nowrap px-2 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        {/* Closable seulement tant que l'affaire est ouverte. */}
                        {l.opportuniteId && !l.gagnee && !l.perdue && (
                          <BoutonCloser opportuniteId={l.opportuniteId} contact={l.nom} />
                        )}
                        {estAdmin && <SuppressionContact contactId={l.id} nom={l.nom} />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Carte>
      )}
    </div>
  )
}
