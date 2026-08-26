import { DeconnexionSimple } from '@/components/deconnexion-simple'

export default function CompteDesactive() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-alerte/12 text-alerte">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
        </div>
        <h1 className="text-lg font-semibold">Compte désactivé</h1>
        <p className="mt-2 text-sm text-texte-doux">
          Ton accès au CRM a été suspendu. Contacte Noé pour le rétablir.
        </p>
        <DeconnexionSimple />
      </div>
    </main>
  )
}
