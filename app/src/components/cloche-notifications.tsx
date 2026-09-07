'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { marquerNotificationsVues } from '@/app/actions'
import { relatif } from '@/lib/format'
import type { Notification, GenreNotification } from '@/lib/database.types'

const ICONE: Record<GenreNotification, string> = {
  etape: 'M5 12h14M13 6l6 6-6 6',
  rdv_decale: 'M12 8v4l3 2M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0',
  rdv_pris: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
}

const TON: Record<GenreNotification, string> = {
  etape: 'text-altitude',
  rdv_decale: 'text-alerte',
  rdv_pris: 'text-succes',
}

export function ClocheNotifications({
  initiales,
  vuesLe,
}: {
  initiales: Notification[]
  /** Dernière ouverture de la cloche, pour compter les non-lues. */
  vuesLe: string | null
}) {
  const router = useRouter()
  const [, demarrer] = useTransition()
  const [ouvert, setOuvert] = useState(false)
  // Uniquement ce qui arrive en direct. Recopier les props dans un état
  // obligerait à les resynchroniser à chaque rendu ; ici on fusionne au
  // moment de l'affichage, et le serveur reste la source de vérité.
  const [arrivees, setArrivees] = useState<Notification[]>([])
  const [vuLocal, setVuLocal] = useState<string | null>(null)

  // La RLS s'applique aussi au flux temps réel : un compte restreint ne
  // reçoit que les notifications de son périmètre, sans filtrage ici.
  useEffect(() => {
    const supabase = createClient()
    const canal = supabase
      .channel('notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        (message) => {
          const n = message.new as Notification
          setArrivees((actuel) =>
            actuel.some((x) => x.id === n.id) ? actuel : [n, ...actuel].slice(0, 30),
          )
        },
      )
      .subscribe()
    return () => { void supabase.removeChannel(canal) }
  }, [])

  const connues = new Set(initiales.map((n) => n.id))
  const liste = [...arrivees.filter((n) => !connues.has(n.id)), ...initiales]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 30)

  // Le seuil ne recule jamais : entre la date enregistrée et l'ouverture
  // faite à l'instant, on garde la plus récente.
  const seuil = [vuesLe, vuLocal].filter(Boolean).sort().at(-1) ?? null
  const nonLues = liste.filter((n) => !seuil || n.created_at > seuil).length

  function basculer() {
    const ouvrir = !ouvert
    setOuvert(ouvrir)
    if (ouvrir && nonLues > 0) {
      // Le badge doit disparaître au clic, pas au retour du serveur.
      setVuLocal(new Date().toISOString())
      demarrer(async () => {
        await marquerNotificationsVues()
        router.refresh()
      })
    }
  }

  return (
    <div className="relative shrink-0">
      <button
        onClick={basculer}
        aria-label={nonLues ? `${nonLues} notification${nonLues > 1 ? 's' : ''} non lue${nonLues > 1 ? 's' : ''}` : 'Notifications'}
        className="relative flex h-9 w-9 items-center justify-center rounded-md text-texte-doux transition hover:bg-surface hover:text-texte"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {nonLues > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-fond">
            {nonLues > 9 ? '9+' : nonLues}
          </span>
        )}
      </button>

      {ouvert && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOuvert(false)} />
          <div className="apparait absolute right-0 z-50 mt-1.5 w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-bordure bg-surface shadow-xl">
            <div className="border-b border-bordure px-4 py-2.5">
              <p className="text-sm font-medium">Activité de l&apos;équipe</p>
            </div>

            {!liste.length ? (
              <p className="px-4 py-8 text-center text-sm text-texte-faible">
                Rien à signaler pour l&apos;instant.
              </p>
            ) : (
              <ul className="scroll-fin max-h-[26rem] divide-y divide-bordure overflow-y-auto">
                {liste.map((n) => {
                  const neuve = !seuil || n.created_at > seuil
                  const contenu = (
                    <div className={`flex gap-3 px-4 py-3 transition ${neuve ? 'bg-altitude/5' : ''}`}>
                      <svg
                        width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                        className={`mt-0.5 shrink-0 ${TON[n.genre]}`}
                      >
                        <path d={ICONE[n.genre]} />
                      </svg>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">{n.titre}</p>
                        {n.detail && (
                          <p className="mt-0.5 text-xs text-texte-doux">{n.detail}</p>
                        )}
                        <p className="mt-0.5 text-xs text-texte-faible">
                          {n.acteur_nom} · <span suppressHydrationWarning>{relatif(n.created_at)}</span>
                        </p>
                      </div>
                    </div>
                  )
                  return (
                    <li key={n.id}>
                      {n.opportunity_id ? (
                        <Link
                          href={`/opportunites/${n.opportunity_id}`}
                          prefetch={false}
                          onClick={() => setOuvert(false)}
                          className="block transition hover:bg-surface-2/60"
                        >
                          {contenu}
                        </Link>
                      ) : contenu}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}
