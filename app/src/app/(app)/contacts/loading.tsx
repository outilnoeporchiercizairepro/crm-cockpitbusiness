import { Bloc, EnTeteSquelette, LigneTableauSquelette } from '@/components/squelette'

export default function Chargement() {
  return (
    <div className="mx-auto max-w-[1500px] px-4 py-8 sm:px-6">
      <EnTeteSquelette />
      <div className="mb-4 flex gap-2">
        <Bloc className="h-9 w-full sm:w-72" />
        <Bloc className="h-9 w-36" />
        <Bloc className="h-9 w-40" />
      </div>
      <div className="divide-y divide-bordure overflow-hidden rounded-xl border border-bordure bg-surface">
        {Array.from({ length: 10 }, (_, i) => <LigneTableauSquelette key={i} />)}
      </div>
    </div>
  )
}
