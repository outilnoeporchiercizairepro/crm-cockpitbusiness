import { Bloc, EnTeteSquelette } from '@/components/squelette'

export default function Chargement() {
  return (
    <div className="px-4 pt-8 sm:px-6">
      <EnTeteSquelette />
      <div className="mb-4 flex gap-2">
        <Bloc className="h-9 w-44" />
        <Bloc className="h-9 w-44" />
      </div>
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="w-[264px] shrink-0">
            <Bloc className="mb-2 h-4 w-28" />
            <div className="space-y-2 rounded-xl border border-bordure bg-surface/40 p-2">
              {Array.from({ length: 3 - (i % 2) }, (_, j) => (
                <Bloc key={j} className="h-20 rounded-lg" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
