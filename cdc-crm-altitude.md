# CDC — CRM Altitude (v1 : pipeline de vente)

**Statut :** brouillon à valider
**Date :** 20/08/2026
**Périmètre v1 :** pipeline de vente uniquement (lead → vente)
**Utilisateurs :** Noé (admin) + setter + closer
**Stack :** Supabase (Postgres, Auth, RLS) + front web custom

---

## 1. Pourquoi un CRM custom

Aujourd'hui les leads Altitude vivent dans un Google Sheets. Ça tient tant que le volume est faible et que Noé fait tout. Ça ne tient plus dès qu'un setter et un closer travaillent en parallèle : pas d'assignation, pas d'historique d'échanges, pas de relance automatique, et surtout **aucun taux de conversion fiable par étape**.

Or le plan de scale Altitude repose sur une acquisition *mesurée* (funnel webinaire + evergreen). Sans mesure par étape, impossible de savoir si on a un problème de volume de leads, de qualification, de show rate ou de closing. Le CRM est l'instrument de mesure de ce plan.

**Les 3 questions du plan de scale, appliquées à ce projet :**

| Question | Réponse |
|---|---|
| Crée du MRR ? | Indirectement — il fiabilise la conversion vers le programme, porte d'entrée du Club |
| Acquisition prévisible ? | **Oui, c'est sa raison d'être** — il rend le funnel mesurable étape par étape |
| Réduit la dépendance à Noé ? | **Oui** — il rend le travail du setter/closer autonome et auditable |

## 2. Ce qui est dans le périmètre v1 — et ce qui ne l'est pas

**Dans la v1**
- Gestion des contacts (prospects) et de leur qualification ICP
- Pipeline d'opportunités avec étapes configurables
- Journal d'activité horodaté (appel, DM, email, note)
- Prise de RDV setting / closing avec suivi show / no-show
- Assignation setter / closer et vue « ma journée »
- Relances : date de prochaine action + liste des relances dues
- Import du Google Sheets existant
- Dashboard de conversion par étape, par source, par personne

