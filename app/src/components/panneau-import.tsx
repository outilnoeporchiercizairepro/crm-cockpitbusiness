'use client'

import { useState, useTransition, useRef } from 'react'
import { importerContacts, type LigneImport, type BilanImport } from '@/app/actions'
import { styleBouton, styleBoutonDoux } from '@/components/ui'

/** Parseur CSV tolérant : guillemets, séparateur ; ou , détecté sur l'en-tête. */
function parserCsv(texte: string): string[][] {
  const premiere = texte.split('\n')[0]
  const sep = (premiere.match(/;/g) ?? []).length > (premiere.match(/,/g) ?? []).length ? ';' : ','

  const lignes: string[][] = []
  let champ = ''
  let ligne: string[] = []
  let dansGuillemets = false

  for (let i = 0; i < texte.length; i++) {
    const c = texte[i]
    if (dansGuillemets) {
      if (c === '"') {
        if (texte[i + 1] === '"') { champ += '"'; i++ }
        else dansGuillemets = false
      } else champ += c
    } else if (c === '"') dansGuillemets = true
    else if (c === sep) { ligne.push(champ); champ = '' }
    else if (c === '\n') { ligne.push(champ); lignes.push(ligne); ligne = []; champ = '' }
    else if (c !== '\r') champ += c
  }
  if (champ || ligne.length) { ligne.push(champ); lignes.push(ligne) }
  return lignes.filter((l) => l.some((v) => v.trim()))
}

// Les libellés du COCKPIT SUIVI sont repris tels quels : « Nom », « Mail »,
// « Téléphone », « Source ». L'ordre des colonnes n'a pas d'importance.
const SYNONYMES: Record<keyof LigneImport, string[]> = {
  full_name: ['nom', 'name', 'contact', 'nom complet', 'prenom', 'prénom', 'full name'],
  email: ['mail', 'email', 'e-mail', 'adresse email', 'courriel'],
  phone: ['telephone', 'téléphone', 'tel', 'phone', 'mobile', 'portable', 'numero'],
  company: ['entreprise', 'societe', 'société', 'company', 'boite', 'structure'],
  source_key: ['source', 'canal', 'origine'],
  notes: ['notes', 'note', 'commentaire', 'remarques'],
}

