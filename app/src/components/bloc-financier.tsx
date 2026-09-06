import { Badge, Carte, LienOpportunite, Stat, TableauCompact } from '@/components/ui'
import { euros, jour, jourIso, mois, pct, LIBELLE_PLAN } from '@/lib/format'
import type { Payment, PaymentPlan, SaleRow } from '@/lib/database.types'

/**
 * Ce que devient une échéance dans les totaux. Une ligne annulée disparaît du
 * facturé — la compter dans le « reste à encaisser » ferait espérer un
 * encaissement qui n'arrivera jamais.
 */
type Ventilation = {
  facture: number
  encaisse: number
  reste: number
  retard: number
  rembourse: number
  nb: number
  nbEncaissees: number
  nbRetard: number
}

const VIDE: Ventilation = {
  facture: 0, encaisse: 0, reste: 0, retard: 0, rembourse: 0,
  nb: 0, nbEncaissees: 0, nbRetard: 0,
}

function ventiler(lignes: Payment[], aujourdhui: string): Ventilation {
  const v = { ...VIDE }
  for (const p of lignes) {
    const attendu = Number(p.amount_expected)
    const recu = Number(p.amount_received ?? p.amount_expected)
    if (p.status === 'annule') continue
    v.nb++
    v.facture += attendu
    if (p.status === 'encaisse') {
      v.encaisse += recu
      v.nbEncaissees++
    } else if (p.status === 'rembourse') {
      v.rembourse += recu
    } else {
      // « attendu » et « echoue » : l'argent n'est pas rentré, il est dû.
      v.reste += attendu
      if (p.due_date < aujourdhui) {
        v.retard += attendu
        v.nbRetard++
      }
    }
  }
  return v
}

const PLANS: PaymentPlan[] = ['1x', '2x', '3x', '4x', 'autre']

