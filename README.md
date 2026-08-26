# CRM Altitude

Pipeline de vente Altitude — du lead à la vente, mesuré étape par étape.

| Fichier / dossier | Rôle |
|---|---|
| `cdc-crm-altitude.md` | Cahier des charges v1 (brouillon à valider) |
| `schema-crm-altitude.sql` | **L0** — schéma Postgres complet : tables, triggers, vues de mesure, RLS, durcissement, seed de config |
| `import-cockpit.sql` | Import du CRM existant (`COCKPIT SUIVI.xlsx`) — déjà exécuté, gardé comme trace |
| `app/` | **L1 → L4** — application Next.js 16 / React 19 / Tailwind 4 |

## Base de données

Projet Supabase **CRM Altitude** — `cwnxcckclbinhsxipowh`, région eu-west-3.
Le schéma y est déployé et **tes 30 lignes du COCKPIT SUIVI y sont importées**
(17 closes, 21 400 € signés, 17 RDV).

### Ce que le fichier source a changé dans le schéma

Le schéma initial reposait sur des suppositions. Ton fichier les a corrigées :

| Supposé | Ta réalité |
|---|---|
| 8 étapes (prise de contact, qualifié, offre présentée…) | **5 statuts** : Lead, En attente, Closé, Perdu, Mauvais ICP |
| Prix unifié 1 990 € | **1 000 à 2 500 €**, au cas par cas |
| Sources webinaire / Cockpit / LinkedIn / referral | **Direct / Setter** — qui amène le RDV |
| Plans 1x, 2x, 3x | + **4x** |
| — | **Encaissement** : processeur (Mollie, Stripe) × entité (auto-entreprise, SASU) |
| — | **Commission setter** versée ou non |
| Prénom + nom séparés | **Un seul champ nom** |

« Mauvais ICP » est à la fois une étape visible dans le kanban et un drapeau
`is_disqualified` : tu le vois, mais il ne pollue pas les taux de conversion.

Pour repartir de zéro ailleurs, coller `schema-crm-altitude.sql` dans le SQL Editor
d'une base vierge, ou :

```bash
psql "$DATABASE_URL" -f schema-crm-altitude.sql
```

## Premier accès

Crée ton compte **noe@prcz.fr** dans Supabase → *Authentication → Add user*, avec
ton mot de passe et *Auto Confirm User* coché.

Le trigger `on_auth_user_created` crée le profil automatiquement. **Le premier
compte de la base devient admin** — aucune manipulation SQL n'est nécessaire.
Ensuite, tous les autres comptes se créent depuis l'écran *Admin* du CRM.

Si tu avais déjà créé un compte avant cette version, corrige-le une fois :

```sql
update profiles set role = 'admin' where email = 'noe@prcz.fr';
```

Ton compte `noe@prcz.fr` existe déjà et porte le rôle admin.

## Gestion des comptes

Il n'y a pas d'inscription libre et **aucun e-mail n'est envoyé** : tu crées les
comptes, tu fixes le mot de passe, tu le transmets de vive voix.

Depuis *Admin → Utilisateurs* : créer un compte (avec générateur de mot de passe),
remplacer un mot de passe, changer un rôle, désactiver, réactiver, supprimer.

**Désactiver** coupe l'accès immédiatement — lecture comprise — révoque la session
en cours, et conserve tout l'historique produit par la personne. C'est l'opération
à privilégier. **Supprimer** est définitif et refusé si la personne a déjà loggé
une activité, pour que le journal reste intact.

Tu ne peux ni changer ton propre rôle, ni te désactiver, ni te supprimer : c'est
ce qui évite de se verrouiller dehors en étant seul admin.

Ces trois opérations — création, mot de passe, désactivation — passent par l'API
Admin de Supabase et exigent la **clé de service** dans `app/.env.local` :

```
SUPABASE_SECRET_KEY=sb_secret_…
```

