-- Données de départ ressemblant à la base de Lionel (avant 0044).
insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'lionel@test');
insert into profils (user_id, prenom, nom, entreprise) values ('11111111-1111-1111-1111-111111111111', 'Lionel', 'Test', 'Bonati SA');
insert into statuts (cle, nom, couleur, ordre) values ('confirme', 'Confirmé', '#0a0', 1), ('areserver', 'À réserver', '#f80', 2) on conflict (cle) do nothing;
insert into chantiers (nom, couleur) values ('26150 - Villa Bine', '#bfe0c9'), ('26182 - Padel', '#c9d5f0');
insert into groupes (nom, ordre, ligne_unique) select 'Machines', 1, false where not exists (select 1 from groupes where nom = 'Machines');
insert into personnes (nom, ordre) values ('Mathis', 1), ('Paul', 2);
insert into personnes (nom, ordre, equipe) values ('La dream team', 3, true);
insert into personnes (nom, ordre, groupe_id) values ('Machines', 4, (select id from groupes where nom = 'Machines' limit 1));
insert into categories_elements (groupe_id, nom, ordre) values ((select id from groupes where nom = 'Machines' limit 1), 'Pelles', 1);
insert into elements_groupes (groupe_id, nom, ordre, categorie_id) values ((select id from groupes where nom = 'Machines' limit 1), 'Pelle 8 t', 1, (select id from categories_elements limit 1));
insert into feries (date, libelle) values ('2026-12-25', 'Noël');
insert into horaires (date_debut, date_fin, matin_debut, matin_fin, aprem_debut, aprem_fin) values ('2026-01-01', '2026-12-31', '07:30', '12:00', '13:00', '16:45');
insert into formulaires_rapides (nom, ordre, type_entree) values ('Béton', 1, 'tache');
insert into formulaires_rapides_champs (formulaire_id, cle, label, type) values ((select id from formulaires_rapides limit 1), 'm3', 'm³', 'texte');
insert into series (type, cible_personne_id, cible_demi, texte, date_debut, frequence, fin_type, fin_valeur) values ('tache', (select id from personnes where nom = 'Mathis'), 'matin', 'Réunion', '2026-11-02', 'semaine', 'occurrences', '4');
insert into taches (personne_id, date, demi, texte, chantier_id, statut_id, pieces) values
  ((select id from personnes where nom = 'Mathis'), '2026-11-10', 'matin', 'Coffrage', (select id from chantiers where nom like '26150%'), (select id from statuts where cle = 'confirme'), '[{"chemin": "fichiers/aaa/Plan.pdf", "nom": "Plan.pdf"}]'),
  ((select id from personnes where nom = 'Mathis'), '2026-11-11', 'matin', 'Congé', null, null, '[]'),
  ((select id from personnes where nom = 'La dream team'), '2026-11-10', 'aprem', 'Ferraillage', (select id from chantiers where nom like '26182%'), null, '[]'),
  ((select id from personnes where nom = 'Mathis'), '2026-11-09', 'matin', 'Réunion', null, null, '[]');
update taches set est_absence = true where texte = 'Congé';
update taches set serie_id = (select id from series limit 1) where texte = 'Réunion';
insert into jalons (date, texte, chantier_id) values ('2026-11-12', 'Livraison', (select id from chantiers where nom like '26150%'));
insert into notes (date, texte) values ('2026-11-13', 'Note de chantier');
insert into equipes_compositions (equipe_id, lundi, membres) values ((select id from personnes where nom = 'La dream team'), '2026-11-09', array[(select id from personnes where nom = 'Mathis')]);
insert into reglages (cle, valeur) values ('ordre_groupes', '["personnel", "groupe-1", "intervenants"]');
insert into couleurs_perso (id, clair) values ('principale', '#123456');
insert into liens_consultation (personne_id, jeton) values ((select id from personnes where nom = 'Mathis'), '0123456789abcdef0123456789abcdef');
insert into liens_responsables (nom, jeton) values ('Patron', 'fedcba9876543210fedcba9876543210');
insert into demandes_absence (personne_id, date_debut, date_fin) values ((select id from personnes where nom = 'Mathis'), '2026-11-20', '2026-11-20');
insert into abonnements_push (endpoint, p256dh, auth) values ('https://push.test/1', 'k', 'a');
insert into retours (sorte, texte, appareil, cree_par) values ('bug', 'Un bug', 'ordinateur', '11111111-1111-1111-1111-111111111111');
insert into storage.buckets (id, name) values ('pieces', 'pieces') on conflict do nothing;
insert into storage.objects (bucket_id, name, created_at) values ('pieces', 'fichiers/aaa/Plan.pdf', now() - interval '30 days'), ('pieces', 'fichiers/zzz/Vieux.pdf', now() - interval '30 days');
select creer_sauvegarde('manuelle');
