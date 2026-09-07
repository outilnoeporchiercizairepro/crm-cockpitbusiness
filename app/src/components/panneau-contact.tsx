import { Carte } from '@/components/ui'
import { EtiquetteSource } from '@/components/etiquette-source'
import { ChoixSource } from '@/components/choix-source'
import { NotesContact } from '@/components/notes-contact'
import type { Source } from '@/lib/database.types'

type ContactFiche = {
  email: string | null
  phone: string | null
  company: string | null
  main_pain: string | null
  notes: string | null
}

export function PanneauContact({
  contact,
  contactId,
  opportuniteId,
  sourceId,
  sources,
  lectureSeule,
}: {
  contact: ContactFiche
  contactId: string
  opportuniteId: string
  sourceId: string | null
  sources: Source[]
  /** Un setter consulte : seules les notes lui restent ouvertes. */
  lectureSeule: boolean
}) {
  return (
    <div className="space-y-4">
      <Carte className="p-4">
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-texte-faible">
          Coordonnées
        </h2>
        <dl className="space-y-2.5 text-sm">
          <Ligne label="Email" valeur={contact.email} lien={contact.email ? `mailto:${contact.email}` : null} />
          <Ligne label="Téléphone" valeur={contact.phone} lien={contact.phone ? `tel:${contact.phone}` : null} />
          <Ligne label="Entreprise" valeur={contact.company} />
        </dl>
      </Carte>

      <Carte className="p-4">
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-texte-faible">
          Source
        </h2>
        {lectureSeule ? (
          <EtiquetteSource
            label={sources.find((s) => s.id === sourceId)?.label}
            ton={sources.find((s) => s.id === sourceId)?.color}
            vide={<span className="text-sm text-texte-faible">Non renseignée</span>}
          />
        ) : (
          <ChoixSource
            opportuniteId={opportuniteId}
            contactId={contactId}
            sourceId={sourceId}
            sources={sources}
          />
        )}

        {contact.main_pain && (
          <div className="mt-3 border-t border-bordure pt-3">
            <p className="text-xs text-texte-faible">Contexte</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-texte-doux">{contact.main_pain}</p>
          </div>
        )}
      </Carte>

      <NotesContact contactId={contactId} notes={contact.notes} />
    </div>
  )
}

function Ligne({
  label,
  valeur,
  lien,
}: {
  label: string
  valeur: string | null | undefined
  lien?: string | null
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-xs text-texte-faible">{label}</dt>
      <dd className="min-w-0 truncate text-right">
        {valeur ? (
          lien ? (
            <a href={lien} target={lien.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="text-altitude hover:underline">
              {valeur}
            </a>
          ) : (
            <span className="text-texte-doux">{valeur}</span>
          )
        ) : (
          <span className="text-texte-faible">—</span>
        )}
      </dd>
    </div>
  )
}
