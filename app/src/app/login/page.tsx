'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { styleChamp } from '@/components/ui'

export default function Login() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState('')

  async function connecter(e: React.FormEvent) {
    e.preventDefault()
    setEnCours(true)
    setErreur('')

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password: motDePasse })

    if (error) {
      setEnCours(false)
      // Supabase renvoie le même message pour « email inconnu » et « mot de
      // passe faux » : on ne le traduit pas en quelque chose de plus précis,
      // ce serait dire à un inconnu quels comptes existent.
      setErreur(
        error.message === 'Invalid login credentials'
          ? 'Adresse e-mail ou mot de passe incorrect.'
          : error.message === 'Email not confirmed'
            ? "Ce compte n'a pas encore été confirmé."
            : error.message,
      )
      return
    }

    const suite = new URLSearchParams(window.location.search).get('suite')
    router.push(suite && suite.startsWith('/') && !suite.startsWith('//') ? suite : '/')
    router.refresh()
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <div className="mb-3 flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-altitude/15 text-altitude">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m3 17 6-6 4 4 8-8" />
                <path d="M17 7h4v4" />
              </svg>
            </div>
            <span className="text-lg font-semibold tracking-tight">CRM Altitude</span>
          </div>
          <p className="text-sm text-texte-doux">
            Pipeline de vente — du lead à la vente, mesuré étape par étape.
          </p>
        </div>

        <form onSubmit={connecter} className="space-y-3">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm text-texte-doux">
              Adresse e-mail
            </label>
            <input
              id="email"
              type="email"
              required
              autoFocus
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="noe@prcz.fr"
              className={styleChamp}
            />
          </div>

          <div>
            <label htmlFor="mdp" className="mb-1.5 block text-sm text-texte-doux">
              Mot de passe
            </label>
            <input
              id="mdp"
              type="password"
              required
              autoComplete="current-password"
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              className={styleChamp}
            />
          </div>

          <button
            type="submit"
            disabled={enCours}
            className="w-full rounded-lg bg-altitude px-4 py-2.5 text-sm font-medium text-white transition hover:bg-altitude-sombre disabled:opacity-50"
          >
            {enCours ? 'Connexion…' : 'Se connecter'}
          </button>

          {erreur && (
            <p className="apparait rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-sm text-danger">
              {erreur}
            </p>
          )}

          <p className="pt-1 text-xs text-texte-faible">
            Mot de passe oublié ? Demande à Noé de t&apos;en définir un nouveau depuis
            l&apos;écran d&apos;administration.
          </p>
        </form>
      </div>
    </main>
  )
}
