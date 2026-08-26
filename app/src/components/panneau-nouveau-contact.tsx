'use client'

import { useState, useTransition } from 'react'
import { creerContact } from '@/app/actions'
import { styleChamp, styleBouton, styleBoutonDoux } from '@/components/ui'

export function PanneauNouveauContact({
  sources,
  onFini,
  onAnnuler,
}: {
  sources: { id: string; label: string }[]
  onFini: () => void
  onAnnuler: () => void
}) {
  const [enCours, demarrer] = useTransition()
  const [erreur, setErreur] = useState('')

  return (
    <form
      action={(fd) =>
        demarrer(async () => {
          const r = await creerContact(fd)
          if (r.ok) { setErreur(''); onFini() }
          else setErreur(r.erreur)
        })
      }
      className="apparait mb-4 rounded-xl border border-bordure bg-surface p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="sm:col-span-2 lg:col-span-1">
          <label className="mb-1.5 block text-xs text-texte-doux">Nom *</label>
          <input name="full_name" required autoFocus placeholder="Jérôme Casal" className={styleChamp} />
        </div>
        <Champ nom="email" label="E-mail" type="email" placeholder="jerome@exemple.fr" />
        <Champ nom="phone" label="Téléphone" placeholder="+33 6 12 34 56 78" />
        <Champ nom="company" label="Entreprise" />
        <div>
          <label className="mb-1.5 block text-xs text-texte-doux">Source</label>
          <select name="source_id" className={styleChamp} defaultValue="">
            <option value="">—</option>
            {sources.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
      </div>

      <div className="mt-3">
        <label className="mb-1.5 block text-xs text-texte-doux">Contexte</label>
        <textarea name="main_pain" rows={2} placeholder="Ce qu'il cherche à régler" className={styleChamp} />
      </div>

      {erreur && (
        <p className="apparait mt-3 rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-sm text-danger">
          {erreur}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="submit" disabled={enCours} className={styleBouton}>
          {enCours ? 'Création…' : 'Créer'}
        </button>
        <button type="button" onClick={onAnnuler} className={styleBoutonDoux}>Annuler</button>
        <p className="text-xs text-texte-faible">
          Une opportunité en « Lead » est ouverte automatiquement.
        </p>
      </div>
    </form>
  )
}

function Champ({
  nom, label, type = 'text', placeholder,
}: {
  nom: string; label: string; type?: string; placeholder?: string
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs text-texte-doux">{label}</label>
      <input name={nom} type={type} placeholder={placeholder} className={styleChamp} />
    </div>
  )
}