export function BlocFinancier({
  ventes,
  echeances,
}: {
  ventes: SaleRow[]
  echeances: Payment[]
}) {
  if (!ventes.length) return null

  const aujourdhui = jourIso()

  // Une échéance par vente : l'index évite de reparcourir la liste complète
  // pour chacune des lignes du tableau d'historique.
  const parVente = new Map<string, Payment[]>()
  for (const e of echeances) {
    const lot = parVente.get(e.opportunity_id)
    if (lot) lot.push(e)
    else parVente.set(e.opportunity_id, [e])
  }
  for (const lot of parVente.values()) lot.sort((a, b) => a.installment_no - b.installment_no)

  const total = ventiler(echeances, aujourdhui)

  // Les ventes reprises d'un historique n'ont pas d'échéancier : elles pèsent
  // dans le CA signé mais restent invisibles dans la trésorerie. Le dire.
  const sansEcheancier = ventes.filter((v) => !parVente.has(v.opportunity_id))
  const etalees = ventes.filter((v) => (parVente.get(v.opportunity_id)?.length ?? 0) > 1)

  /* ------------------------------------------------------- par mois */
  // Encaissé daté au jour où l'argent est rentré, attendu à l'échéance :
  // c'est la lecture d'un compte en banque, pas celle d'un contrat.
  const parMois = new Map<string, { encaisse: number; attendu: number; retard: number }>()
  const casier = (cle: string) => {
    let c = parMois.get(cle)
    if (!c) { c = { encaisse: 0, attendu: 0, retard: 0 }; parMois.set(cle, c) }
    return c
  }
  for (const p of echeances) {
    if (p.status === 'annule' || p.status === 'rembourse') continue
    const attendu = Number(p.amount_expected)
    if (p.status === 'encaisse') {
      const quand = (p.received_at?.slice(0, 7) ?? p.due_date.slice(0, 7))
      casier(quand).encaisse += Number(p.amount_received ?? attendu)
    } else {
      const c = casier(p.due_date.slice(0, 7))
      c.attendu += attendu
      if (p.due_date < aujourdhui) c.retard += attendu
    }
  }
  const moisTries = [...parMois.entries()].sort(([a], [b]) => a.localeCompare(b))
  const moisCourant = aujourdhui.slice(0, 7)

  /* ------------------------------------------------ par plan de paiement */
  const groupes: { cle: PaymentPlan | null; label: string }[] = [
    ...PLANS.map((p) => ({ cle: p as PaymentPlan | null, label: LIBELLE_PLAN[p] ?? p })),
    { cle: null, label: 'Non renseigné' },
  ]
  const parPlan = groupes.map(({ cle, label }) => {
    const lot = ventes.filter((v) => (v.payment_plan ?? null) === cle)
    const v = ventiler(lot.flatMap((s) => parVente.get(s.opportunity_id) ?? []), aujourdhui)
    return { label, ventes: lot.length, ...v }
  }).filter((l) => l.ventes > 0)

  /* ------------------------------------------------------- historique */
  const historique = [...ventes].sort((a, b) => b.won_at.localeCompare(a.won_at))

  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold tracking-tight">Financier</h2>
        <p className="text-xs text-texte-faible">
          Montants TTC de l&apos;échéancier — le CA signé plus haut est en HT.
        </p>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Facturé TTC"
          valeur={euros(total.facture)}
          detail={`${ventes.length} vente${ventes.length > 1 ? 's' : ''} · ${total.nb} échéance${total.nb > 1 ? 's' : ''}`}
        />
        <Stat
          label="Encaissé"
          valeur={euros(total.encaisse)}
          detail={
            total.facture
              ? `${pct(total.encaisse, total.facture)} du facturé · ${total.nbEncaissees}/${total.nb} échéances`
              : 'Aucun échéancier'
          }
          ton="succes"
        />
        <Stat
          label="Reste à encaisser"
          valeur={euros(total.reste)}
          detail={`${total.nb - total.nbEncaissees} échéance${total.nb - total.nbEncaissees > 1 ? 's' : ''} ouverte${total.nb - total.nbEncaissees > 1 ? 's' : ''}`}
        />
        <Stat
          label="En retard"
          valeur={euros(total.retard)}
          detail={
            total.nbRetard
              ? `${total.nbRetard} échéance${total.nbRetard > 1 ? 's' : ''} dépassée${total.nbRetard > 1 ? 's' : ''}`
              : 'Aucune échéance dépassée'
          }
          ton={total.nbRetard ? 'danger' : undefined}
        />
      </div>

      {(sansEcheancier.length > 0 || total.rembourse > 0) && (
        <Carte className="mb-5 p-3 text-xs text-texte-doux">
          {sansEcheancier.length > 0 && (
            <p>
              {sansEcheancier.length} vente{sansEcheancier.length > 1 ? 's' : ''} sans échéancier
              (affaire{sansEcheancier.length > 1 ? 's' : ''} reprise{sansEcheancier.length > 1 ? 's' : ''} d&apos;un
              historique ou clôturée{sansEcheancier.length > 1 ? 's' : ''} hors CRM) : compté{sansEcheancier.length > 1 ? 'es' : 'e'} dans
              le CA signé, absent{sansEcheancier.length > 1 ? 'es' : 'e'} des totaux d&apos;encaissement.
            </p>
          )}
          {total.rembourse > 0 && (
            <p className={sansEcheancier.length > 0 ? 'mt-1' : ''}>
              {euros(total.rembourse)} remboursé — compté ni dans l&apos;encaissé, ni dans le reste à venir.
            </p>
          )}
        </Carte>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ------------------------------------------------ trésorerie */}
        <TableauCompact
          titre="Trésorerie par mois"
          sous="Encaissé à la date de règlement, attendu à la date d'échéance."
          colonnes={['Mois', 'Encaissé', 'Attendu']}
          lignes={moisTries.map(([cle, m]) => [
            <span key="m" className={cle === moisCourant ? 'font-medium text-altitude' : undefined}>
              {mois(cle)}
              {cle === moisCourant && <span className="ml-2 text-xs text-texte-faible">en cours</span>}
            </span>,
            m.encaisse ? <span key="e" className="text-succes">{euros(m.encaisse)}</span> : '—',
            m.attendu ? (
              <span key="a" className={m.retard ? 'text-danger' : undefined}>
                {euros(m.attendu)}
                {m.retard > 0 && m.retard < m.attendu && (
                  <span className="ml-1 text-xs">({euros(m.retard)} en retard)</span>
                )}
              </span>
            ) : '—',
          ])}
          pied={[
            'Total',
            <span key="e" className="text-succes">{euros(total.encaisse)}</span>,
            euros(total.reste),
          ]}
          vide="Aucune échéance sur la période."
        />

        {/* ---------------------------------------------- par plan */}
        <TableauCompact
          titre="En combien de fois"
          sous={`${etalees.length} vente${etalees.length > 1 ? 's' : ''} en paiement étalé sur ${ventes.length}.`}
          colonnes={['Plan', 'Ventes', 'Facturé', 'Encaissé', 'Reste']}
          lignes={parPlan.map((l) => [
            l.label,
            String(l.ventes),
            euros(l.facture),
            <span key="e" className="text-succes">{euros(l.encaisse)}</span>,
            l.reste ? (
              <span key="r" className={l.retard ? 'text-danger' : undefined}>{euros(l.reste)}</span>
            ) : <Badge key="b" ton="succes">soldé</Badge>,
          ])}
          pied={[
            'Total',
            String(ventes.length),
            euros(total.facture),
            <span key="e" className="text-succes">{euros(total.encaisse)}</span>,
            euros(total.reste),
          ]}
          vide="Aucun plan de paiement renseigné."
        />
      </div>

      {/* ------------------------------------------------- historique */}
      <TableauCompact
        className="mt-5"
        titre="Historique des ventes"
        sous="Chaque affaire close, son plan de paiement et l'état de son encaissement."
        colonnes={['Contact', 'Signé le', 'Closer', 'Source', 'Plan', 'Facturé', 'Encaissé', 'Reste']}
        lignes={historique.map((v) => {
          const lignesVente = parVente.get(v.opportunity_id) ?? []
          const w = ventiler(lignesVente, aujourdhui)
          const prochaine = lignesVente.find((p) => p.status === 'attendu' || p.status === 'echoue')
          return [
            <LienOpportunite key="c" id={v.opportunity_id}>
              <span className="font-medium">{v.full_name}</span>
              {v.company && <span className="ml-1.5 text-xs text-texte-faible">{v.company}</span>}
            </LienOpportunite>,
            jour(v.won_at),
            v.closer ?? '—',
            v.source ?? '—',
            !w.nb ? (
              <span key="p" className="text-texte-faible">{LIBELLE_PLAN[v.payment_plan ?? ''] ?? '—'}</span>
            ) : (
              <span key="p">
                {LIBELLE_PLAN[v.payment_plan ?? ''] ?? `${w.nb}x`}
                <span className="ml-1.5 text-xs text-texte-faible">{w.nbEncaissees}/{w.nb}</span>
              </span>
            ),
            w.nb ? euros(w.facture) : <span key="f" className="text-texte-faible">—</span>,
            w.encaisse ? <span key="e" className="text-succes">{euros(w.encaisse)}</span> : '—',
            !w.nb ? (
              <span key="r" className="text-xs text-texte-faible">pas d&apos;échéancier</span>
            ) : w.reste ? (
              <span key="r" className={w.nbRetard ? 'text-danger' : undefined}>
                {euros(w.reste)}
                {prochaine && (
                  <span className="ml-1.5 text-xs text-texte-faible">
                    {w.nbRetard ? 'depuis' : 'au'} {jour(prochaine.due_date)}
                  </span>
                )}
              </span>
            ) : (
              <Badge key="r" ton="succes">soldé</Badge>
            ),
          ]
        })}
        vide="Aucune vente sur la période."
      />
    </section>
  )
}
