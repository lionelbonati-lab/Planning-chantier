-- ============================================================
-- Planning Chantiers — schéma initial (Postgres / Supabase)
-- Migration 0001 — 03.09.2026
--
-- Correspond au §3 de MIGRATION-GITHUB-PLAN.md. À coller tel quel dans
-- Supabase : Éditeur SQL (icône "SQL Editor" dans le menu de gauche du
-- tableau de bord du projet) > "New query" > coller > "Run".
--
-- Remplace le classeur Google "Planning" : chaque personne, tâche, jalon,
-- note, chantier, statut, formulaire rapide, jour férié et série récurrente
-- devient une vraie ligne de table, avec une vraie date, au lieu d'une
-- position de cellule ou d'un tag entre crochets à décoder.
--
-- Ce script peut être relancé sans risque tant que le projet est encore en
-- phase de mise en place (aucune vraie donnée saisie) : il commence par
-- supprimer les tables si elles existent déjà, avant de les recréer — utile
-- si le script a déjà été exécuté une fois, en partie ou en entier (c'est ce
-- qui provoque l'erreur "relation ... already exists"). Une fois que
-- l'appli aura de vraies données dedans, ne plus relancer ce script tel
-- quel (il effacerait tout) — une future migration numérotée (0003, 0004...)
-- prendra le relais pour les changements ultérieurs.
-- ============================================================

drop table if exists notes cascade;
drop table if exists jalons cascade;
drop table if exists taches cascade;
drop table if exists assignations cascade;
drop table if exists series cascade;
drop table if exists feries cascade;
drop table if exists formulaires_rapides_champs cascade;
drop table if exists formulaires_rapides cascade;
drop table if exists statuts cascade;
drop table if exists chantiers cascade;
drop table if exists personnes cascade;

create table personnes (
  id            bigint generated always as identity primary key,
  nom           text not null,
  sous_traitant boolean not null default false,
  actif         boolean not null default true,
  ordre         integer not null default 0,
  created_at    timestamptz not null default now()
);

create table chantiers (
  id         bigint generated always as identity primary key,
  nom        text not null unique,
  couleur    text not null,          -- hex, ex. "#3a7bd5"
  created_at timestamptz not null default now()
);

-- Statuts de réservation (sous-traitants uniquement, cf. Aucun/À réserver/
-- Réservé/Confirmé/Annulé de l'appli actuelle).
create table statuts (
  id      bigint generated always as identity primary key,
  cle     text not null unique,      -- ex. "confirme"
  nom     text not null,             -- ex. "Confirmé"
  couleur text not null,
  ordre   integer not null default 0
);

create table formulaires_rapides (
  id          bigint generated always as identity primary key,
  nom         text not null,
  ordre       integer not null default 0,
  -- '' = tout le monde, '@personnel', '@intervenants', ou l'id d'une personne
  -- précise (converti en texte) : reprend exactement les valeurs déjà
  -- utilisées par assigneA côté Index.html actuel.
  assigne_a   text not null default '',
  type_entree text not null check (type_entree in ('tache', 'absence'))
);

create table formulaires_rapides_champs (
  id            bigint generated always as identity primary key,
  formulaire_id bigint not null references formulaires_rapides(id) on delete cascade,
  cle           text not null,
  label         text not null,
  type          text not null check (type in ('texte', 'nombre', 'select', 'case')),
  options       jsonb,               -- liste d'options, pour type = 'select'
  ordre         integer not null default 0
);

create table feries (
  id        bigint generated always as identity primary key,
  date      date not null unique,
  libelle   text not null,
  categorie text not null default 'ferie' check (categorie in ('ferie', 'vacances_entreprise')),
  couleur   text
);

-- Une série génère des occurrences dans taches/jalons/notes (colonne
-- serie_id ci-dessous) — reprend le modèle [Série:xxxxxx] déjà utilisé,
-- mais avec les paramètres de génération conservés en base plutôt que
-- reconstitués depuis les occurrences déjà posées.
create table series (
  id                bigint generated always as identity primary key,
  type              text not null check (type in ('tache', 'jalon', 'note')),
  -- cible_* uniquement pour type = 'tache' ; nul pour jalon/note.
  cible_personne_id bigint references personnes(id) on delete cascade,
  cible_demi        text check (cible_demi in ('matin', 'aprem')),
  texte             text not null,
  statut_id         bigint references statuts(id),
  important         boolean not null default false,
  chantier_id       bigint references chantiers(id),
  date_debut        date not null,
  frequence         text not null check (frequence in ('jour', 'semaine', 'mois', 'annee')),
  intervalle        integer not null default 1,
  fin_type          text not null check (fin_type in ('occurrences', 'date')),
  fin_valeur        text not null,   -- nombre d'occurrences, ou date ISO si fin_type = 'date'
  created_at        timestamptz not null default now()
);

-- Remplace la "ligne Chantier" du classeur : quel chantier pour cette
-- personne, ce jour, cette demi-journée. Contrairement au classeur actuel
-- (1 seule valeur par cellule physique), plusieurs lignes sont possibles ici
-- pour la même (personne, date, demi) — cf. §4 du plan, "deux chantiers sur
-- une même demi-journée" devient possible sans changement de schéma.
create table assignations (
  id          bigint generated always as identity primary key,
  personne_id bigint not null references personnes(id) on delete cascade,
  date        date not null,
  demi        text not null check (demi in ('matin', 'aprem')),
  chantier_id bigint not null references chantiers(id)
);
create index idx_assignations_personne_date on assignations (personne_id, date);

-- Remplace la ligne "détail" du classeur, avec statut et important comme de
-- vraies colonnes au lieu d'un préfixe [Confirmé]/[Important] à décoder.
create table taches (
  id          bigint generated always as identity primary key,
  personne_id bigint not null references personnes(id) on delete cascade,
  date        date not null,
  demi        text not null check (demi in ('matin', 'aprem')),
  ordre       integer not null default 0,
  texte       text not null,
  statut_id   bigint references statuts(id),
  important   boolean not null default false,
  serie_id    bigint references series(id) on delete set null
);
create index idx_taches_personne_date on taches (personne_id, date);

-- Ligne 4 du classeur (jalons d'architecte, un texte par jour).
create table jalons (
  id        bigint generated always as identity primary key,
  date      date not null,
  texte     text not null,
  important boolean not null default false,
  serie_id  bigint references series(id) on delete set null
);
create index idx_jalons_date on jalons (date);

-- Ligne 5 du classeur (notes libres). Plusieurs notes indépendantes par
-- jour restent possibles (round 9 du 28.08.2026, déjà le cas aujourd'hui) :
-- il suffit d'avoir plusieurs lignes avec la même date.
create table notes (
  id        bigint generated always as identity primary key,
  date      date not null,
  texte     text not null,
  important boolean not null default false,
  serie_id  bigint references series(id) on delete set null
);
create index idx_notes_date on notes (date);
