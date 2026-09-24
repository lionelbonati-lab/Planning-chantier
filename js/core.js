"use strict";
  /* ============ SUPABASE (phase 4) ============
     Remplace google.script.run — cf. MIGRATION-GITHUB-PLAN.md §6bis pour le
     découpage complet. Cette première étape (bootstrap + authentification)
     pose le client et l'écran de connexion ; le reste de l'appli (gs/gsP,
     chargement du planning) n'est PAS ENCORE branché dessus — les étapes
     suivantes du plan s'en chargent. Clé "anon" : publique par construction
     (comme côté navigateur pour n'importe quelle appli Supabase), l'accès aux
     données reste cadré par les policies RLS (sql/0002_rls.sql), jamais par
     le secret de cette clé.
     ============================================================ */
  var SUPABASE_URL = "https://mvqvznohgtpulpgalvxl.supabase.co";
  var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12cXZ6bm9oZ3RwdWxwZ2FsdnhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0ODI2MDcsImV4cCI6MjEwNDA1ODYwN30.HJjw2evEw1ka1IQAPNgba8sA8qDNRWhPvd96Kx4DkUQ";
  var sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  function afficherEcranConnexion(messageErreur) {
    app.innerHTML =
      '<div class="login-screen"><div class="login-card">' +
      '<h1>Planning Chantiers</h1>' +
      '<p class="sous-titre">Connexion requise pour accéder au planning.</p>' +
      '<form id="formConnexion">' +
      '<label for="champEmail">Adresse e-mail</label>' +
      '<input type="email" id="champEmail" autocomplete="username" required>' +
      '<label for="champMdp">Mot de passe</label>' +
      '<input type="password" id="champMdp" autocomplete="current-password" required>' +
      '<div class="erreur" id="erreurConnexion"></div>' +
      '<button type="submit" id="btnConnexion">Se connecter</button>' +
      '</form></div></div>';
    document.getElementById("formConnexion").addEventListener("submit", function (e) {
      e.preventDefault();
      var email = document.getElementById("champEmail").value.trim();
      var motDePasse = document.getElementById("champMdp").value;
      var erreurEl = document.getElementById("erreurConnexion");
      var btn = document.getElementById("btnConnexion");
      erreurEl.textContent = "";
      btn.disabled = true; btn.textContent = "Connexion…";
      sbClient.auth.signInWithPassword({ email: email, password: motDePasse }).then(function (r) {
        if (r.error) {
          btn.disabled = false; btn.textContent = "Se connecter";
          erreurEl.textContent = messageConnexionLisible_(r.error);
          return;
        }
        demarrerApresConnexion();
      });
    });
    if (messageErreur) document.getElementById("erreurConnexion").textContent = messageErreur;
  }

  // Messages Supabase Auth tels quels sont en anglais et assez techniques —
  // reformulés ici pour rester dans le ton du reste de l'appli (cf. erreurFatale).
  function messageConnexionLisible_(err) {
    var m = String((err && err.message) || err || "");
    if (/invalid login credentials/i.test(m)) return "E-mail ou mot de passe incorrect.";
    if (/email not confirmed/i.test(m)) return "Ce compte n'a pas encore été confirmé — vérifie tes e-mails.";
    return "Échec de la connexion : " + m;
  }

  function afficherLienDeconnexion() {
    if (document.getElementById("lienDeconnexion")) return;
    var a = document.createElement("div");
    a.id = "lienDeconnexion";
    a.className = "lien-deconnexion";
    a.textContent = "Se déconnecter";
    a.addEventListener("click", function () {
      sbClient.auth.signOut().then(function () { window.location.reload(); });
    });
    document.body.appendChild(a);
  }

  // Point d'entrée réel de l'appli une fois connecté. Jusqu'à l'étape 1
  // (§6bis) volontairement PAS relié à demarrer() (message de confirmation
  // à la place, le temps que la connexion seule soit vérifiable) —
  // maintenant que demarrer() parle vraiment à Supabase (étape 2), on le
  // branche pour de bon : c'est ici que "connexion" et "chargement du
  // planning" se rejoignent enfin.
  function demarrerApresConnexion() {
    afficherLienDeconnexion();
    demarrer();
  }

  // Vérifie s'il existe déjà une session valide (retour sur l'appli sans
  // avoir à se reconnecter) avant d'afficher l'écran de connexion.
  function verifierSessionEtDemarrer() {
    afficherChargement("Vérification de la connexion…");
    sbClient.auth.getSession().then(function (r) {
      if (r.data && r.data.session) { demarrerApresConnexion(); return; }
      afficherEcranConnexion();
    }).catch(function () { afficherEcranConnexion(); });
  }

  /* ============================================================
     PORTAGE V3 -> BACKEND RÉEL — architecture de synchronisation
     ------------------------------------------------------------
     Le moteur d'affichage/interaction (grille, glisser-déposer,
     sélection, popups) est repris du prototype prototype-bulles.html
     (V3) : il continue de travailler sur des tableaux en mémoire
     TACHES/JALONS/NOTES/PERSONNES/CHANTIERS/STATUTS/FORMULAIRES_RAPIDES,
     exactement comme avant — c'est ce qui permet de conserver son
     UI/UX (double-clic, glisser, séries, undo/redo…) sans le
     réécrire intégralement.
     La différence structurelle (cf. TRANSFERT-V3-SPEC.md) : ces
     tableaux ne sont plus la source de vérité. Ils sont RECONSTRUITS
     à chaque chargement depuis les données serveur (etat.cache, une
     par semaine, via apiChargerSemaine/apiDemarrer) par
     construireVueDepuisCache(), et resynchronisés vers le serveur par
     un moteur de diff générique (cf. synchroniser()) après toute
     mutation locale — au lieu de chaque fonction de mutation appelant
     elle-même une API précise, elle continue de muter TACHES/JALONS/
     NOTES localement (comme le prototype) puis appelle render(), qui
     déclenche automatiquement la synchronisation.
     Exceptions à ce principe (elles court-circuitent la mutation
     locale et appellent le serveur directement) : la création/
     modification/suppression d'une SÉRIE (apiEnregistrerSerie/
     apiModifierSerie/apiSupprimerSerie) — une série peut toucher des
     semaines hors de la fenêtre affichée, qu'un diff local ne peut
     pas voir — et tout le CRUD des pages de configuration (Personnel,
     Intervenants, Chantiers, Statuts, Entrée rapide, Fériés), qui
     n'ont pas d'équivalent dans TACHES/JALONS/NOTES.
     `gi` (coordonnée de jour dans la grille affichée) redevient une
     pure coordonnée d'AFFICHAGE, recalculée à chaque chargement —
     jamais stockée comme identité pérenne d'un item (cf. §1 du
     spec) : chaque tâche/jalon/note porte, en plus de son giDebut
     d'affichage, la vraie date ISO de son premier jour (`.dateDebutIso`),
     retrouvée en relisant etat.cache au moment de la synchronisation.
     ============================================================ */

  /* ============ helpers généraux ============ */
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function esc2(s) { return esc(s).replace(/'/g, "&#39;"); }

  var ICONS = {
    close: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    print: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M5 8V3h10v5M5 15h10v3H5v-3zM3 8h14a1 1 0 0 1 1 1v5h-3M3 8a1 1 0 0 0-1 1v5h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    // Assignation groupée + décalage en masse (réintégration V2, cf.
    // FRONTEND-CHANGELOG.md) : icône "personnes" pour le bouton Assigner.
    people: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><circle cx="7" cy="6.2" r="2.6" stroke="currentColor" stroke-width="1.5"/><path d="M2.3 16c0-2.8 2.1-4.7 4.7-4.7s4.7 1.9 4.7 4.7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="14.6" cy="6.7" r="2.1" stroke="currentColor" stroke-width="1.4"/><path d="M12.7 11.7c2-.5 3.9.5 5 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    // Suppression définitive (round du 14.09.2026, listes Personnel/
    // Intervenants/Chantiers — cf. .lien-supprimer-def) : icône poubelle,
    // Lionel : « bouton supprimer avec icone rouge suffit ».
    trash: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2.5 4h11M6 4V2.6c0-.4.3-.7.7-.7h2.6c.4 0 .7.3.7.7V4M6.5 7.2v4.6M9.5 7.2v4.6M3.5 4l.6 8.2c0 .7.6 1.3 1.3 1.3h5.2c.7 0 1.3-.6 1.3-1.3L12.5 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    // §83 (round du 16.09.2026, encore un autre, suite×7) — Lionel, mockup
    // mockup-sous-menu-outils.html à l'appui, « toolbar et menu ok » : icônes
    // de la nouvelle barre d'outils façon Sheets (undo/redo, les 4 contrôles
    // masquer/afficher) ET des onglets de navigation (« profites-en pour
    // ajouter les icones dans le menu ») — une icône par sous-groupe plutôt
    // que 4× la même icône œil, pour rester reconnaissable sans survoler.
    undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
    redo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></svg>',
    flag: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M5 2v16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M5 3h9.5l-2.2 3.5L14.5 10H5" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
    note: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M5 2.5h7l3 3v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 2.5v3h3" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M6.5 11h6M6.5 14h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    hardhat: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M3 15h14a1 1 0 0 0 1-1v-.5a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v.5a1 1 0 0 0 1 1z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M4.5 12.5C4.5 8 7.5 5 10 5s5.5 3 5.5 7.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M10 5V3.3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    calendar: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><rect x="2.5" y="4" width="15" height="13" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M2.5 8h15" stroke="currentColor" stroke-width="1.5"/><path d="M6 2.5v3M14 2.5v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    gear: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="2.6" stroke="currentColor" stroke-width="1.5"/><path d="M10 2.5v2M10 15.5v2M17.5 10h-2M4.5 10h-2M15.4 4.6l-1.4 1.4M6 12.6l-1.4 1.4M15.4 15.4l-1.4-1.4M6 7.4 4.6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    building: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M3 17V5.5L9 3v14M9 6h5.5a1 1 0 0 1 1 1v10" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M5.5 7h1.5M5.5 10h1.5M5.5 13h1.5M11.5 9.5h2M11.5 12.5h2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    tag: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M9.4 2.5H4a1 1 0 0 0-1 1v5.4c0 .27.1.52.3.7l7.6 7.6c.4.4 1 .4 1.4 0l5.4-5.4c.4-.4.4-1 0-1.4L10.1 2.8a1 1 0 0 0-.7-.3z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="6.3" cy="6.3" r="1.1" fill="currentColor"/></svg>',
    star: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10 2.5l2.2 4.6 5 .7-3.6 3.6.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.6 5-.7L10 2.5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
    bolt: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M11 2 4 11.5h5L8.5 18 16 8h-5.5L11 2z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round"/></svg>',
    // §85 (round du 17.09.2026) — Lionel, mockup mockup-sous-menu-outils.html
    // à l'appui : « enlever le "+" des lignes personnel et intervenant [...]
    // ajouter une icone "ligne +" [...] ainsi qu'une icone "+" pour rajouter
    // un élément au planning ». ajoutLigne : deux "rangées" (une pleine, une
    // en pointillés = la nouvelle à venir) + un badge "+" — pour rester
    // reconnaissable et différent du "+" générique ci-dessous. plus : simple
    // croix, réservée à l'ajout d'élément (tache/absence/note/jalon).
    // tache/absence : mêmes pictos que le menu "Ajouter" existant sur une
    // case (cf. boutonsMenuAjout) n'a jamais eu d'icône dédiée — nouvelles
    // ici, cohérentes avec le reste (checklist = tâche, calendrier barré =
    // absence).
    ajoutLigne: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><rect x="2.3" y="4.2" width="10.4" height="3.2" rx="1" stroke="currentColor" stroke-width="1.4"/><rect x="2.3" y="9.6" width="10.4" height="3.2" rx="1" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2.2 1.8"/><path d="M15.6 10.4v5.2M13 13h5.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    plus: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M10 3.3v13.4M3.3 10h13.4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    tache: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><rect x="3" y="3" width="14" height="14" rx="2.5" stroke="currentColor" stroke-width="1.5"/><path d="M6.3 10.2l2.1 2.1 4.3-4.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    absence: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none"><rect x="2.5" y="4" width="15" height="13" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M2.5 8h15" stroke="currentColor" stroke-width="1.5"/><path d="M6 2.5v3M14 2.5v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M7.3 11.3l5.4 4.4M12.7 11.3l-5.4 4.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    // §87 (round du 17.09.2026, suite×2) — Lionel, mockup mockup-sous-menu-
    // outils.html à l'appui : « ajouter aujourd'hui/2 semaines/la navigation
    // dans la toolbar [...] les boutons toujours sous forme d'icone ».
    // chevronGauche/chevronDroite : remplacent les "‹"/"›" texte de l'ancien
    // .fleche-semaine, en cohérence avec le reste d'icônes SVG de cette
    // barre. aujourdhui : calendrier + un point (jour marqué), distinct
    // d'ICONS.calendar (utilisé ailleurs sans marquage) et d'ICONS.absence
    // (croix, pas un point). deuxSemaines : 2 colonnes côte à côte, façon
    // "vue partagée" — teinté par .toolbar-btn.actif quand deuxSemaines est
    // vrai (jamais atténué comme .toolbar-toggle.desactive : ce n'est pas un
    // masquage, juste un autre mode d'affichage, toujours valide).
    chevronGauche: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M12.5 4.5 7 10l5.5 5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    chevronDroite: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M7.5 4.5 13 10l-5.5 5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    // Round du 24.09.2026 (suite 7) — barre « ‹ › » de la sélection
    // multiple (Lionel : « des flèches gauche-droite et guillemets gauche,
    // guillemets droite ») : chevron simple = une demi-journée, double =
    // un jour entier.
    chevronDoubleGauche: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M9.5 4.5 4 10l5.5 5.5M15.5 4.5 10 10l5.5 5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    chevronDoubleDroite: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M4.5 4.5 10 10l-5.5 5.5M10.5 4.5 16 10l-5.5 5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    // Pilule de sélection (round du 24.09.2026, suite 8) : crayon (modifier,
    // remplace le double-clic) et copier (2 feuilles).
    pencil: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M3.5 16.5l3.6-.8 8.6-8.6a1.6 1.6 0 0 0 0-2.3l-.5-.5a1.6 1.6 0 0 0-2.3 0L4.3 12.9l-.8 3.6z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M11.8 5.4l2.8 2.8" stroke="currentColor" stroke-width="1.5"/></svg>',
    copy: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><rect x="7" y="7" width="10" height="10" rx="1.8" stroke="currentColor" stroke-width="1.5"/><path d="M13 7V4.8A1.8 1.8 0 0 0 11.2 3H4.8A1.8 1.8 0 0 0 3 4.8v6.4A1.8 1.8 0 0 0 4.8 13H7" stroke="currentColor" stroke-width="1.5"/></svg>',
    aujourdhui: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><rect x="2.5" y="3.5" width="15" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M2.5 7.5h15" stroke="currentColor" stroke-width="1.5"/><path d="M6 2v3M14 2v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="10" cy="12.6" r="2" fill="currentColor"/></svg>',
    deuxSemaines: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><rect x="2" y="4" width="7" height="12" rx="1.3" stroke="currentColor" stroke-width="1.5"/><rect x="11" y="4" width="7" height="12" rx="1.3" stroke="currentColor" stroke-width="1.5"/></svg>',
    // Round du 23.09.2026 (suite 4) — semaineMobile : 5 colonnes fines
    // (5 jours ouvrés), pour le bouton mobile "1 semaine" qui remplace
    // "Afficher 2 semaines" sur téléphone (cf. #groupeVueJourMobile,
    // js/coquille.js) — délibérément distinct de deuxSemaines ci-dessus
    // (2 gros blocs) pour ne pas laisser croire qu'il s'agit du même réglage.
    semaineMobile: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><rect x="0.8" y="4" width="2.4" height="12" rx="1" stroke="currentColor" stroke-width="1.4"/><rect x="4.8" y="4" width="2.4" height="12" rx="1" stroke="currentColor" stroke-width="1.4"/><rect x="8.8" y="4" width="2.4" height="12" rx="1" stroke="currentColor" stroke-width="1.4"/><rect x="12.8" y="4" width="2.4" height="12" rx="1" stroke="currentColor" stroke-width="1.4"/><rect x="16.8" y="4" width="2.4" height="12" rx="1" stroke="currentColor" stroke-width="1.4"/></svg>',
    // Round du 24.09.2026 (suite 15) — choisirJour : calendrier dont la
    // grille des jours est pointillée (vue mois), pour le bouton qui ouvre
    // le calendrier du téléphone (cf. .btn-calendrier, js/coquille.js) —
    // distinct d'aujourdhui juste au-dessus (un seul gros point : ce jour-ci)
    // qu'il côtoie dans la barre.
    choisirJour: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><rect x="2.5" y="3.5" width="15" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M2.5 7.5h15" stroke="currentColor" stroke-width="1.5"/><path d="M6 2v3M14 2v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="6.5" cy="10.8" r="1" fill="currentColor"/><circle cx="10" cy="10.8" r="1" fill="currentColor"/><circle cx="13.5" cy="10.8" r="1" fill="currentColor"/><circle cx="6.5" cy="14.2" r="1" fill="currentColor"/><circle cx="10" cy="14.2" r="1" fill="currentColor"/><circle cx="13.5" cy="14.2" r="1" fill="currentColor"/></svg>',
    // Round du 22.09.2026 (port du mockup mockup-nav-mobile.html validé par
    // Lionel) : icône "⋮" du bouton #btnPlusOutils (barre retaillée pour
    // téléphone, cf. FRONTEND-CHANGELOG.md §91) — 3 points verticaux,
    // symbole standard "plus d'options" repris tel quel du mockup.
    dots: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="4" r="1.6" fill="currentColor"/><circle cx="10" cy="10" r="1.6" fill="currentColor"/><circle cx="10" cy="16" r="1.6" fill="currentColor"/></svg>',
    // Icône du bouton du sélecteur de page en bas d'écran (#switcherBtn) —
    // repère générique "grille de pages", mise à jour dynamiquement (cf.
    // cablerNavigation) avec l'icône de la page réellement active dès le
    // premier clic sur un onglet.
    pages: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><rect x="2.5" y="4" width="15" height="13" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M2.5 8h15" stroke="currentColor" stroke-width="1.5"/><path d="M6 2.5v3M14 2.5v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>'
  };

  var app = document.getElementById("app");
  var progressEl = document.getElementById("progress");
  var toastEl = document.getElementById("toast");
  var toastTimer = null;

  function toast(msg) {
    if (!msg) return;
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 2600);
  }

  /* ============ APPELS SERVEUR ============ */
  // gs(fn, args, onOk, onErr) — wrapper conservé tel quel depuis Index.html V2.
  function gs(fn, args, onOk, onErr) {
    google.script.run
      .withSuccessHandler(onOk)
      .withFailureHandler(onErr || erreurFatale)
      [fn].apply(null, args || []);
  }
  var occupations = 0;
  function occupe(actif) {
    occupations = Math.max(0, occupations + (actif ? 1 : -1));
    progressEl.classList.toggle("on", occupations > 0);
  }
  // Petit wrapper "promesse" pour enchaîner/attendre une suite d'appels gs()
  // sans réécrire la gestion occupe()/erreur à chaque fois (utilisé par le
  // moteur de synchronisation, cf. plus bas).
  function gsP(fn, args) {
    return new Promise(function (resolve, reject) {
      occupe(true);
      gs(fn, args, function (r) { occupe(false); resolve(r); }, function (err) { occupe(false); reject(err); });
    });
  }

  // invoquerFonctionServeur(nom, body) — équivalent gsP() pour les 4 Edge
  // Functions déjà déployées (phase 4, étape 4, cf. MIGRATION-GITHUB-PLAN.md
  // §6bis) : appelle sbClient.functions.invoke(nom, {body}) et renvoie une
  // promesse qui résout avec `data` ou rejette avec une vraie Error, dans
  // les DEUX cas d'échec possibles (vérifié dans le code source de
  // @supabase/functions-js@2.115.0, aucun moyen de tester contre le vrai
  // réseau depuis cet environnement) :
  //  - échec de TRANSPORT (réseau, fonction plantée, 4xx/5xx) : sbClient
  //    attache déjà le JWT de la session active (this.functionsFetch lit le
  //    token au moment de l'appel, cf. SupabaseClient.ts) — pas besoin de le
  //    passer à la main. Un code HTTP non-2xx devient un FunctionsHttpError
  //    dans `error`, PAS un data.ok===false : les 4 fonctions renvoient
  //    TOUJOURS un statut non-2xx sur erreur métier (cf. leur index.ts,
  //    fonction json(body, status)), jamais 200+ok:false en pratique — mais
  //    error.message est le générique "Edge Function returned a non-2xx
  //    status code", pas le vrai message ; on relit le corps JSON
  //    ({ok:false, erreur:"..."}) pour remonter le vrai texte au toast.
  //  - échec MÉTIER renvoyé en 200 (n'arrive avec aucune des 4 fonctions
  //    actuelles, mais le contrat documenté dans le plan l'autorise) :
  //    data.ok === false, géré séparément.
  function invoquerFonctionServeur(nom, body) {
    occupe(true);
    return sbClient.functions.invoke(nom, { body: body }).then(function (res) {
      occupe(false);
      if (res.error) {
        var ctx = res.error.context; // objet Response cloné par functions-js
        if (ctx && typeof ctx.json === "function") {
          return ctx.json().then(
            function (corps) { throw new Error((corps && corps.erreur) || res.error.message); },
            function () { throw new Error(res.error.message || String(res.error)); }
          );
        }
        throw new Error(res.error.message || String(res.error));
      }
      if (res.data && res.data.ok === false) throw new Error(res.data.erreur || "Échec.");
      return res.data;
    }, function (err) { occupe(false); throw err; });
  }

  function afficherChargement(msg) {
    app.innerHTML = '<div class="loading-screen"><div class="spin"></div><div class="msg">' + esc(msg || "Chargement du planning…") + '</div></div>';
  }
  function erreurFatale(err) {
    var texte = (err && err.message) ? err.message : String(err);
    app.innerHTML =
      '<div class="error-screen">' +
      '<div class="mark-err">' + ICONS.close + '</div>' +
      '<h2>Impossible de charger le planning</h2>' +
      '<p>' + esc(texte) + '</p>' +
      '<button class="btn-primary" id="retryBtn" style="padding:9px 16px;border-radius:9px;border:1px solid var(--border);background:var(--accent);color:var(--accent-ink);cursor:pointer;font-weight:600;">Réessayer</button>' +
      '</div>';
    document.getElementById("retryBtn").addEventListener("click", demarrer);
  }

  /* ============ ÉTAT SERVEUR ============ */
  var etat = {
    // [{labG, num, debut, fin}] — plus renvoyé par le serveur depuis la
    // phase 4/étape 2 (chargement) : labG n'est plus qu'une coordonnée
    // CLIENT (le lundi de la semaine, en YYYYMMDD entier), et la liste
    // entière est calculée localement par genererSemaines() — cf. plus bas,
    // section "CHARGEMENT DEPUIS SUPABASE (phase 4, étape 2)".
    semaines: [],
    indexSemaine: -1,
    aujourdhui: "",
    chantiers: [],          // [{nom, couleur, ligne}] — ligne = chantiers.id (Supabase), cf. demarrer()
    chantierParNom: {},
    palette: [],
    statutsServeur: [],     // [{cle, nom, couleur, ordre}]
    formulairesRapidesServeur: [], // [{nom, ordre, champs:[...]}]
    feriesServeur: [],      // [{iso, libelle, categorie}]
    categoriesFeriesServeur: [], // [{id,nom,couleur}] (table `categories_feries`, sql/0005) — [] si absente/vide, cf. catsFeries(), repli sur CATEGORIES_FERIES_DEFAUT
    // Personnes actives (table `personnes`, actif=true), chargées UNE FOIS
    // au bootstrap (demarrer()) et réutilisées par chaque chargement de
    // semaine (chargerSemaineDepuisServeur) — pas de re-requête par semaine.
    personnesActives: [],   // [{id, nom, sous_traitant, ordre}]
    // Lookups id -> valeur affichable, construits au bootstrap à partir de
    // `chantiers`/`statuts` — évitent de renvoyer des id bruts jusque dans
    // la vue (le contrat de chargerSemaine_/construireVueDepuisCache attend
    // des NOMS de chantier et des CLÉS de statut, jamais des id).
    chantiersParId: {},     // {id: nom}
    statutsParId: {},       // {id: cle}
    // Sens inverse (étape 4 du §6bis, migration hors Google) : le SEUL
    // lookup nécessaire pour ça — un chantier a déjà son id via
    // etat.chantierParNom[nom].ligne, cf. plus bas — car les tables
    // `chantiers`/`statuts` telles que rangées ici perdent l'id une fois
    // ramenées à {nom}/{cle} pour l'affichage.
    statutIdParCle: {},     // {cle: id}
    // Semaines déjà chargées, par labG — même cache scopé que V2
    // (FRAICHEUR_MS, invalidation "semaine"/"suivantes"/"tout").
    cache: {},
    cacheTs: {}
  };
  var FRAICHEUR_MS = 90 * 1000;

  function mettreEnCache(data) {
    etat.cache[data.labG] = data;
    etat.cacheTs[data.labG] = Date.now();
  }
  // generationCache : incrémentée à chaque oubli du cache — un préchargement
  // lancé AVANT (cf. prechargerVoisinesJourMobile, grille-rendu.js) et qui
  // répond APRÈS ne doit pas y réinjecter des données d'avant l'écriture qui
  // a justement motivé cet oubli.
  var generationCache = 0;
  function oublierCache(labGDepuis) {
    generationCache++;
    if (labGDepuis == null) { etat.cache = {}; etat.cacheTs = {}; return; }
    Object.keys(etat.cache).forEach(function (k) {
      if (+k >= labGDepuis) { delete etat.cache[k]; delete etat.cacheTs[k]; }
    });
  }

  /* ============ FENÊTRE AFFICHÉE (1 ou 2 semaines) ============ */
  // Round du 24.09.2026 (suite 6) — Lionel : « Sur mobile j'aimerai que les
  // défilement des jours soient plus fluides quand on change de semaine,
  // comme si la page était infinie » (réponse à la question posée avant de
  // coder : téléphone, vue "1 jour" seulement). Jusqu'ici la vue "1 jour"
  // ne chargeait qu'UNE semaine : arrivé au vendredi, il fallait un 2e swipe
  // "contre le bord" (naviguerSemaineDepuisBordJour) qui reconstruisait la
  // grille sur la semaine suivante — un arrêt net, puis un saut.
  // Désormais la vue "1 jour" charge TOUJOURS 2 semaines consécutives (le
  // mode "2 semaines" du desktop, déjà éprouvé par tout le reste du code :
  // gi 0..9, synchronisation, bulles à cheval…) : le lundi suivant est
  // simplement la colonne d'après le vendredi, atteinte par le même geste.
  // etat.indexSemaine garde son sens de "semaine du jour AFFICHÉ" (pilule
  // Sem. N, impression, ‹ ›) ; la fenêtre, elle, commence à
  // debutFenetreMobile — la semaine affichée ou celle d'avant, choisie pour
  // laisser au moins 2 jours d'avance de chaque côté du jour affiché
  // (lundi/mardi -> [semaine d'avant, cette semaine] ; mercredi-vendredi ->
  // [cette semaine, la suivante]). Quand le défilement s'arrête trop près
  // d'un bord, la grille "glisse" d'une semaine sans que le jour affiché ne
  // bouge (cf. recentrerFenetreJourMobile, grille-rendu.js).
  var jourMobileIso = null;       // jour affiché en vue "1 jour" (null : aujourd'hui, sinon lundi)
  var debutFenetreMobile = null;  // index (etat.semaines) de la 1re semaine chargée ; null = à recalculer
  function modeJourMobileActif() {
    return vueJourMobile && typeof window.matchMedia === "function" && window.matchMedia("(max-width: 600px)").matches;
  }
  function jourSemaineIso_(iso) { return (new Date(iso + "T00:00:00").getDay() + 6) % 7; } // 0 = lundi
  // Jour affiché ramené DANS la semaine etat.indexSemaine : même jour de la
  // semaine quand on vient d'en changer (‹ ›, pilule Sem. N), aujourd'hui s'il
  // y tombe, sinon le lundi. Mémorisé dans jourMobileIso.
  function jourMobileCourant() {
    var s = etat.semaines[etat.indexSemaine];
    if (!s) return null;
    if (jourMobileIso && jourMobileIso >= s.debut && jourMobileIso <= s.fin) return jourMobileIso;
    var d;
    if (jourMobileIso) {
      d = new Date(s.debut + "T00:00:00"); d.setDate(d.getDate() + Math.min(4, jourSemaineIso_(jourMobileIso)));
      jourMobileIso = isoDeDate(d);
    } else {
      jourMobileIso = (etat.aujourdhui >= s.debut && etat.aujourdhui <= s.fin && jourSemaineIso_(etat.aujourdhui) < 5) ? etat.aujourdhui : s.debut;
    }
    return jourMobileIso;
  }
  function debutFenetreJourMobile_() {
    var idx = etat.indexSemaine, max = Math.max(0, etat.semaines.length - 2);
    if (debutFenetreMobile != null && (debutFenetreMobile === idx || debutFenetreMobile === idx - 1) && debutFenetreMobile <= max) return debutFenetreMobile;
    var jour = jourMobileCourant();
    debutFenetreMobile = Math.max(0, Math.min(max, (jour && jourSemaineIso_(jour) < 2) ? idx - 1 : idx));
    return debutFenetreMobile;
  }
  function fenetreLabGs() {
    if (modeJourMobileActif()) {
      var d = debutFenetreJourMobile_();
      var lgs = [etat.semaines[d].labG];
      if (etat.semaines[d + 1]) lgs.push(etat.semaines[d + 1].labG);
      return lgs;
    }
    var out = [etat.semaines[etat.indexSemaine].labG];
    if (deuxSemaines && etat.semaines[etat.indexSemaine + 1]) out.push(etat.semaines[etat.indexSemaine + 1].labG);
    return out;
  }
  function fenetreDonnees() { return fenetreLabGs().map(function (lg) { return etat.cache[lg]; }); }
  function fenetrePrete() { return fenetreDonnees().every(Boolean); }

  // S'assure que toutes les semaines de la fenêtre actuellement demandée
  // (1 ou 2, selon deuxSemaines) sont en cache et fraîches, en va-et-vient
  // avec le serveur si besoin, puis appelle cb().
  // Phase 4/étape 2 : gs("apiChargerSemaine", ...) remplacé par un appel
  // direct à chargerSemaineDepuisServeur() (requêtes Supabase par plage de
  // dates, cf. section "CHARGEMENT DEPUIS SUPABASE" plus bas) — même
  // contrat vis-à-vis de l'appelant (résout toujours, jamais de rejet qui
  // remonterait jusqu'ici, cf. .catch ci-dessous).
  function assurerFenetreChargee(cb) {
    var labs = fenetreLabGs();
    var manquantes = labs.filter(function (lg) {
      var ts = etat.cacheTs[lg];
      return !etat.cache[lg] || !ts || (Date.now() - ts) >= FRAICHEUR_MS;
    });
    if (!manquantes.length) { cb(); return; }
    occupe(true);
    Promise.all(manquantes.map(function (lg) {
      return chargerSemaineDepuisServeur(lg).then(function (data) { mettreEnCache(data); },
        function (err) { if (!etat.cache[lg]) toast("Échec du chargement de la semaine : " + (err && err.message ? err.message : err)); });
    })).then(function () { occupe(false); cb(); });
  }

  /* ============ DATES RÉELLES <-> gi (coordonnée d'affichage) ============
     Cf. §1 du spec : gi n'est qu'une coordonnée d'affichage, recalculée à
     chaque chargement de fenêtre — jamais une identité stockée. */
  function isoDeDate(d) {
    var y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
    return y + "-" + (m < 10 ? "0" : "") + m + "-" + (day < 10 ? "0" : "") + day;
  }
  // Affichage suisse/français DD.MM.AAAA d'une date ISO (YYYY-MM-DD) — retour
  // de Lionel du 03.09.2026 : la popup "Aller à…" affichait jusqu'ici les
  // dates ISO brutes reçues du serveur (ex. "2026-09-01"), à changer pour
  // "dd.mm.aaaa".
  function isoAffiche(iso) {
    if (!iso || iso.length !== 10) return iso || "";
    var p = iso.split("-");
    return p[2] + "." + p[1] + "." + p[0];
  }
  function labGDeGi(gi) {
    var labs = fenetreLabGs();
    return estGiWeekend(gi) ? labs[semaineDuGiWeekend(gi)] : labs[Math.floor(gi / 5)];
  }
  function jourIdxDeGi(gi) {
    // 0..4 = lundi..vendredi (comme le backend, cf. apiEnregistrerCellulePersonne
    // historique) ; 6 = samedi, 7 = dimanche (extension §2 du spec — les DEUX
    // routent vers la même colonne fusionnée côté feuille).
    if (estGiWeekend(gi)) return jourWeekendIdx(gi) === 0 ? 6 : 7;
    return gi % 5;
  }
  function isoDeGi(gi) {
    var lab = labGDeGi(gi), data = etat.cache[lab];
    if (!data) return null;
    if (estGiWeekend(gi)) {
      var d0 = new Date(data.isoDates[0] + "T00:00:00");
      d0.setDate(d0.getDate() + 5 + jourWeekendIdx(gi));
      return isoDeDate(d0);
    }
    return data.isoDates[gi % 5];
  }
  // Round D — inverse d'isoDeGi : cherche `iso` dans la fenêtre ACTUELLEMENT
  // affichée (1 ou 2 semaines, cf. fenetreDonnees) et renvoie le `gi`
  // correspondant, ou null si cette date ne s'y trouve pas (cf.
  // cablerCalendrierDate, qui gère alors la navigation vers la bonne
  // semaine avant de rappeler cette fonction). Même découpage gi que
  // labGDeGi/estGiWeekend : jours ouvrés en `si*5+j`, week-end en
  // `1000 + si*2 + (0|1)`, `si` = index de semaine DANS la fenêtre (0 ou 1).
  function giDepuisIso(iso) {
    var donnees = fenetreDonnees();
    for (var si = 0; si < donnees.length; si++) {
      var data = donnees[si];
      if (!data || !data.isoDates) continue;
      for (var j = 0; j < 5; j++) if (data.isoDates[j] === iso) return si * 5 + j;
      if (data.isoDates[0]) {
        var lundi = new Date(data.isoDates[0] + "T00:00:00");
        var sam = new Date(lundi.getTime()); sam.setDate(sam.getDate() + 5);
        var dim = new Date(lundi.getTime()); dim.setDate(dim.getDate() + 6);
        if (isoDeDate(sam) === iso) return 1000 + si * 2;
        if (isoDeDate(dim) === iso) return 1000 + si * 2 + 1;
      }
    }
    return null;
  }
  // Jour ouvré voisin (lun-ven, jamais samedi/dimanche) d'une date ISO, dans
  // le sens `sens` (+1/-1) — utilisé par les flèches ‹ › des dates de
  // formulaire (cablerDatesPlage) pour avancer/reculer exactement comme le
  // fait la grille (gi ne code que les jours ouvrés, cf. jourIdxDeGi).
  // Round du 12.09.2026 : la version précédente de ce commentaire disait
  // cette fonction "sans être plafonnée à la fenêtre chargée" — inexact,
  // corrigé après le retour de Lionel : cf. le commentaire de
  // appliquerDateChoisieFormulaire (appelée juste après par
  // cablerDatesPlage), qui explique pourquoi la fenêtre chargée reste bien
  // une limite réelle (pas seulement d'affichage).
  function isoJourOuvreVoisin(iso, sens) {
    var d = new Date(iso + "T00:00:00");
    do {
      d.setDate(d.getDate() + sens);
    } while (d.getDay() === 0 || d.getDay() === 6);
    return isoDeDate(d);
  }
  // Round du 12.09.2026 — page Jalons : si iso tombe un samedi/dimanche,
  // avance au premier jour ouvré suivant (ex. "aujourd'hui" pour une
  // nouvelle fiche, ouverte un week-end) ; sinon le renvoie tel quel.
  function premierJourOuvreDepuis(iso) {
    var d = new Date(iso + "T00:00:00");
    if (d.getDay() === 0 || d.getDay() === 6) return isoJourOuvreVoisin(iso, 1);
    return iso;
  }
  function libelleJourGi(gi) {
    var lab = labGDeGi(gi), data = etat.cache[lab];
    if (!data) return { jour: "", mois: "" };
    if (estGiWeekend(gi)) {
      var iso = isoDeGi(gi);
      var d = new Date(iso + "T00:00:00");
      return { jour: d.getDate(), mois: MOIS_ABBR[d.getMonth() + 1] };
    }
    return { jour: data.dates[gi % 5], mois: data.mois[gi % 5] };
  }
  var MOIS_ABBR = ["", "jan.", "fév.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  // §89 (round du 17.09.2026, suite×4) — Lionel : « Il manquerait encore
  // l'affichage du mois quelle part, je pense à la case vide à gauche des
  // jours. » Le mois n'était visible NULLE PART dans la grille depuis le
  // §87 : il ne vivait que dans l'ancienne ligne "Semaine N · 14 sept. – 20
  // sept." (coinNav/navSemaine), supprimée ce round-là car redondante avec
  // la nouvelle navigation de la barre d'outils — sauf que cette dernière
  // (la pill "Sem. N ▾") n'affiche PAS les dates/mois tant que son menu
  // déroulant n'est pas ouvert. Les en-têtes de jour, eux, n'ont jamais
  // affiché que jour de semaine + numéro (LUN 09), jamais le mois — sans
  // ambigüité tant qu'une semaine ne chevauche pas un changement de mois,
  // ambigu sinon. Le ou les mois couverts par la fenêtre AFFICHÉE (jours
  // ouvrés + week-ends si affichés) sont donc listés ici, dans l'ordre
  // chronologique, sans doublon ("sept." ou "août – sept." si la fenêtre
  // chevauche un changement de mois) — posés dans la case coin (cf.
  // construireGrille) qui ne portait plus rien depuis le §83.
  function moisAffichesCoin(n) {
    var mois = [];
    function ajouter(gi) {
      var info = libelleJourGi(gi);
      if (info.mois && mois.indexOf(info.mois) === -1) mois.push(info.mois);
    }
    for (var gi = 0; gi < n; gi++) ajouter(gi);
    if (afficherWeekends) {
      var nbSem = n / 5;
      for (var s = 0; s < nbSem; s++) { ajouter(giWeekend(s, 0)); ajouter(giWeekend(s, 1)); }
    }
    return mois.join(" – ");
  }

  // ---- espace "week-end" (conservé tel quel du prototype, cf. §1.6/§4.1
  // du prototype et §8 du spec) : gi >= 1000 = case Samedi/Dimanche, pure
  // coordonnée d'affichage, jamais mélangée aux calculs de plage semaine. ----
  function estGiWeekend(gi) { return gi >= 1000; }
  function giWeekend(semaineIdx, jourIdx) { return 1000 + semaineIdx * 2 + jourIdx; }
  function semaineDuGiWeekend(gi) { return Math.floor((gi - 1000) / 2); }
  function jourWeekendIdx(gi) { return (gi - 1000) % 2; }
  var JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven"];
  var JOURS_WEEKEND = ["Sam", "Dim"];

  /* ============ ÉTAT "VUE" (reconstruit à chaque chargement — cf. plus haut) ============
     Repris tel quel du modèle du prototype V3 : le moteur de rendu/
     interaction ci-dessous continue de lire/muter ces tableaux comme avant.
     Undo/redo (cf. §8 du spec) : ANNULE LA DERNIÈRE ACTION DE CETTE SESSION
     SEULEMENT — ce n'est pas une garantie multi-utilisateur (un autre
     utilisateur a pu modifier la feuille entre-temps). Retiré des actions
     CRUD destructives (personnel/chantier/statut/formulaire), gardé pour les
     actions de grille (tâche/jalon/note/décalage), cf. §8. */
  var PERSONNES = [], CHANTIERS = {}, STATUTS = {}, STATUTS_ORDRE = [], FORMULAIRES_RAPIDES = [];
  // TACHES_PAR_PERSONNE : ancre -> nombre de tâches en cours (cf. point 101
  // de V3-spec-suite.md, apiCompterTachesPersonnes côté serveur). null tant
  // que pas encore chargé. Volontairement PAS dans apiDemarrer (coûteux par
  // nature, cf. WebApp.gs) : chargé une fois à la première ouverture d'une
  // des 2 pages Personnel/Intervenants (chargerCompteursTaches), invalidé et
  // rechargé après tout ajout/suppression (rafraichirApresPersonnel) — une
  // renomination seule ne change aucun compteur, pas besoin d'y toucher.
  var TACHES_PAR_PERSONNE = null;
  var promesseTachesParPersonne = null;
  var DEMIS = ["matin", "aprem"];
  // ---- Mode d'affichage (round du 02.09.2026, rendu seul et unique mode au
  // round du 08.09.2026 suite, §49) ------------------------------------------
  // Demande initiale de Lionel : "2 colonnes par jour ouvrable et réduire à 1
  // ligne par ouvrier" (mode compact, alors optionnel, à côté d'un mode
  // "classique" — 1 colonne = 1 jour, 2 lignes par personne). Au round du
  // 08.09.2026 (suite, §49), après un signalement sur le comportement des
  // bulles tâche/absence en compact ("1 tâche ne peut pas être mise sur 2
  // case, elle s'étend de 1 jour"), Lionel demande explicitement d'abandonner
  // le mode classique : « on reste sur la seule vue compact qui devient la
  // standard ». `modeCompact` reste une CONSTANTE (jamais rebasculée, plus de
  // réglage ni de bouton) uniquement pour ne pas devoir retoucher chaque site
  // qui la lit encore (colsParJour, colonneDemi, colonneEtSpanDemi…) — ces
  // sites restent corrects tels quels, simplement toujours du côté "compact"
  // désormais. Le VRAI code propre au mode classique (le rendu ligne-par-demi-
  // journée, le bouton de bascule, les 2 règles CSS `.bulle-demi` qui ne
  // s'appliquaient qu'à lui) a, lui, été supprimé — cf. FRONTEND-CHANGELOG §49.
  var modeCompact = true;
  // Nombre de colonnes CSS occupées par UN jour ouvré.
  function colsParJour() { return 2; }
  // Chantier par défaut des formulaires (round du 03.09.2026, demande de
  // Lionel : "pouvoir sélectionner un chantier dans la légende pour qu'il
  // soit sélectionné par défaut dans les formulaires"). Cliquer un chantier
  // dans la légende (construireLegende) en fait le choix PRÉ-COCHÉ partout
  // où un formulaire propose un select "Chantier" — sans rien changer aux
  // tâches déjà posées, ni forcer le choix (le champ reste un select normal,
  // modifiable comme avant). Réglage LOCAL à l'appareil (même famille que
  // modeCompact/afficherWeekends ci-dessus) : chacun garde le sien.
  var chantierParDefaut = null;
  try { chantierParDefaut = localStorage.getItem("planning.chantierParDefaut") || null; } catch (e) { chantierParDefaut = null; }
  function memoriserChantierParDefaut() {
    try {
      if (chantierParDefaut) localStorage.setItem("planning.chantierParDefaut", chantierParDefaut);
      else localStorage.removeItem("planning.chantierParDefaut");
    } catch (e) { /* navigation privée, stockage bloqué : le réglage vaut pour la session, sans message d'erreur */ }
  }
  // Un chantier peut avoir été renommé ou supprimé depuis le dernier choix
  // (CHANTIERS est reconstruit à chaque rechargement) : on ne renvoie le nom
  // mémorisé que s'il correspond encore à un chantier réel, jamais une
  // valeur périmée qui ferait planter un select ou pointer sur du vide.
  // Round du 14.09.2026 : CHANTIERS reste construit depuis la liste COMPLÈTE
  // (actifs + désactivés, cf. construireVueDepuisCache) pour que les cases
  // déjà posées d'un chantier désactivé continuent à s'afficher normalement
  // — mais un chantier désactivé ne doit plus rester "chantier par défaut"
  // des formulaires (il a de toute façon disparu de la légende cliquable,
  // cf. construireLegende) : .actif est donc vérifié ici en plus de la
  // simple présence dans la map.
  function chantierParDefautValide() { return (chantierParDefaut && CHANTIERS[chantierParDefaut] && CHANTIERS[chantierParDefaut].actif !== false) ? chantierParDefaut : null; }
  // Repli final des formulaires Armature/Béton/Livraison armature (round du
  // 14.09.2026) quand ni la case ciblée ni la légende n'ont de chantier à
  // proposer : Object.keys(CHANTIERS)[0] (l'ancien repli) pouvait tomber sur
  // un chantier DÉSACTIVÉ (1er de la map par ordre d'insertion, pas
  // forcément actif) — ce petit helper prend le 1er chantier ACTIF à la
  // place, jamais un désactivé comme pré-choix d'une NOUVELLE tâche.
  function premierChantierActif_() {
    var noms = Object.keys(CHANTIERS);
    for (var i = 0; i < noms.length; i++) if (CHANTIERS[noms[i]].actif !== false) return noms[i];
    return noms[0];
  }
  // Chantier déjà présent dans la case ciblée (round du 03.09.2026, signalé
  // par Lionel : "lorsque je pose une tache sur une demi journée, l'autre
  // tâche prend le chantier de la nouvelle créée. il doit etre possible de
  // rentrer des tache sans changer le chantier de l'autre tâche"). À
  // L'ÉPOQUE, une case (personne + demi-journée + jour) ne pouvait porter
  // qu'UN SEUL chantier — cellule à part sur la feuille, partagée de force
  // par toutes les tâches empilées dessous — et ce pré-remplissage était un
  // correctif OBLIGATOIRE : sans lui, valider le formulaire sans toucher au
  // champ changeait silencieusement le chantier de la tâche déjà en place
  // dès la synchronisation. Round du 16.09.2026
  // (sql/0010_taches_chantier_id.sql — Lionel : "plusieurs chantier sur la
  // même case ... actuellement si une tâche est affecté à un chantier, la
  // tâche déjà en place change de chantier") : chantier_id est désormais
  // une colonne DE LA TÂCHE, cette limite structurelle a disparu — poser un
  // chantier différent sur une nouvelle tâche ne touche plus jamais aux
  // tâches déjà en place. Cette fonction reste néanmoins utile comme simple
  // DÉFAUT ergonomique (plutôt que correctif nécessaire) : proposer le même
  // chantier qu'une tâche déjà présente reste un choix probable pour la
  // suivante, avant de retomber sur le chantier de la légende puis le 1er de
  // la liste — mais ce n'est plus qu'une suggestion pré-cochée, jamais
  // modifiable sans risque comme avant ce round. Priorité sur le chantier
  // par défaut de la légende (round du 03.09.2026, §22) : la case déjà
  // occupée reste un signal plus fort que le choix global. null si aucune
  // case ciblée n'a de tâche.
  function chantierExistantDansCase(cibles, giDebut, duree) {
    if (!cibles || !cibles.length) return null;
    var d = Math.max(1, duree || 1);
    for (var i = 0; i < cibles.length; i++) {
      var c = cibles[i];
      for (var g = giDebut; g < giDebut + d; g++) {
        // demisOccupeesTache (§49, définie plus bas mais déclaration de
        // fonction — hissée) : une tâche n'a plus un seul champ `demi` fixe
        // pour toute sa durée, cf. FRONTEND-CHANGELOG.
        var t = TACHES.filter(function (it) {
          if (it.type !== "tache" || !it.chantier || it.personneId !== c.personne) return false;
          var demisG = demisOccupeesTache(it, g);
          return !!demisG && demisG.indexOf(c.demi) !== -1;
        })[0];
        if (t) return t.chantier;
      }
    }
    return null;
  }

  var TACHES = [], JALONS = [], NOTES = [];
  var deuxSemaines = false;
  var afficherWeekends = false;
  // Round du 23.09.2026 (suite 4) — Lionel : « sur la vue mobile ne soit
  // afficher que 1 jours. Un bouton permettrait d'afficher la vue 1 semaine
  // (à la place du 2 semaines qu'on retrouve sur desktop et tablettes) ».
  // vueJourMobile ne prend effet qu'en dessous de 600px (cf. construireGrille,
  // js/grille-rendu.js) — sur desktop/tablette il reste inerte, deuxSemaines/
  // #btnDeuxSemaines gardent leur rôle habituel, inchangés. true par défaut :
  // vue "1 jour" à l'ouverture, comme demandé.
  var vueJourMobile = true;
  // cibleApresRendu pilote le recalage du défilement horizontal juste après
  // un rendu qui doit délibérément l'ignorer (au lieu de restaurer
  // scrollLeftPrecedent, cf. construireGrille) : "aujourdhui" (premier rendu,
  // ou retour en mode "1 jour" via basculerVueJourMobile), "debut" (retour en
  // mode "1 semaine", ou arrivée sur une semaine suivante via
  // naviguerSemaineDepuisBordJour — cf. son commentaire, round du 23.09.2026
  // suite 5, Lionel : « Swipper un vendredi permet de passer au lundi de la
  // semaine suivante ? »), "fin" (arrivée sur une semaine précédente, même
  // fonction — dernier jour affiché plutôt que le premier), ou null (rendu
  // normal, ex. après édition d'une tâche : position de défilement de
  // l'utilisateur préservée comme avant).
  var cibleApresRendu = "aujourdhui";
  var replierSectionPersonnel = false, replierSectionIntervenants = false;
  // §80 (round du 16.09.2026, encore un autre, suite, suite) — Lionel :
  // « avoir la possibilité de masquer jalons et note avec une petite flèche
  // comme le personnel et les intervenants ». Même principe que
  // replierSectionPersonnel/Intervenants ci-dessus, mais pour les 2 lignes
  // Jalons/Notes (cf. leur rendu dans construireGrille) — pas de session
  // partagée, comme les 2 autres : repart à false (déplié) à chaque
  // rechargement de page, jamais persisté.
  var replierJalons = false, replierNotes = false;
  // §85 (round du 17.09.2026) — Lionel, mockup mockup-sous-menu-outils.html à
  // l'appui : « proposer une case de zoom comme sur sheet ». Même repli que
  // les 4 variables juste au-dessus : jamais persisté, repart à 100 à chaque
  // rechargement de page. Cf. cablerPagePlanning (câblage des boutons -/+/
  // paliers) et construireGrille (application réelle via CSS zoom, sur
  // grilleEntete/grilleCorps — jamais sur .entete-planning-figee elle-même,
  // qui reste l'élément sticky non zoomé, cf. son commentaire).
  var niveauZoomPlanning = 100;
  var bullesSelectionnees = {};
  // Round du 24.09.2026 (suite 7) — Lionel : « quand je clique une bulle,
  // elle soit sélectionnée. Mais si j'en clique une autre, la bulle que
  // j'avais cliquée est désélectionnée et la nouvelle est sélectionnée.
  // Pour faire une sélection multiple, j'aimerais un petit bouton dans la
  // toolbar ». Puis (suite 9) : « enlever le bouton de la barre et activer
  // le mode multiple en laissant le clic appuyé sur desktop et mobile. en
  // résumé: simple appui = sélection simple, appui long = sélection
  // multiple ». modeSelectionMultiple : allumé par un APPUI LONG sur une
  // bulle (DELAI_APPUI_LONG, cf. onPointerDownGroupeSelection), par Ctrl/
  // Cmd+clic sur ordinateur, ou par une sélection par zone ; chaque clic
  // AJOUTE/RETIRE alors la bulle, et la pilule de sélection (#panneauSelection,
  // en bas de l'écran) montre les flèches « ‹ › » (decalerSelection,
  // formulaires-communs.js). Éteint dès que la sélection est vidée
  // (quitterModeSelection). Inactif : un clic remplace la sélection.
  var modeSelectionMultiple = false;
  // copieSelectionActive (suite 9) — Lionel : « le bouton copier copie les
  // éléments avant le déplacement, il faudrait que ce bouton serve de choix
  // pour que la/les bulles soient déplacées ou copiées ». Bouton ⧉ de la
  // pilule : allumé, le PROCHAIN déplacement de la sélection (flèches ou
  // glisser, souris comme doigt) pose des copies et laisse les originaux —
  // l'équivalent de Maj+glisser, sans clavier. Se remet à zéro une fois la
  // copie faite, ou quand la sélection est vidée.
  var copieSelectionActive = false;
  var pressePapier = [];
  var pileUndo = [], pileRedo = [];
  var LIMITE_UNDO = 50;
  var popFermerActuel = null, popValiderActuel = null;
  var DELAI_SELECTION = 300, SEUIL_DEFILEMENT = 10;
  // DELAI_APPUI_LONG (round du 24.09.2026, suite 9) : durée d'appui sans
  // bouger au-delà de laquelle le relâchement vaut "sélection multiple"
  // plutôt qu'un simple clic (cf. onPointerDownGroupeSelection). Plus long
  // que DELAI_SELECTION (300ms, qui arme le glisser tactile) : un glisser
  // tactile commencé après 300ms mais avant 450ms reste un glisser.
  var DELAI_APPUI_LONG = 450;
  var PALETTE_STATUTS = ["#e2e6ea", "#dbe6f7", "#cdf1ea", "#f6dcd7", "#f7e6ab", "#d7cdf0", "#f8c8b5", "#cdeccb"];

  // Comparaison en chaîne partout : dataset.* (DOM) est toujours une chaîne,
  // alors que l'ancre serveur est un nombre — plutôt que de convertir à
  // chaque site d'appel (risque d'oubli), personneId est TOUJOURS une chaîne
  // ("id" = String(ancre)) dans le modèle local ; seuls les appels serveur
  // reconvertissent explicitement en nombre (cf. +ancreDe(p)).
  function personneParAncre(ancre) {
    ancre = String(ancre);
    for (var i = 0; i < PERSONNES.length; i++) if (PERSONNES[i].id === ancre) return PERSONNES[i];
    return null;
  }
  function ancreDe(personneId) { return +personneId; }