Elle se récupère dans Supabase → *Project Settings → API Keys* (clé `service_role`
/ secret). Sans elle, l'écran affiche un avertissement explicite et ces boutons
restent désactivés ; le reste du CRM fonctionne normalement. **Ne la préfixe jamais
`NEXT_PUBLIC_`** : elle partirait dans le bundle navigateur et donnerait les pleins
droits sur la base à n'importe qui.

## Déploiement

| Fichier | Rôle |
|---|---|
| `Dockerfile` | Image de production, build en trois étapes, sortie autonome de Next |
| `.dockerignore` | Ce qui n'entre pas dans le contexte de build — secrets et données clients en tête |
| `nginx.conf` | Reverse proxy, **uniquement** pour un déploiement Docker « nu » |
| `docker-compose.yml` | Assemble l'application et nginx sur un VPS |

### Sur Dokploy

Dokploy embarque déjà Traefik comme reverse proxy et gère le certificat TLS.
**N'utilise ni `nginx.conf` ni `docker-compose.yml`** : ils feraient doublon.
Pointe Dokploy sur le dépôt et sur le `Dockerfile`, puis renseigne **trois
variables d'environnement** — et rien d'autre, pas de *build arguments* :

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SECRET_KEY
```

**Port du conteneur : `3000`.** C'est la valeur à mettre dans le champ
*Container Port* de Dokploy. Le port 80 n'apparaît que dans le service nginx
du `docker-compose.yml`, qui ne sert pas ici — un « Bad Gateway » vient
presque toujours de là : Traefik frappe à une porte où personne n'écoute.

### Diagnostiquer un déploiement

`GET /api/sante` répond toujours 200 — même sans configuration — et dit ce
qui manque :

```json
{ "pret": false,
  "aCorriger": ["NEXT_PUBLIC_SUPABASE_URL"],
  "configuration": {
    "NEXT_PUBLIC_SUPABASE_URL": { "presente": true,
      "probleme": "entourée de guillemets — retire-les" } } }