**Hors v1, mais le schéma le prépare**
- Encaissements Stripe et plans de paiement (tables présentes, alimentation manuelle en v1)
- Suivi de délivrance des 90 jours
- Altitude Club / MRR et renouvellements
- Portail membre (recoupe l'app membres du CDC existant)

**Explicitement exclu**
- Emailing de masse (reste sur ActiveCampaign)
- Facturation / compta (reste sur Pennylane)

## 3. Rôles et permissions

| Rôle | Qui | Peut |
|---|---|---|
| `admin` | Noé (seul) | Tout, y compris config (étapes, sources, motifs), suppression, et **gestion des comptes** : création, mot de passe, rôle, désactivation |
| `setter` | Setter | Voir tous les contacts, créer/modifier ceux qui lui sont assignés + le pool non assigné, poser des RDV, logger des activités |
| `closer` | Closer | Voir tous les contacts, modifier les opportunités dont il est closer, marquer gagné/perdu, saisir le montant et le plan de paiement |

**Principe v1 :** tout le monde *lit* tout (3 personnes, la transparence sert plus qu'elle ne nuit), mais on n'*écrit* que sur ce qu'on porte. Seul l'admin change une étape de config ou supprime.

**Comptes.** Il n'y a pas d'inscription libre : Noé crée chaque compte et son mot de passe depuis l'écran d'administration, et les transmet de vive voix. Le premier compte créé sur une base vierge devient automatiquement admin. Un compte désactivé perd immédiatement l'accès — lecture comprise — et sa session est révoquée ; l'historique qu'il a produit reste intact. Personne ne peut s'auto-promouvoir ni se réactiver.

## 4. Étapes du pipeline

> Repris du CRM existant (`COCKPIT SUIVI.xlsx`), plus des suppositions.

| # | Étape | Sortie attendue |
|---|---|---|
| 1 | **Lead** | Contact entré, pas encore de RDV |
| 2 | **En attente** | RDV posé, issue non connue |
| 3 | **Perdu** | Motif de perte obligatoire |
| 4 | **Mauvais ICP** | Disqualifié — exclu des taux de conversion |
| 5 | **Closé** | Montant, mode de paiement, compte d'encaissement |

**Statuts transverses** (drapeaux sur l'opportunité, pas des étapes) :
- `no_show` — RDV manqué, à replanifier
- `nurturing` — pas mûr, à relancer à une date donnée
- `hors_icp` — posé automatiquement par l'étape « Mauvais ICP »

**Règle importante :** un contact peut avoir **plusieurs opportunités successives**
(perdu en mars, reclosé en septembre). Les taux se calculent sur les opportunités,
pas sur les contacts.

**Ce que ce découpage ne mesure pas.** Avec cinq statuts, l'entonnoir ne distingue
ni le taux de qualification, ni le passage de la qualification au RDV, ni le taux
de présentation d'offre. Si une chute apparaît entre « En attente » et « Closé »,
le CRM dira qu'elle existe mais pas à quel moment de l'appel elle se produit. Les
tables sont prêtes à accueillir des étapes intermédiaires le jour où ça devient
utile — c'est une ligne à ajouter dans l'écran Admin, sans migration.

## 4bis. Ce que le fichier source a tranché

| Question du §10 | Réponse tirée du fichier |
|---|---|
| Étapes du pipeline | Les 5 statuts ci-dessus |
| Prix unifié à 1 990 € ? | **Non** — de 1 000 € à 2 500 €, au cas par cas |
| Sources à créer | **Direct** et **Setter** : qui amène le RDV |
| Plans de paiement | One shot, x2, x3, **x4** |
| — | **Encaissement** : Mollie / Stripe, sur auto-entreprise ou SASU |
| — | **Commission setter** : versée ou non |

## 5. Modèle de données

```
profiles ────< opportunities >──── contacts
   │               │   │
   │               │   └──< payments (préparé v2)
   │               ├──< appointments
   │               ├──< activities
   │               └──< tasks (relances)
   │
sources ───────────┘
pipeline_stages / lost_reasons  (tables de config)
```

**`contacts`** — la personne. Nom **en un seul champ** (la source ne distingue pas prénom et nom), e-mail, téléphone, entreprise, contexte libre, statut ICP, source, consentement RGPD, propriétaire. Les champs de qualification détaillés (rôle, secteur, effectif, CA, LinkedIn) ont été retirés : jamais renseignés.

**`opportunities`** — la tentative de vente. Étape courante, setter, closer, montant proposé / signé, mode de paiement, **processeur et entité d'encaissement**, **commission setter versée**, date de prochaine action, motif de perte. C'est l'objet que le CRM fait avancer.

**`activities`** — journal immuable : type (appel / DM LinkedIn / WhatsApp / email / note), sens (entrant/sortant), résultat, contenu, auteur, horodatage.

**`appointments`** — RDV setting ou closing : date, type, statut (`planifie`, `honore`, `no_show`, `replanifie`, `annule`), participant.

**`tasks`** — relances à date, assignées, avec statut fait / pas fait. Alimente la vue « ma journée ». Les relances automatiques (J+2, J+5 par défaut, configurables dans `relance_rules`) sont posées par trigger dès qu'un RDV passe en honoré, et annulées au closing ou à la perte.

**`stage_transitions`** — historique automatique des changements d'étape (trigger). **C'est ce qui rend les taux de conversion et les temps de cycle calculables a posteriori** — sans cette table, on ne mesure que l'instantané.

**`payments`** — échéances attendues / encaissées. Saisie manuelle en v1, branchée sur Stripe en v2.

Tables de config administrables : `pipeline_stages`, `sources`, `lost_reasons`.

Le SQL complet est dans `schema-crm-altitude.sql`.

## 6. Écrans

1. **Kanban pipeline** — colonnes = étapes, cartes = opportunités, drag & drop pour faire avancer. Colonnes repliables (le pli est mémorisé), « Closé » à droite. Filtres : setter, closer, source. Badge rouge sur les relances en retard.
2. **Fiche opportunité** — panneau contact à gauche (identité + ICP), timeline chronologique au centre (activités, RDV, changements d'étape), bloc « prochaine action » à droite. Boutons rapides : logger un appel, poser un RDV, avancer d'étape, marquer perdu. **Rédaction IA d'une relance WhatsApp** à partir de tout l'historique de l'opportunité.
3. **Ma journée** — écran d'ouverture du setter/closer : RDV du jour avec leurs trois issues (Closé, Perdu, En attente) plus le no-show, relances dues, leads non contactés assignés. L'objectif est qu'un setter n'ait jamais à se demander quoi faire.
4. **Liste contacts** — tableau filtrable/triable, recherche, sélection multiple, import CSV.
5. **Dashboard** — entonnoir de conversion étape par étape, taux de show, close rate, panier moyen, CA signé vs encaissé, délai moyen lead → vente, découpage par source et par personne.
6. **Admin** — étapes, sources, motifs de perte, utilisateurs.

## 7. KPIs à instrumenter

| KPI | Formule |
|---|---|
| Taux de contact | opportunités passées en « Prise de contact » / nouvelles |
| Taux de qualification | qualifiées / contactées |
| Taux de prise de RDV | RDV fixés / qualifiées |
| **Show rate** | RDV honorés / RDV fixés |
| **Close rate** | gagnées / RDV honorés |
| Taux global lead → vente | gagnées / nouvelles |
| Panier moyen | CA signé (HT) / gagnées |
| Commission setter | montant HT × pourcentage saisi au closing |
| Délai de cycle | médiane (date gagné − date création) |
| CA par source | somme signée groupée par source |

Tous doivent être filtrables par période, source et personne — sinon on ne sait pas *où* corriger.

## 8. Stack technique

| Couche | Choix | Pourquoi |
|---|---|---|
| Base | Supabase Postgres (eu-west-3) | Données FR, RLS natif, tu maîtrises déjà |
| Auth | Supabase Auth, e-mail + mot de passe | Noé est seul admin et crée les comptes depuis l'écran d'administration ; aucun e-mail n'est envoyé |
| Front | Next.js (App Router) + TypeScript + Tailwind + shadcn/ui | Rapide à construire, composants kanban/table dispo |
| Hébergement | Vercel, ou VPS OVH via Dokploy | Dokploy si tu veux tout garder chez toi comme n8n |
| Temps réel | Supabase Realtime | Le kanban se met à jour quand le setter bouge une carte |

**Sécurité :** RLS activé sur toutes les tables, aucune clé service côté navigateur, accès uniquement par utilisateur authentifié.

## 9. Lotissement

| Lot | Contenu | Estimation |
|---|---|---|
| **L0** | Schéma Supabase + RLS + seed config + import du Google Sheets | ~0,5 j |
| **L1** | Auth, liste contacts, fiche opportunité, journal d'activité | ~1,5 j |
| **L2** | Kanban drag & drop, RDV, relances, « ma journée » | ~1,5 j |
| **L3** | Dashboard KPI | ~1 j |
| **L4** | Admin config + polish + mise en prod | ~0,5 j |
| *V2* | *Stripe, Google Calendar, Gmail* | *à cadrer* |

## 10. Points à trancher avant de construire

1. **Les étapes du §4** — reprises de ton fichier. Veux-tu du grain intermédiaire (qualifié, offre présentée) pour savoir *où* ça décroche ?
2. **Setting → closing** : est-ce toujours 2 RDV distincts, ou parfois un seul appel qui qualifie et close ? Le fichier n'a qu'une date de RDV, j'ai tout importé en RDV de closing.
3. **Motifs de perte** : budget, pas le bon moment, pas décideur, hors ICP, ghosting, concurrent, autre — ta liste ? Ton fichier n'en garde aucun, les 3 perdus sont importés en « Autre ».
4. **Canal d'acquisition** : « Direct / Setter » dit qui amène le RDV, pas d'où vient le lead. Veux-tu un second champ pour mesurer le CA par canal (webinaire, LinkedIn, Cockpit) ?
5. **Hébergement** : Vercel ou ton VPS Dokploy ?
