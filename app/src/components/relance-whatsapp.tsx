'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { genererRelanceWhatsApp } from '@/app/actions-ia'
import { loggerActivite } from '@/app/actions'
import { Carte, styleChamp, styleBouton, styleBoutonDoux } from '@/components/ui'

/** wa.me n'accepte que des chiffres : indicatif compris, sans + ni espaces. */
function numeroWhatsApp(tel: string | null) {
  if (!tel) return null
  const chiffres = tel.replace(/\D/g, '')
  return chiffres.length >= 8 ? chiffres : null
}

export function RelanceWhatsApp({
  opportuniteId,
  contactId,
  telephone,
  cleIaPresente,
}: {
  opportuniteId: string
  contactId: string
  telephone: string | null
  cleIaPresente: boolean
}) {
  const router = useRouter()
  const [enCours, demarrer] = useTransition()
  const [ouvert, setOuvert] = useState(false)
  const [consigne, setConsigne] = useState('')
  const [message, setMessage] = useState('')
  const [erreur, setErreur] = useState('')
  const [copie, setCopie] = useState(false)
  const [logge, setLogge] = useState(false)

  const numero = numeroWhatsApp(telephone)

  function rediger() {
    setErreur(''); setCopie(false); setLogge(false)
    demarrer(async () => {
      const r = await genererRelanceWhatsApp(opportuniteId, consigne)
      if (r.ok) setMessage(r.message)
      else setErreur(r.erreur)
    })
  }

  async function copier() {
    try {
      await navigator.clipboard.writeText(message)
      setCopie(true)
      setTimeout(() => setCopie(false), 2000)
    } catch {
      setErreur("Copie impossible : sélectionne le texte et copie-le à la main.")
    }
  }

  function loggerEnvoi() {
    const fd = new FormData()
    fd.set('contact_id', contactId)
    fd.set('opportunity_id', opportuniteId)
    fd.set('type', 'whatsapp')
    fd.set('direction', 'sortant')
    fd.set('content', message)
    demarrer(async () => {
      const r = await loggerActivite(fd)
      if (r.ok) { setLogge(true); router.refresh() }
      else setErreur(r.erreur)
    })
  }

  return (
    <Carte className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-texte-faible">
          Relance WhatsApp
        </h2>
        <button
          onClick={() => setOuvert((v) => !v)}
          className="text-xs text-altitude transition hover:underline"
        >
          {ouvert ? 'Fermer' : 'Rédiger avec l’IA'}
        </button>
      </div>

      {!ouvert ? (
        <p className="text-sm text-texte-faible">
          Un brouillon écrit à partir de tout l’historique de l’opportunité.
        </p>
      ) : !cleIaPresente ? (
        <div className="apparait rounded-lg border border-alerte/30 bg-alerte/8 p-3">
          <p className="text-sm text-alerte">Clé OpenAI absente</p>
          <p className="mt-1 text-sm text-texte-doux">
            Ajoute cette ligne dans <code className="text-texte">app/.env.local</code>, puis
            relance le serveur :
          </p>
          <pre className="mt-2 overflow-x-auto rounded-lg border border-bordure bg-fond px-3 py-2 text-xs text-texte-doux">
OPENAI_API_KEY=sk-…
          </pre>
          <p className="mt-2 text-xs text-texte-faible">
            Jamais préfixée NEXT_PUBLIC_ : elle partirait dans le navigateur et
            n’importe qui pourrait la consommer à ta place.
          </p>
        </div>
      ) : (
        <div className="apparait space-y-2">
          <input
            value={consigne}
            onChange={(e) => setConsigne(e.target.value)}
            placeholder="Angle voulu (facultatif) — ex : propose un créneau jeudi"
            className={styleChamp}
          />

          <button onClick={rediger} disabled={enCours} className={`${styleBouton} w-full`}>
            {enCours ? 'Rédaction…' : message ? 'Réécrire' : 'Rédiger le message'}
          </button>

          {erreur && (
            <p className="apparait rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-sm text-danger">
              {erreur}
            </p>
          )}

          {message && (
            <div className="apparait space-y-2">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={7}
                className={`${styleChamp} leading-relaxed`}
              />
              <p className="text-xs text-texte-faible">
                Brouillon — relis-le et corrige-le avant d’envoyer.
              </p>

              <div className="grid grid-cols-2 gap-2">
                <button onClick={copier} className={styleBoutonDoux}>
                  {copie ? 'Copié' : 'Copier'}
                </button>

                {numero ? (
                  <a
                    href={`https://wa.me/${numero}?text=${encodeURIComponent(message)}`}
                    target="_blank"
                    rel="noreferrer"
                    className={`${styleBoutonDoux} text-center`}
                  >
                    Ouvrir WhatsApp
                  </a>
                ) : (
                  <span
                    title="Aucun numéro exploitable sur ce contact"
                    className={`${styleBoutonDoux} cursor-not-allowed text-center opacity-40`}
                  >
                    Pas de numéro
                  </span>
                )}
              </div>

              <button
                onClick={loggerEnvoi}
                disabled={enCours || logge}
                className={`${styleBoutonDoux} w-full`}
              >
                {logge ? 'Ajouté à l’historique' : 'Logger comme envoyé'}
              </button>
            </div>
          )}
        </div>
      )}
    </Carte>
  )
}
