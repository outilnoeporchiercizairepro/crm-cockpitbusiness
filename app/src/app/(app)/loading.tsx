import { Bloc, EnTeteSquelette } from '@/components/squelette'

export default function Chargement() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
      <EnTeteSquelette />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Bloc key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Bloc className="mt-5 h-64 rounded-xl" />
    </div>
  )
}