function normaliser(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

function mapper(lignes: string[][]): { lignes: LigneImport[]; reconnues: string[]; ignorees: string[] } {
  const entetes = lignes[0].map(normaliser)
  const index: Partial<Record<keyof LigneImport, number>> = {}
  const reconnues: string[] = []

  for (const [champ, alias] of Object.entries(SYNONYMES) as [keyof LigneImport, string[]][]) {
    const i = entetes.findIndex((e) => alias.some((a) => e === normaliser(a)))
    if (i >= 0) { index[champ] = i; reconnues.push(lignes[0][i]) }
  }

  const utilises = new Set(Object.values(index))
  const ignorees = lignes[0].filter((h, i) => h.trim() && !utilises.has(i))

  const mappees = lignes.slice(1).map((l) => {
    const o: Record<string, string> = {}
    for (const [champ, i] of Object.entries(index)) {
      if (i !== undefined) o[champ] = l[i as number]?.trim() ?? ''
    }
    return o as unknown as LigneImport
  })

  return { lignes: mappees, reconnues, ignorees }
}

export function PanneauImport({
  onFini,
  onFermer,
}: {
  onFini: () => void
  onFermer: () => void
}) {
  const [enCours, demarrer] = useTransition()
  const [erreur, setErreur] = useState('')
  const [bilan, setBilan] = useState<BilanImport | null>(null)
  const [apercu, setApercu] = useState<{ lignes: LigneImport[]; reconnues: string[]; ignorees: string[] } | null>(null)
  const fichier = useRef<HTMLInputElement>(null)

  async function lire(f: File) {
    setErreur(''); setBilan(null)
    const brut = parserCsv(await f.text())
    if (brut.length < 2) { setErreur('Le fichier ne contient aucune donnée.'); return }

    const m = mapper(brut)
    if (!m.lignes.some((l) => l.full_name)) {
      setErreur(`Aucune colonne « Nom » reconnue. Colonnes lues : ${brut[0].join(', ')}`)
      return
    }
    setApercu(m)
  }

  function reinitialiser() {
    setApercu(null); setBilan(null); setErreur('')
    if (fichier.current) fichier.current.value = ''
  }

  const valides = apercu?.lignes.filter((l) => l.full_name).length ?? 0
  const vides = (apercu?.lignes.length ?? 0) - valides

  return (
    <div className="apparait mb-4 rounded-xl border border-bordure bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">Importer un CSV</h3>
          <p className="mt-1 text-sm text-texte-doux">
            Colonnes reconnues : Nom, Mail, Téléphone, Entreprise, Source, Notes.
            L&apos;ordre n&apos;a pas d&apos;importance, les colonnes inconnues sont
            ignorées.
          </p>
        </div>
        <button onClick={onFermer} className="shrink-0 text-texte-faible transition hover:text-texte">×</button>
      </div>

      <input
        ref={fichier}
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void lire(f) }}
        className="mt-3 block w-full text-sm text-texte-doux file:mr-3 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-sm file:text-texte-doux hover:file:bg-bordure"
      />

      {erreur && (
        <p className="apparait mt-3 rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-sm text-danger">
          {erreur}
        </p>
      )}

      {apercu && !bilan && (
        <div className="apparait mt-4">
          <p className="text-sm">
            <span className="font-medium text-texte">{valides}</span> contact(s) prêts
            {vides > 0 && (
              <span className="text-texte-faible"> · {vides} ligne(s) sans nom seront ignorées</span>
            )}
          </p>
          <p className="mt-1 text-xs text-texte-faible">
            Colonnes reprises : {apercu.reconnues.join(', ')}
            {apercu.ignorees.length > 0 && ` — ignorées : ${apercu.ignorees.join(', ')}`}
          </p>

          <div className="scroll-fin mt-2 max-h-52 overflow-auto rounded-lg border border-bordure">
            <table className="w-full text-xs">
              <tbody className="divide-y divide-bordure">
                {apercu.lignes.slice(0, 10).map((l, i) => (
                  <tr key={i}>
                    <td className="px-3 py-1.5">
                      {l.full_name || <span className="text-danger">sans nom</span>}
                    </td>
                    <td className="px-3 py-1.5 text-texte-faible">{l.company}</td>
                    <td className="px-3 py-1.5 text-texte-faible">{l.email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex gap-2">
            <button
              disabled={enCours || !valides}
              onClick={() =>
                demarrer(async () => {
                  const b = await importerContacts(apercu.lignes)
                  setBilan(b)
                  onFini()
                })
              }
              className={styleBouton}
            >
              {enCours ? 'Import…' : `Importer ${valides} contact(s)`}
            </button>
            <button onClick={reinitialiser} className={styleBoutonDoux}>Changer de fichier</button>
          </div>
        </div>
      )}

      {bilan && (
        <div
          className={`apparait mt-4 rounded-lg border p-3 ${
            bilan.ok ? 'border-succes/30 bg-succes/8' : 'border-danger/30 bg-danger/8'
          }`}
        >
          <p className={`text-sm font-medium ${bilan.ok ? 'text-succes' : 'text-danger'}`}>
            {bilan.ok ? `${bilan.crees} contact(s) importés` : 'Import échoué'}
          </p>
          {bilan.ignores > 0 && (
            <p className="mt-1 text-sm text-texte-doux">{bilan.ignores} ligne(s) ignorées faute de nom.</p>
          )}
          {bilan.erreurs.map((e, i) => (
            <p key={i} className="mt-1 text-sm text-danger">{e}</p>
          ))}
          <div className="mt-2 flex gap-2">
            <button onClick={reinitialiser} className={styleBoutonDoux}>Importer un autre fichier</button>
            <button onClick={onFermer} className={styleBoutonDoux}>Fermer</button>
          </div>
        </div>
      )}
    </div>
  )
}
