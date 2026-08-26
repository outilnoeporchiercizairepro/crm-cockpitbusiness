export function Bloc({ className = '' }: { className?: string }) {
  return <div className={`squelette ${className}`} />
}

export function EnTeteSquelette() {
  return (
    <div className="mb-6">
      <Bloc className="h-6 w-40" />
      <Bloc className="mt-2 h-3.5 w-64" />
    </div>
  )
}

export function LigneTableauSquelette() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Bloc className="h-7 w-7 shrink-0 rounded-full" />
      <div className="flex-1">
        <Bloc className="h-3.5 w-40" />
        <Bloc className="mt-1.5 h-3 w-56" />
      </div>
      <Bloc className="h-5 w-20 shrink-0" />
      <Bloc className="h-3.5 w-16 shrink-0" />
    </div>
  )
}