```

Elle ne révèle **aucune valeur**, seulement la présence et la forme des
variables. Elle détecte les guillemets saisis par erreur autour d'une valeur
et les espaces parasites — deux causes classiques d'« Internal Server Error »
après un déploiement.

Elle reste volontairement à 200 en configuration incomplète : la passer en
rouge ferait sortir le conteneur du routage, et l'erreur redeviendrait un
502 muet.

DNS : un enregistrement `A` du domaine vers l'adresse IP du VPS. Le
certificat TLS est demandé par Dokploy une fois le domaine résolu.

### Sur un VPS avec Docker seul

```bash
cp .env.deploiement.example .env
```

Renseigne les trois variables, puis `docker compose up -d --build`. Le TLS
reste à ajouter : les blocs `listen 443` et la redirection HTTP sont préparés
en commentaire dans `nginx.conf`.

### Pourquoi aucune variable au moment du build

Next inscrit normalement les variables `NEXT_PUBLIC_*` **dans le bundle
navigateur au moment du build**. Une image construite sans elles part alors
en production avec `undefined` à l'intérieur, et rien ne le signale avant la
première tentative de connexion.

Plutôt que d'exiger des *build arguments* — que toutes les plateformes ne
transmettent pas, et Dokploy ne le faisait pas —, le serveur lit ces valeurs
**au démarrage** et les dépose dans la page. Conséquences :

- la même image fonctionne dans n'importe quel environnement, sans être
  reconstruite ;
- il n'y a plus qu'un seul endroit à renseigner : les variables
  d'environnement ;
- si l'une manque, le serveur refuse de répondre avec un message qui la
  nomme, au lieu d'échouer silencieusement côté navigateur.

En contrepartie, **toutes les pages sont rendues à la demande**, y compris
`/login` : une page prérendue figerait la configuration dans son HTML.

`SUPABASE_SECRET_KEY` reste strictement côté serveur — vérifié, elle
n'apparaît pas dans la page.

## Lancer l'application

```bash
npm --prefix app run dev
```

`app/.env.local` contient déjà l'URL et la clé publishable du projet.
`app/.env.example` sert de modèle pour un autre environnement.

## À faire avant la mise en production

**Activer la protection contre les mots de passe compromis.** Maintenant que
l'authentification repose sur des mots de passe, Supabase peut les vérifier contre
la base HaveIBeenPwned : *Authentication → Policies → Leaked password protection*.
C'est désactivé par défaut, et je n'ai pas accès à la configuration Auth.

**Le SMTP par défaut reste plafonné** à quelques envois par heure. Ce n'est plus
bloquant — l'application n'envoie aucun e-mail — mais garde-le en tête si tu
réactives un jour une fonctionnalité qui en dépend.

## Ce qui a été vérifié, et comment

Sur la base réelle, pas seulement à la compilation.

**Schéma** — 11 tests SQL : historisation automatique des étapes, horodatage
gagné/perdu, motif de perte obligatoire, drapeau no-show propagé depuis les RDV,
immuabilité du journal d'activité, exclusion des hors-ICP de l'entonnoir.

**RLS** — 9 tests sous identité JWT réelle : un setter ne peut pas modifier le
contact d'un closer, ni la configuration, ni supprimer, ni signer une activité au
nom d'un collègue ; il peut se saisir du pool.

**Requêtes** — les 14 `select` imbriqués des pages rejoués via PostgREST.

**Interface** — parcours dans le navigateur : connexion, « Ma journée », kanban,
fiche opportunité, contacts, dashboard, admin. Écriture de bout en bout testée
(log d'une activité, drag & drop d'une carte), y compris le refus d'un passage en
« Perdu » sans motif.

**Import du CRM existant** — les 30 lignes rejouées écran par écran : le kanban
affiche 1 Lead / 5 En attente / 17 Closé, la liste contacts totalise 21 400 €
signés, le dashboard recalcule les taux. Chaque opportunité a traversé les étapes
une à une plutôt que d'apparaître à l'arrivée, pour que `stage_transitions` reste
cohérent.

**Comptes** — 15 tests supplémentaires : le premier compte devient admin et le
second setter sans intervention ; un compte désactivé ne lit plus rien (contacts,
config, opportunités, profils des autres) et n'écrit plus rien, mais lit toujours
son propre profil pour que l'application puisse le lui dire ; un admin désactivé
n'est plus admin ; personne ne s'auto-promeut ni ne se réactive. Dans le
navigateur : mauvais mot de passe refusé sans révéler si le compte existe,
connexion réussie, changement de rôle depuis l'admin, non-admin redirigé hors de
`/admin` et privé du lien de navigation, compte désactivé renvoyé vers l'écran
dédié en pleine session.

## Défauts trouvés et corrigés en cours de route

- **Le trigger d'immuabilité du journal bloquait les suppressions en cascade** —
  un contact ayant une activité loggée devenait indéfiniment indélébile, rendant
  impossible une demande d'effacement RGPD. Le `DELETE` est désormais verrouillé
  par RLS, pas par le trigger.
- **Une opportunité perdue comptait comme ayant traversé tout l'entonnoir** —
  l'étape « Perdu » étant en position 8, elle gonflait tous les taux.
- **`revoke ... from anon, authenticated` ne révoquait rien** — Postgres accorde
  `EXECUTE` à `PUBLIC` par défaut ; il fallait viser `PUBLIC`.
- **Embed PostgREST ambigu** — `appointments` a deux clés étrangères vers
  `profiles`, l'embed anonyme échouait à l'exécution.
- **Erreur d'hydratation sur le kanban** — dnd-kit numérote ses `aria-describedby`
  avec un compteur qui diverge entre serveur et client ; corrigé par un `id` fixe.
- **`citext` et les fonctions de trigger étaient exposées dans l'API REST.**
- **Le close rate dépassait 100 %** — 17 gagnées rapportées à 8 RDV honorés, parce
  que 13 de tes ventes historiques n'ont pas de date de RDV dans le fichier. Le
  numérateur et le dénominateur ne portaient pas sur la même population. Le taux ne
  se calcule plus que sur les ventes dont le RDV est tracé, et l'écran dit
  combien sont exclues.
- **Le délai de cycle affichait 0 jour** — une vente importée porte la même date de
  création et de signature. La médiane ne retient plus que les ventes dont la durée
  est réellement mesurable, et annonce sur combien elle porte.
- **Les filtres s'affichaient en pleine largeur** — `styleChamp w-auto` ne peut pas
  surcharger `w-full` : les deux classes ont la même spécificité, c'est l'ordre
  dans la feuille générée qui tranche, pas celui de la chaîne. Un style dédié
  remplace la surcharge.
- **Les relances ne s'annulaient pas au closing.** `update of won_at` se
  déclenche selon les colonnes citées dans le `SET` de la requête, pas selon
  celles qui changent réellement — or `won_at` est posé par un trigger `BEFORE`
  et n'apparaît jamais dans un `update ... set stage_id`. Le filtre est passé
  dans une clause `WHEN`. Trouvé par un test, pas à la lecture.
- **Erreur d'hydratation sur chaque fiche.** Les horodatages relatifs
  (« il y a 18 minutes ») étaient calculés au rendu : le serveur et le client
  tombaient sur des valeurs différentes, et React régénérait tout l'arbre à
  chaque ouverture. Corrigé par `suppressHydrationWarning`, prévu pour ce cas.
- **La boîte de confirmation de suppression héritait du `text-right`** de la
  cellule de tableau qui la contient : titre et texte partaient à droite malgré
  un positionnement `fixed`.
- **Le raccourci « Passer à l'étape suivante » avait disparu** après avoir placé
  « Closé » à droite : le code cherchait `position + 1`, qui tombe désormais sur
  « Perdu ». Il cherche maintenant la première étape non perdue au-delà de
  l'actuelle.
- **La barre « Annuler » d'une relance validée ne s'affichait jamais** :
  `revalidatePath` recharge la liste depuis le serveur, la tâche quittait donc les
  props et l'état optimiste devenait orphelin. L'objet est désormais conservé en
  mémoire locale.
- **`is_active` ne servait à rien** — la colonne existait depuis le premier jour
  mais n'était vérifiée nulle part, ni dans l'application ni dans la RLS.
  Désactiver un utilisateur ne l'empêchait ni de lire ni d'écrire. Toutes les
  policies passent désormais par `est_actif()`.

Les advisors Supabase sont passés de 15 avertissements à 2, tous deux
incontournables : `is_admin()` et `current_role_name()` sont évaluées dans les
policies RLS, donc `authenticated` doit pouvoir les exécuter. Les appeler
directement ne révèle que son propre rôle.

## Décisions prises dans le schéma, non tranchées dans le CDC

Choix par défaut, tous réversibles.

- **Drapeaux transverses en booléens** (`is_no_show`, `is_nurturing`,
  `is_disqualified`) : le CDC les décrit comme des drapeaux, et ils peuvent
  coexister.
- **Motif de perte obligatoire par trigger**, pas seulement par l'UI : impossible
  de passer en Perdu sans motif, même via l'API.
- **Journal d'activité immuable** : aucune policy d'`UPDATE` pour les non-admins,
  plus un trigger. Une correction passe par une nouvelle ligne.
- **`stage_transitions` alimentée par trigger `SECURITY DEFINER`** : personne n'y
  écrit depuis le client, l'historique ne peut pas être maquillé.
- **Les hors-ICP sont exclus des taux** : disqualifier un lead ne dégrade pas le
  taux de conversion.
- **Un setter peut écrire sur le pool non assigné**, sinon personne ne peut se
  saisir d'un lead entrant. **Un closer aussi** — la policy `contacts` n'est pas
  sensible au rôle. À trancher si tu veux réserver le pool aux setters.
- **Prix** : aucune valeur par défaut sur `amount_proposed`. À figer à 1 990 € si
  la question 3 du CDC est tranchée dans ce sens.
- **Un utilisateur qui a loggé une activité se désactive** (`is_active`), il ne se
  supprime pas — `activities.author_id` est en `on delete restrict`. L'écran admin
  refuse la suppression dans ce cas plutôt que de laisser remonter une erreur.
- **Mot de passe : 10 caractères minimum**, imposé côté serveur. Supabase n'en exige
  que 6 par défaut.
- **Le premier compte de la base devient admin.** Sur une base vierge, il faut bien
  que quelqu'un puisse administrer sans passer par du SQL.

## Closer une affaire

Le même parcours de closing est accessible depuis trois endroits, avec une seule
et même modale — un seul code, donc aucune divergence possible entre les trois :

- **Ma journée**, sur le rendez-vous du jour (le RDV passe alors honoré) ;
- **la liste contacts**, bouton « Closer » au survol de la ligne — visible
  uniquement sur les affaires encore ouvertes ;
- **la fiche opportunité**, bouton vert en tête du bloc « Faire avancer ».

## Clôturer un rendez-vous depuis « Ma journée »

Chaque RDV du jour porte trois issues, plus le no-show en retrait.

**Closé** ouvre une saisie : entité d'encaissement, montant HT, taux de TVA,
montant TTC, mode de paiement (one shot à 4 fois), commission du setter en
pourcentage. Une **projection des mensualités** s'affiche en direct, et
l'échéancier est enregistré dans `payments` à la validation.

- Le **taux de TVA est un champ visible** (0 / 5,5 / 10 / 20 %), pré-rempli à
  20 % sur la SASU et 0 % sur l'auto-entreprise en franchise de TVA. Le TTC en
  découle mais reste modifiable à la main. Ce taux était auparavant codé en dur
  et invisible — une hypothèse cachée qui donnait un TTC égal au HT sans
  qu'on comprenne pourquoi.
- L'**entité impose le processeur** : SASU → Stripe, auto-entreprise → Mollie.
  Ce n'est pas qu'une règle d'écran, c'est une contrainte de base : l'API et n8n
  ne peuvent pas créer d'incohérence comptable.
- Le **CA du dashboard se base sur le HT**, qui est le vrai revenu.

**Perdu** demande le motif en un clic parmi la liste configurée. Ta demande
disait « direct », mais sans motif le trigger refuse l'opération et surtout
l'analyse des pertes du §7 du CDC devient impossible — un clic de plus,
et les pertes restent lisibles. Dis-moi si tu préfères vraiment zéro clic.

**En attente** demande le motif, le contenu et la date de la relance. La date
est pré-remplie au délai de ta première règle active.

**No-show** est conservé, en retrait : tu ne l'avais pas mentionné, mais sans lui
le taux de présence du dashboard n'a plus de source.

## Relances automatiques

Dès qu'un rendez-vous passe en **honoré**, le CRM pose les relances configurées —
**J+2 et J+5 par défaut** — à condition que l'affaire ne soit ni gagnée ni perdue.
Elles s'annulent d'elles-mêmes au closing ou à la perte, tout en restant visibles
en trace. Les relances écrites à la main ne sont jamais annulées.

Les règles se modifient dans *Admin → Relances automatiques* : libellé, délai en
jours, activation, ajout et suppression.

Le mécanisme vit en base, pas dans l'application : un RDV marqué honoré par n8n ou
par l'API produit exactement les mêmes relances qu'un clic dans l'écran.

## Automatisation n8n : un RDV reçu par mail

`appointments.opportunity_id` est **NOT NULL** : un rendez-vous n'existe jamais
seul, il est rattaché à une opportunité. Insérer un contact ne suffit donc pas —
il faut contact → opportunité → rendez-vous, dans cet ordre.

Plutôt que d'enchaîner trois appels HTTP dans n8n (et de laisser un contact
orphelin si le deuxième échoue), une fonction fait tout en une transaction :

```
POST https://cwnxcckclbinhsxipowh.supabase.co/rest/v1/rpc/crm_entree_rdv
```

En-têtes :

| Clé | Valeur |
|---|---|
| `apikey` | ta clé **service_role** |
| `Authorization` | `Bearer <même clé service_role>` |
| `Content-Type` | `application/json` |

Corps :

```json
{
  "p_nom": "Marie Dubois",
  "p_date_rdv": "2026-08-25T14:00:00+02:00",
  "p_email": "marie.dubois@exemple.fr",
  "p_telephone": "+33 6 11 22 33 44",
  "p_entreprise": "Dubois Conseil",
  "p_source": "setter",
  "p_type": "closing",
  "p_duree_min": 45,
  "p_lieu": "https://meet.google.com/abc-defg",
  "p_notes": "Vient du webinaire du 12"
}
```

Seuls `p_nom` et `p_date_rdv` sont obligatoires. `p_date_rdv` doit être une date
ISO 8601 **avec fuseau** — sans lui, Postgres l'interprète en UTC et le RDV
apparaît décalé de deux heures l'été.

Ce que la fonction fait :

1. Retrouve le contact par e-mail (insensible à la casse) ou par téléphone
   normalisé — les espaces et le `+` ne créent plus de doublon. Sinon, le crée.
   Sur un contact connu, elle comble les champs vides sans écraser l'existant.
2. Réutilise l'opportunité encore ouverte, sinon en ouvre une en « Lead ».
   Un contact reclosé plus tard aura bien deux opportunités distinctes, sinon
   les taux de conversion seraient faussés.
3. Passe l'opportunité en « En attente ».
4. Pose le rendez-vous.

Elle renvoie les trois identifiants et ce qui a été créé :

```json
{
  "contact_id": "…", "opportunity_id": "…", "appointment_id": "…",
  "contact_cree": true, "opportunite_creee": true, "rdv_deja_present": false
}
```

**Elle est idempotente** sur le couple (opportunité, créneau) : si n8n rejoue le
webhook, elle renvoie le rendez-vous existant avec `rdv_deja_present: true` au
lieu d'en créer un second. Tu peux donc réessayer sans risque.

La fonction n'est exécutable que par le rôle `service_role`. Un utilisateur
connecté au CRM ne peut pas l'appeler.

## Relance WhatsApp rédigée par l'IA

Sur chaque fiche opportunité, un panneau **Relance WhatsApp** rédige un brouillon
à partir de tout ce que le CRM sait : nom, entreprise, rôle, douleur exprimée,
étape, montant, historique complet des échanges, statut du dernier RDV, temps
écoulé depuis le dernier contact. Un champ libre permet d'imposer un angle
(« propose un créneau jeudi »).

Le message n'est **jamais envoyé automatiquement**. Il s'affiche dans un champ
modifiable ; à toi de le relire, puis de le copier ou d'ouvrir WhatsApp avec le
texte pré-rempli — l'envoi reste ton geste. Un bouton « Logger comme envoyé »
l'ajoute à l'historique de l'opportunité.

Il faut une clé OpenAI dans `app/.env.local` :

```
OPENAI_API_KEY=sk-…
```

Le modèle par défaut est `gpt-4o-mini` ; `OPENAI_MODEL` permet d'en choisir un
autre. Sans clé, le panneau affiche la marche à suivre au lieu d'échouer, et le
reste du CRM fonctionne normalement. **Ne la préfixe jamais `NEXT_PUBLIC_`** :
elle partirait dans le bundle navigateur et n'importe qui pourrait la consommer.

## Performance

Mesuré, pas supposé. Le point de départ : ~1 100 ms par navigation.

### Ce qui coûtait

Un aller-retour vers Supabase coûte **~200 ms sur ce réseau** (connexion TCP
135–346 ms, TLS 110–340 ms). À froid, une seule requête montait à 740 ms ; sur
une connexion réutilisée, 157 ms. Le volume de données n'y était pour rien —
seul comptait **le nombre d'allers-retours**, et il y en avait cinq à six par
page :

| Étape | Coût |
|---|---|
| `getUser()` dans le middleware | 1 aller-retour |
| `profilCourant()` dans le layout | 2 allers-retours |
| `profilCourant()` à nouveau dans la page | 2 allers-retours |
| Requêtes de la page | 1 aller-retour |

Et la production n'était **pas** plus rapide que le développement : ce n'était
donc pas un problème de compilation.

### Ce qui a changé

- **Vérification locale du jeton.** Les jetons du projet sont signés en ES256 :
  `getClaims()` vérifie la signature avec la clé publique mise en cache, sans
  appeler le serveur d'authentification. `getUser()`, lui, faisait un appel
  réseau à chaque requête — y compris sur les préchargements.
  **`proxy.ts` est passé de 216–1355 ms à 2–4 ms.**
- **Déduplication par requête.** `identiteCourante()` et `profilCourant()` sont
  enveloppés dans `cache()` de React : le layout et la page partagent le même
  résultat au lieu de le recharger chacun.
- **Parallélisation.** Les pages n'attendent plus le profil avant de lancer
  leurs requêtes : tout part dans le même `Promise.all`.
- **Actions serveur allégées.** Elles chargeaient le profil complet pour une
  simple garde d'authentification ; elles se contentent désormais de l'identité,
  lue localement. Seules celles qui ont besoin du rôle chargent le profil.

### Résultat

| Route | Avant | Après |
|---|---|---|
| Ma journée | 1 149 ms | **266 ms** |
| Contacts | 989 ms | **344 ms** |
| Pipeline | 1 120 ms | **386 ms** |
| Dashboard | 1 224 ms | **479 ms** |
| Fiche opportunité | 1 090 ms | **481 ms** |

La fiche reste la plus lente : elle enchaîne deux vagues de requêtes, la seconde
ayant besoin de l'identifiant du contact renvoyé par la première.

### Deux choses à savoir

**En développement, Next ne précharge pas les liens.** En production il le fait
au survol et à l'apparition à l'écran, donc un clic paraît instantané. Pour
comparer :

```bash
npm --prefix app run build && npm --prefix app run start
```

**La latence réseau vers Supabase reste le plancher.** ~200 ms par aller-retour
depuis cette machine. Si l'application est un jour déployée à Paris comme la
base, ces temps devraient encore chuter.

## Fluidité et interface

Ce qui a changé sur ce front :

- **Squelettes de chargement** (`loading.tsx`) sur le pipeline, les contacts et le
  reste. Avant, une navigation restait figée jusqu'à la fin de la requête serveur ;
  la page se dessine maintenant tout de suite.
- **Recherche instantanée dans les contacts** : les lignes sont chargées une fois
  puis filtrées dans le navigateur, sans aller-retour serveur à chaque frappe.
  Tri par nom, montant ou date, filtre par statut et par appartenance.
- **Tableau de contacts refondu** : initiales, statut coloré, montant, source,
  prochaine action en retard signalée, compteur « X sur 30 » et total signé qui
  suivent les filtres.
- **Les filtres ne naviguent plus** : `replace` sans défilement au lieu de `push`,
  donc pas d'historique pollué ni de remontée en haut de page.
- **Le kanban ne saute plus** : le rafraîchissement temps réel est temporisé, un
  déplacement ne déclenche plus une rafale de rechargements complets.
- **Colonne « Entreprise » retirée** de la liste contacts.
- **Fiche contact allégée** : rôle, secteur, effectif, CA et LinkedIn ont été
  supprimés du schéma et des formulaires — vérifiés vides sur la totalité des
  contacts avant suppression. Le panneau n'affiche plus de colonnes de tirets.
- **Suppression d'un contact** (admin uniquement) : icône corbeille au survol
  d'une ligne de la liste, et bloc « Zone sensible » en bas de la fiche
  opportunité. Depuis la fiche, la suppression renvoie vers la liste — un
  simple rafraîchissement afficherait un 404, la page venant de disparaître. La confirmation annonce précisément
  ce qui sera détruit en cascade — opportunités, activités, RDV, relances — et
  alerte séparément si du chiffre d'affaires signé va disparaître du dashboard.
- **Moins de bruit** : « Noé → Noé » a disparu des cartes et de l'en-tête de fiche ;
  les porteurs ne s'affichent que si l'équipe compte plus d'une personne.
- **Colonnes de kanban repliables** : « Closé » est passé tout à droite, et chaque
  colonne se réduit en une bande verticale qui reste une cible de dépôt. Le pli
  est mémorisé d'une session à l'autre.
- **Relances validables d'un clic** dans « Ma journée » : la ligne disparaît
  immédiatement et une barre « Annuler » permet de revenir sur un faux clic.

## Non fait

- **L'appel à OpenAI n'a pas été exécuté** : je n'ai pas ta clé. Le chemin
  « clé absente » est vérifié à l'écran, la construction du contexte et la gestion
  des erreurs (401, 429, modèle inconnu) sont écrites, mais la réponse réelle du
  modèle reste à valider — au premier message que tu généreras.
- **Les actions qui exigent la clé de service** — création de compte, changement
  de mot de passe, désactivation, suppression — n'ont pas pu être exécutées de bout
  en bout : la clé n'est pas récupérable depuis mes outils, c'est à toi de la
  coller. Leur garde-fou d'accès (`exigerAdmin`) et la RLS sont testés, mais l'appel
  à l'API Admin de Supabase ne l'est pas. À vérifier au premier compte que tu crées.
- **Le `Dockerfile` et le `nginx.conf` n'ont pas pu être exécutés** : ni Docker
  ni nginx ne sont installés sur cette machine. Ce qui a été vérifié : la sortie
  autonome démarre comme le fera l'image (`node server.js`), la sonde `/api/sante`
  répond 200, `/login` reste public et `/contacts` redirige toujours sans session.
  Ce qui reste à confirmer au premier déploiement : que `docker build` aboutit et
  que `nginx -t` valide la configuration.
- **L'import CSV ne reprend que les champs de contact** (Nom, Mail, Téléphone,
  Entreprise, Poste, Secteur, Effectif, Source, Notes) — il reconnaît les libellés
  de ton COCKPIT SUIVI. Il n'importe **pas** le statut, le montant ni le mode de
  paiement : ton historique est déjà en base, et un ré-import créerait des
  doublons. Si tu veux pouvoir réimporter la feuille complète, c'est à cadrer.
- **Le bouton « Chiffrer » de la fiche coexiste avec « Closer »** et fait double
  emploi en partie : il modifie les montants sans régénérer l'échéancier. À
  fusionner ou à restreindre à la correction d'une affaire déjà closée.
- **Aucun écran ne permet de modifier un contact existant** : la fiche opportunité
  affiche le panneau contact en lecture seule. La suppression, elle, est
  disponible (icône corbeille au survol d'une ligne, admin uniquement).
- **Hébergement** : rien n'est déployé. Vercel ou ton VPS Dokploy, à trancher
  (question 7 du CDC).
- **Les 7 points du §10 du CDC** restent ouverts, à commencer par les étapes du
  pipeline, que je n'ai pas pu confronter à `script-setter.md` / `script-closing.md`.
