"use strict";
  /* ============================================================
     MODE HORS LIGNE — round du 25.09.2026 (suite 52)
     ------------------------------------------------------------
     Proposition 13 retenue par Lionel (« 8,9,10,13,14,15 m'intéressent ») :
     « Mode hors ligne : consulter le planning et noter des changements
     sans réseau, puis les envoyer quand la connexion revient. Utile sur
     chantier en zone blanche. »

     3 étages :
     1. L'appli elle-même (HTML, CSS, JS, supabase-js) s'ouvre sans réseau :
        service worker sw.js (enregistré plus bas).
     2. LECTURES : chaque lecture réussie de la base (requête GET vers
        Supabase, adresse complète = clé) est gardée sur l'appareil
        (IndexedDB « planning-hors-ligne », magasin `lectures`). Sans réseau,
        la même lecture est servie depuis cette copie : le planning des
        semaines déjà vues s'affiche. Les 4 semaines qui suivent sont
        préchargées en arrière-plan à l'ouverture (prechargerHorsLigne,
        donnees-sync.js).
     3. CHANGEMENTS : sans réseau, les écritures du PLANNING (la grille :
        case d'une personne, notes, jalons — ce que fait synchroniser(),
        donnees-sync.js) sont mises en file d'attente (magasin `envois`)
        au lieu d'échouer, et appliquées aussi aux copies des lectures :
        la grille les montre tout de suite, et encore après un changement
        de semaine. Dès que le réseau revient (événement « online », puis
        toutes les 15 s tant qu'il reste quelque chose), la file part dans
        l'ordre, puis le planning est relu.
        Les autres écritures (pages Personnel, Chantiers, Statuts…,
        séries) demandent le réseau : message « Hors ligne : … ».

     Conflits : une case de personne s'écrit en entier (remplacer_case_
     personne). Avant d'envoyer une case modifiée hors ligne, elle est
     relue sur le serveur : si quelqu'un d'autre l'a changée pendant la
     coupure, elle n'est PAS écrasée ; le changement est listé à Lionel
     (« Changements non envoyés ») pour qu'il le refasse s'il le faut.
     Notes et jalons n'ont pas ce risque : enregistrer-plage ne retire que
     l'entrée d'origine et ajoute la nouvelle (planPlage, relancée côté
     serveur sur l'état du moment).

     Pastille #etatHorsLigne (en bas à gauche) : « Hors ligne », nombre de
     changements en attente, « Envoi… ».
     ============================================================ */

  var HL_ = {
    horsLigne: false,       // dernière requête vers Supabase partie en échec réseau
    enAttente: 0,           // taille de la file `envois`
    envoiEnCours: false,
    idTemp: -1,             // ids provisoires (négatifs) des lignes créées hors ligne
    delaiLectureMs: 10000   // au-delà, une lecture sans réponse est servie depuis la copie
  };

  /* ---------- IndexedDB : 2 magasins, lectures (clé url) et envois (file) ---------- */
  var hlBase_ = null;
  function hlBase() {
    if (hlBase_) return hlBase_;
    hlBase_ = new Promise(function (ok) {
      try {
        var req = indexedDB.open("planning-hors-ligne", 1);
        req.onupgradeneeded = function () {
          var bd = req.result;
          if (!bd.objectStoreNames.contains("lectures")) bd.createObjectStore("lectures", { keyPath: "url" });
          if (!bd.objectStoreNames.contains("envois")) bd.createObjectStore("envois", { keyPath: "n", autoIncrement: true });
        };
        req.onsuccess = function () { ok(req.result); };
        req.onerror = function () { ok(null); };
      } catch (e) { ok(null); }
    });
    return hlBase_;
  }
  function hlMagasin_(nom, mode, action) {
    return hlBase().then(function (bd) {
      if (!bd) return null;
      return new Promise(function (ok) {
        try {
          var tx = bd.transaction(nom, mode), st = tx.objectStore(nom), res = null;
          var req = action(st);
          if (req) req.onsuccess = function () { res = req.result; };
          tx.oncomplete = function () { ok(res); };
          tx.onerror = tx.onabort = function () { ok(null); };
        } catch (e) { ok(null); }
      });
    });
  }
  function hlLire(nom, cle) { return hlMagasin_(nom, "readonly", function (st) { return st.get(cle); }); }
  function hlEcrire(nom, valeur) { return hlMagasin_(nom, "readwrite", function (st) { return st.put(valeur); }); }
  function hlSupprimer(nom, cle) { return hlMagasin_(nom, "readwrite", function (st) { return st.delete(cle); }); }
  function hlTout(nom) { return hlMagasin_(nom, "readonly", function (st) { return st.getAll(); }).then(function (l) { return l || []; }); }

  /* ---------- Filtres PostgREST (?date=gte.X&personne_id=in.(1,2)…) ---------- */
  var HL_PARAMS_NEUTRES_ = { select: 1, order: 1, limit: 1, offset: 1, columns: 1, on_conflict: 1 };
  // { table, filtres: [{col, op, val}], complet } — complet = false si un
  // filtre n'est pas compris (or=, like…) : la lecture n'est alors ni
  // modifiée ni utilisée pour un calcul hors ligne.
  function hlAnalyserUrl(url) {
    var u = new URL(url, location.href);
    var m = u.pathname.match(/\/rest\/v1\/([^/]+)$/);
    var res = { table: m ? decodeURIComponent(m[1]) : null, filtres: [], complet: !!m };
    u.searchParams.forEach(function (v, k) {
      if (HL_PARAMS_NEUTRES_[k]) return;
      var mm = v.match(/^(eq|neq|gt|gte|lt|lte|in|is)\.(.*)$/);
      if (!mm) { res.complet = false; return; }
      var val = mm[2];
      if (mm[1] === "in") val = val.replace(/^\(|\)$/g, "").split(",").map(function (x) { return x.replace(/^"|"$/g, ""); });
      res.filtres.push({ col: k, op: mm[1], val: val });
    });
    return res;
  }
  function hlComparer_(a, b) {
    var na = Number(a), nb = Number(b);
    if (a !== "" && b !== "" && !isNaN(na) && !isNaN(nb) && typeof a !== "boolean") return na < nb ? -1 : na > nb ? 1 : 0;
    a = String(a); b = String(b);
    return a < b ? -1 : a > b ? 1 : 0;
  }
  function hlFiltreOk_(f, v) {
    if (f.op === "is") return f.val === "null" ? v == null : String(v) === f.val;
    if (v == null) return false;
    if (f.op === "in") return f.val.some(function (x) { return String(v) === x; });
    var c = hlComparer_(v, f.val);
    return f.op === "eq" ? c === 0 : f.op === "neq" ? c !== 0 : f.op === "gt" ? c > 0 : f.op === "gte" ? c >= 0 : f.op === "lt" ? c < 0 : c <= 0;
  }
  // La ligne `row` fait-elle partie de ce que la lecture `a` a demandé ?
  // Les colonnes absentes de `row` ne sont pas vérifiées (cf. hlCouvre).
  function hlLigneDansLecture(a, row) {
    return a.filtres.every(function (f) { return !(f.col in row) || hlFiltreOk_(f, row[f.col]); });
  }
  // La lecture `a` contient-elle TOUTES les lignes de `table` pour ces
  // valeurs (ex. {date, personne_id}) ? Oui si elle est complète et ne
  // filtre que sur ces colonnes-là.
  function hlCouvre(a, table, valeurs) {
    if (!a.complet || a.table !== table) return false;
    return a.filtres.every(function (f) { return (f.col in valeurs) && hlFiltreOk_(f, valeurs[f.col]); });
  }

  /* ---------- Lectures ---------- */
  function hlReponseCopie_(copie) {
    var entetes = new Headers(copie.entetes || {});
    entetes.set("X-Hors-Ligne", "1");
    return new Response(copie.methode === "HEAD" ? null : copie.corps, { status: copie.statut || 200, headers: entetes });
  }
  function hlLecture_(url, methode, entree, options, suivant) {
    var cle = methode === "HEAD" ? "HEAD " + url : url;
    var servie = false;
    var reseau = suivant(entree, options).then(function (rep) {
      hlRetourEnLigne_();
      if (rep.ok) {
        var entetes = {};
        ["content-type", "content-range"].forEach(function (h) { var v = rep.headers.get(h); if (v) entetes[h] = v; });
        rep.clone().text().then(function (corps) {
          hlEcrire("lectures", { url: cle, methode: methode, statut: rep.status, entetes: entetes, corps: corps, ts: Date.now() });
        });
      }
      return rep;
    });
    return new Promise(function (ok, ko) {
      // Réseau très lent (zone blanche avec un reste de signal) : la copie
      // est servie au bout de delaiLectureMs ; la vraie réponse, si elle
      // arrive, met la copie à jour pour la prochaine fois.
      var minuteur = setTimeout(function () {
        hlLire("lectures", cle).then(function (copie) {
          if (copie && !servie) { servie = true; hlPasseHorsLigne_(); ok(hlReponseCopie_(copie)); }
        });
      }, HL_.delaiLectureMs);
      reseau.then(function (rep) { clearTimeout(minuteur); if (!servie) { servie = true; ok(rep); } }, function (err) {
        clearTimeout(minuteur);
        if (servie) return;
        if (!hlErreurReseau(err)) { servie = true; ko(err); return; }
        hlPasseHorsLigne_();
        hlLire("lectures", cle).then(function (copie) {
          if (servie) return;
          servie = true;
          if (copie) ok(hlReponseCopie_(copie));
          else ko(new TypeError("Hors ligne : cette partie du planning n’est pas encore en mémoire sur cet appareil."));
        });
      });
    });
  }
  function hlErreurReseau(err) {
    return !!err && (err.name === "TypeError" || /fetch|network|réseau|Load failed/i.test(err.message || ""));
  }

  /* ---------- Changements : lesquels peuvent attendre ---------- */
  // "case" : remplacer_case_personne ; "plage" : enregistrer-plage (notes,
  // jalons) ; "serie" : reposerSerie_ (PATCH … serie_id=is.null). Le reste
  // n'attend pas.
  function hlTypeEnvoi(url, methode) {
    if (methode === "POST" && /\/rest\/v1\/rpc\/remplacer_case_personne(\?|$)/.test(url)) return "case";
    if (methode === "POST" && /\/functions\/v1\/enregistrer-plage(\?|$)/.test(url)) return "plage";
    if (methode === "PATCH" && /\/rest\/v1\/(taches|jalons|notes)\?/.test(url) && /[?&]serie_id=is\.null(&|$)/.test(url)) return "serie";
    return null;
  }
  function hlEntetesSansJeton_(options) {
    var h = new Headers((options && options.headers) || {}), out = {};
    h.forEach(function (v, k) { if (k.toLowerCase() !== "authorization") out[k] = v; });
    return out;
  }
  function hlReponseSimulee_(type) {
    if (type === "plage") return new Response(JSON.stringify({ ok: true, horsLigne: true }), { status: 200, headers: { "Content-Type": "application/json", "X-Hors-Ligne": "1" } });
    return new Response(null, { status: 204, headers: { "X-Hors-Ligne": "1" } });
  }

  // Lignes des copies de `table` (dédoublonnées par id) pour ces valeurs,
  // ou null si aucune copie ne les couvre toutes.
  function hlLignesCouvertes_(lectures, table, valeursListe) {
    var trouvees = {}, ok = true;
    valeursListe.forEach(function (valeurs) {
      var a = lectures.filter(function (l) { return hlCouvre(hlAnalyserUrl(l.url), table, valeurs); })
        .sort(function (x, y) { return y.ts - x.ts; })[0];
      if (!a) { ok = false; return; }
      JSON.parse(a.corps || "[]").forEach(function (r) {
        if (Object.keys(valeurs).every(function (c) { return String(r[c]) === String(valeurs[c]); })) trouvees[r.id] = r;
      });
    });
    return ok ? Object.keys(trouvees).map(function (id) { return trouvees[id]; }) : null;
  }
  // Applique des opérations à toutes les copies de `table` concernées :
  // [{type:"delete", ou:(row)=>bool} | {type:"update", ou, champs} | {type:"insert", ligne}]
  function hlAppliquerAuxCopies_(lectures, table, ops) {
    return Promise.all(lectures.map(function (l) {
      var a = hlAnalyserUrl(l.url);
      if (!a.complet || a.table !== table || l.methode === "HEAD") return null;
      var lignes;
      try { lignes = JSON.parse(l.corps || "[]"); } catch (e) { return null; }
      if (!Array.isArray(lignes)) return null;
      var change = false;
      ops.forEach(function (op) {
        if (op.type === "delete") {
          var avant = lignes.length;
          lignes = lignes.filter(function (r) { return !op.ou(r); });
          change = change || lignes.length !== avant;
        } else if (op.type === "update") {
          lignes.forEach(function (r) { if (op.ou(r)) { Object.assign(r, op.champs); change = true; } });
        } else if (op.type === "insert" && hlLigneDansLecture(a, op.ligne)) {
          lignes.push(Object.assign({}, op.ligne)); change = true;
        }
      });
      if (!change) return null;
      l.corps = JSON.stringify(lignes);
      return hlEcrire("lectures", l);
    }));
  }

  var hlLogiquePlage_ = null;
  function hlPlanPlage_() {
    if (!hlLogiquePlage_) hlLogiquePlage_ = import("../functions/enregistrer-plage/logic.js").then(function (m) { return m.planPlage; }, function () { hlLogiquePlage_ = null; return null; });
    return hlLogiquePlage_;
  }
  function hlJoursOuvres_(d1, d2) {
    var out = [], d = new Date(d1 + "T00:00:00Z"), fin = new Date(d2 + "T00:00:00Z");
    for (; d <= fin; d.setUTCDate(d.getUTCDate() + 1)) if (d.getUTCDay() % 6) out.push(d.toISOString().slice(0, 10));
    return out;
  }

  // Met le changement en file et l'applique aux copies ; rejette (comme
  // une erreur réseau) s'il ne peut pas être fait hors ligne.
  function hlMettreEnFile_(type, url, methode, options) {
    var corps = options && typeof options.body === "string" ? options.body : null;
    var args = null;
    try { args = corps ? JSON.parse(corps) : null; } catch (e) { args = null; }
    var refus = function (pourquoi) { return Promise.reject(new TypeError("Hors ligne : " + pourquoi)); };
    return hlTout("lectures").then(function (lectures) {
      var envoi = { type: type, url: url, methode: methode, corps: corps, entetes: hlEntetesSansJeton_(options), ts: Date.now() };
      if (type === "case") {
        if (!args) return refus("changement illisible.");
        var cle = { personne_id: args.p_personne_id, date: args.p_date, demi: args.p_demi };
        var avant = hlLignesCouvertes_(lectures, "taches", [cle]);
        if (!avant) return refus("cette semaine n’est pas en mémoire sur cet appareil.");
        envoi.avant = hlResumeCase_(avant);
        envoi.libelle = hlLibelleCase_(args);
        var ou = function (r) { return String(r.personne_id) === String(cle.personne_id) && r.date === cle.date && r.demi === cle.demi; };
        var ops = [{ type: "delete", ou: ou }].concat((args.p_lignes || []).map(function (l, i) {
          return { type: "insert", ligne: { id: HL_.idTemp--, personne_id: cle.personne_id, date: cle.date, demi: cle.demi, ordre: i, texte: l.texte, statut_id: l.statut_id || null,
            important: !!l.important, serie_id: l.serie_id || null, est_absence: !!l.est_absence, chantier_id: l.chantier_id != null ? l.chantier_id : null } };
        }));
        return Promise.all([hlAppliquerAuxCopies_(lectures, "taches", ops), hlAppliquerAuxCopies_(lectures, "assignations", [{ type: "delete", ou: ou }])])
          .then(function () { return envoi; });
      }
      if (type === "plage") {
        if (!args) return refus("changement illisible.");
        var table = args.kind === "jalon" ? "jalons" : "notes";
        var bornes = [args.dateDebut, args.dateFin].concat(args.origine ? [args.origine.dateDebut, args.origine.dateFin] : []).filter(Boolean).sort();
        if (!bornes.length) return refus("dates manquantes.");
        var existantes = hlLignesCouvertes_(lectures, table, hlJoursOuvres_(bornes[0], bornes[bornes.length - 1]).map(function (iso) { return { date: iso }; }));
        if (!existantes) return refus("cette semaine n’est pas en mémoire sur cet appareil.");
        return hlPlanPlage_().then(function (planPlage) {
          if (!planPlage) return refus("notes et jalons ne peuvent pas être modifiés sans réseau sur cet appareil.");
          var plan = planPlage(args, existantes.map(function (r) { return Object.assign({}, r); }));
          var ops = plan.ops.map(function (op) {
            var champs = Object.assign({}, op); delete champs.type; delete champs.table; delete champs.id;
            if (op.type === "delete") return { type: "delete", ou: function (r) { return r.id === op.id; } };
            if (op.type === "update") return { type: "update", ou: function (r) { return r.id === op.id; }, champs: champs };
            return { type: "insert", ligne: Object.assign({ id: HL_.idTemp--, serie_id: null }, champs) };
          });
          envoi.libelle = (args.kind === "jalon" ? "Jalon" : "Note") + " « " + (args.texte || (args.origine && args.origine.texte) || "") + " »";
          return hlAppliquerAuxCopies_(lectures, table, ops).then(function () { return envoi; });
        });
      }
      // "serie" : les lignes visées reçoivent leur serie_id.
      var a = hlAnalyserUrl(url);
      return hlAppliquerAuxCopies_(lectures, a.table, [{ type: "update", ou: function (r) { return hlLigneDansLecture(a, r); }, champs: args || {} }])
        .then(function () { envoi.libelle = "Série"; return envoi; });
    }).then(function (envoi) {
      return hlEcrire("envois", envoi).then(function () {
        HL_.enAttente++;
        hlMajIndicateur();
        return hlReponseSimulee_(type);
      });
    });
  }
  function hlResumeCase_(lignes) {
    return lignes.slice().sort(function (a, b) { return (a.ordre || 0) - (b.ordre || 0); }).map(function (r) {
      return [r.texte || "", r.statut_id || null, !!r.important, r.serie_id || null, !!r.est_absence, r.chantier_id || null];
    });
  }
  function hlLibelleCase_(args) {
    var p = typeof personneParAncre === "function" ? personneParAncre(args.p_personne_id) : null;
    var textes = (args.p_lignes || []).map(function (l) { return l.texte; }).filter(Boolean).join(", ");
    var quand = (typeof libelleDateCourteIso === "function" ? libelleDateCourteIso(args.p_date) : args.p_date) + (args.p_demi === "matin" ? " matin" : " après-midi");
    return (p ? p.nom : "Case") + ", " + quand + " : " + (textes || "case vidée");
  }

  /* ---------- Point d'entrée : fetch de supabase-js (cf. js/core.js) ---------- */
  function fetchHorsLigne(entree, options, suivant) {
    var url = typeof entree === "string" ? entree : (entree && entree.url) || String(entree);
    var methode = String((options && options.method) || (entree && entree.method) || "GET").toUpperCase();
    if (/\/auth\/v1\/token\?grant_type=refresh_token/.test(url)) return hlRenouvellement_(entree, options, suivant);
    if (!/\/(rest|functions)\/v1\//.test(url)) return suivant(entree, options);
    if (methode === "GET" || methode === "HEAD") return hlLecture_(url, methode, entree, options, suivant);
    var type = hlTypeEnvoi(url, methode);
    // File non vide : un nouveau changement de la grille passe derrière
    // (l'ordre compte : 2 changements de la même case).
    if (type && HL_.enAttente > 0) return hlMettreEnFile_(type, url, methode, options);
    return suivant(entree, options).then(function (rep) { hlRetourEnLigne_(); return rep; }, function (err) {
      if (!hlErreurReseau(err)) throw err;
      hlPasseHorsLigne_();
      if (!type) throw new TypeError("Hors ligne : ce changement demande une connexion internet.");
      return hlMettreEnFile_(type, url, methode, options);
    });
  }

  /* ---------- Session sans réseau ----------
     Le jeton de connexion vit 1 h ; supabase-js le renouvelle tout seul
     (/auth/v1/token). Sans réseau, ce renouvellement échoue et supabase-js
     le retente pendant ~30 s, en bloquant TOUTES les requêtes (même celles
     servies depuis la copie) et le démarrage de l'appli — ouverte le matin
     sur un chantier sans réseau, elle restait sur « Vérification de la
     connexion… ». Ici, sur échec réseau (ou sans réponse en 10 s), la
     réponse est fabriquée depuis la session gardée sur l'appareil : même
     jeton (expiré, mais il ne sert qu'aux copies), valable 5 min pour
     supabase-js, qui retentera donc un vrai renouvellement 5 min plus tard.
     Ce jeton « provisoire » est noté ; dès que le réseau revient, un vrai
     renouvellement est demandé avant tout envoi ou démarrage
     (hlRenouvelerSiProvisoire). Un refus du serveur (session révoquée)
     n'est pas une coupure : il passe tel quel. */
  var HL_CLE_PROVISOIRE_ = "planning-hl-jeton-provisoire";
  function hlSessionGardee_(refreshToken) {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!/^sb-.*-auth-token$/.test(k)) continue;
        var s = JSON.parse(localStorage.getItem(k) || "null");
        if (s && s.access_token && s.refresh_token === refreshToken) return s;
      }
    } catch (e) { /* stockage inaccessible */ }
    return null;
  }
  function hlRenouvellement_(entree, options, suivant) {
    var demande = null;
    try { demande = JSON.parse(options && options.body || "null"); } catch (e) { /* corps illisible */ }
    return new Promise(function (ok, ko) {
      var fini = false;
      var provisoire = function (err) {
        if (fini) return;
        var s = demande && hlSessionGardee_(demande.refresh_token);
        if (!s) { if (err) { fini = true; ko(err); } return; }
        fini = true;
        try { localStorage.setItem(HL_CLE_PROVISOIRE_, s.access_token); } catch (e) { /* tant pis */ }
        hlPasseHorsLigne_();
        ok(new Response(JSON.stringify(Object.assign({}, s, { expires_in: 300, expires_at: Math.floor(Date.now() / 1000) + 300 })),
          { status: 200, headers: { "Content-Type": "application/json" } }));
      };
      var minuteur = setTimeout(function () { provisoire(null); }, HL_.delaiLectureMs);
      suivant(entree, options).then(function (rep) { clearTimeout(minuteur); if (!fini) { fini = true; ok(rep); } }, function (err) {
        clearTimeout(minuteur);
        if (hlErreurReseau(err)) provisoire(err);
        else if (!fini) { fini = true; ko(err); }
      });
    });
  }
  function hlRenouvelerSiProvisoire() {
    var jeton = null;
    try { jeton = localStorage.getItem(HL_CLE_PROVISOIRE_); } catch (e) { /* stockage inaccessible */ }
    if (!jeton || typeof sbClient === "undefined" || navigator.onLine === false) return Promise.resolve();
    var fini = function (r) {
      var s = r && r.data && r.data.session;
      if (s && s.access_token !== jeton) { try { localStorage.removeItem(HL_CLE_PROVISOIRE_); } catch (e) { /* tant pis */ } return true; }
      return false;
    };
    return Promise.resolve(sbClient.auth.getSession()).then(function (r) {
      if (fini(r)) return;
      return Promise.resolve(sbClient.auth.refreshSession()).then(fini);
    }).catch(function () {});
  }

  /* ---------- Envoi de la file quand le réseau revient ---------- */
  function hlJeton_() {
    if (typeof sbClient === "undefined" || !sbClient.auth) return Promise.resolve(null);
    return Promise.resolve(sbClient.auth.getSession()).then(function (r) { return r && r.data && r.data.session ? r.data.session.access_token : null; }, function () { return null; });
  }
  function hlEnvoyerFile() {
    if (HL_.envoiEnCours) return Promise.resolve();
    HL_.envoiEnCours = true;
    var envoyes = 0, refuses = [], arret = null;
    hlMajIndicateur();
    return hlRenouvelerSiProvisoire().then(function () { return Promise.all([hlTout("envois"), hlJeton_()]); }).then(function (r) {
      var file = r[0].sort(function (a, b) { return a.n - b.n; }), jeton = r[1];
      HL_.enAttente = file.length;
      if (!file.length) return;
      if (!jeton) { arret = "session"; return; }
      var chaine = Promise.resolve();
      file.forEach(function (e) {
        chaine = chaine.then(function () {
          if (arret) return;
          var entetes = Object.assign({}, e.entetes, { Authorization: "Bearer " + jeton });
          var verif = e.type === "case" ? hlCaseInchangee_(e, entetes) : Promise.resolve(true);
          return verif.then(function (inchangee) {
            if (!inchangee) { refuses.push(e.libelle + " — modifiée entre-temps par quelqu’un d’autre"); return; }
            return window.fetch(e.url, { method: e.methode, headers: entetes, body: e.corps }).then(function (rep) {
              if (rep.ok) { envoyes++; return; }
              return rep.text().then(function (t) { refuses.push(e.libelle + " — refusée par le serveur (" + (t || rep.status).toString().slice(0, 120) + ")"); });
            });
          }).then(function () {
            return hlSupprimer("envois", e.n).then(function () { HL_.enAttente = Math.max(0, HL_.enAttente - 1); hlMajIndicateur(); });
          }, function (err) {
            // Réseau de nouveau coupé : on s'arrête là, le reste repartira.
            arret = hlErreurReseau(err) ? "reseau" : "erreur";
          });
        });
      });
      return chaine;
    }).then(function () {
      HL_.envoiEnCours = false;
      if (arret === "reseau") hlPasseHorsLigne_();
      else if (!arret) HL_.horsLigne = false;
      hlMajIndicateur();
      if (envoyes || refuses.length) hlApresEnvoi_(envoyes, refuses);
      // Changements faits pendant l'envoi (mis derrière dans la file) : à la suite.
      if (!arret && HL_.enAttente > 0) setTimeout(hlEnvoyerFile, 0);
    }, function () { HL_.envoiEnCours = false; hlMajIndicateur(); });
  }
  // La case est-elle encore, sur le serveur, celle qu'on avait avant de la
  // changer hors ligne ?
  function hlCaseInchangee_(e, entetes) {
    var a = JSON.parse(e.corps);
    var base = e.url.replace(/\/rpc\/remplacer_case_personne.*$/, "/taches");
    var q = base + "?select=texte,statut_id,important,serie_id,est_absence,chantier_id,ordre&personne_id=eq." + encodeURIComponent(a.p_personne_id) +
      "&date=eq." + encodeURIComponent(a.p_date) + "&demi=eq." + encodeURIComponent(a.p_demi) + "&order=ordre.asc";
    return window.fetch(q, { headers: entetes }).then(function (rep) {
      if (!rep.ok) return true; // relecture impossible : on écrit comme avant ce round
      return rep.json().then(function (lignes) { return JSON.stringify(hlResumeCase_(lignes)) === JSON.stringify(e.avant); });
    });
  }
  function hlApresEnvoi_(envoyes, refuses) {
    if (envoyes) toast(envoyes + " changement" + (envoyes > 1 ? "s" : "") + " fait" + (envoyes > 1 ? "s" : "") + " hors ligne envoyé" + (envoyes > 1 ? "s" : "") + ".");
    if (refuses.length) hlMontrerRefus_(refuses);
    // Planning relu depuis le serveur (ids définitifs, changements des autres).
    if (typeof oublierCache === "function" && typeof assurerFenetreChargee === "function" && typeof racineEl !== "undefined" && racineEl) {
      var relire = function () {
        if ((typeof syncEnCours !== "undefined" && syncEnCours) || (typeof popFermerActuel !== "undefined" && popFermerActuel)) { setTimeout(relire, 1000); return; }
        oublierCache();
        assurerFenetreChargee(function () { construireVueDepuisCache(); render(false); });
      };
      differerSiEnGlissement(relire);
    }
  }
  function hlMontrerRefus_(refuses) {
    var voile = document.createElement("div");
    voile.className = "voile-confirm";
    var pop = document.createElement("div");
    pop.className = "pop confirm-pop pop-refus-hors-ligne";
    pop.innerHTML = '<div class="cp-titre">Changements non envoyés</div>' +
      '<p class="confirm-texte">Ces changements faits hors ligne n’ont pas été envoyés. À refaire si besoin :</p>' +
      '<ul class="liste-refus">' + refuses.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>" +
      '<div class="confirm-boutons"><button type="button" class="c-ok">Compris</button></div>';
    document.body.appendChild(voile);
    document.body.appendChild(pop);
    pop.querySelector(".c-ok").addEventListener("click", function () { voile.remove(); pop.remove(); });
  }

  /* ---------- État et pastille ---------- */
  function hlPasseHorsLigne_() { if (!HL_.horsLigne) { HL_.horsLigne = true; hlMajIndicateur(); } }
  function hlRetourEnLigne_() {
    var etait = HL_.horsLigne;
    HL_.horsLigne = false;
    if (etait) hlRenouvelerSiProvisoire();
    if (HL_.enAttente > 0 && !HL_.envoiEnCours) setTimeout(hlEnvoyerFile, 0);
    else if (etait) hlMajIndicateur();
  }
  function hlMajIndicateur() {
    var el = document.getElementById("etatHorsLigne");
    if (!el) {
      if (!document.body) return;
      el = document.createElement("div");
      el.id = "etatHorsLigne";
      el.className = "etat-hors-ligne";
      el.setAttribute("role", "status");
      document.body.appendChild(el);
    }
    var n = HL_.enAttente;
    var attente = n ? n + " changement" + (n > 1 ? "s" : "") + " en attente" : "";
    var texte = HL_.envoiEnCours && n ? "Envoi de " + attente.replace(" en attente", "") + "…"
      : HL_.horsLigne ? "Hors ligne" + (attente ? " — " + attente : " — planning en mémoire")
      : attente ? attente : "";
    el.textContent = texte;
    el.hidden = !texte;
    el.classList.toggle("hl-coupe", HL_.horsLigne);
    document.body.classList.toggle("hors-ligne", HL_.horsLigne);
  }

  // Session gardée sur l'appareil (supabase-js, localStorage) : sans réseau,
  // un jeton expiré ne peut pas être renouvelé et getSession() ne rend
  // rien — l'appli démarre quand même, en lecture de la mémoire (cf.
  // verifierSessionEtDemarrer, js/core.js).
  function hlSessionMemorisee() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (/^sb-.*-auth-token$/.test(k) && /refresh_token/.test(localStorage.getItem(k) || "")) return true;
      }
    } catch (e) { /* stockage inaccessible */ }
    return false;
  }

  /* ---------- Démarrage ---------- */
  window.addEventListener("online", function () { hlEnvoyerFile(); });
  window.addEventListener("offline", function () { hlPasseHorsLigne_(); });
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible" && HL_.enAttente) hlEnvoyerFile(); });
  setInterval(function () { if (HL_.enAttente && !HL_.envoiEnCours) hlEnvoyerFile(); }, 15000);
  // File laissée par une visite précédente : comptée tout de suite
  // (pastille), envoyée une fois l'appli démarrée.
  hlTout("envois").then(function (file) {
    HL_.enAttente = file.length;
    hlMajIndicateur();
    if (file.length) setTimeout(hlEnvoyerFile, 3000);
  });
  // Copies de plus de 60 jours oubliées.
  hlTout("lectures").then(function (l) {
    var limite = Date.now() - 60 * 864e5;
    l.forEach(function (x) { if (x.ts < limite) hlSupprimer("lectures", x.url); });
  });
  // Service worker (l'appli s'ouvre sans réseau) : seulement servie en
  // http(s) — pas en file:// (tests) ni si le navigateur ne le permet pas.
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
    // Suite 61 : l'appli s'ouvre depuis la copie de l'appareil (sw.js,
    // « copie d'abord ») ; quand une nouvelle version publiée vient d'être
    // copiée, un petit bandeau propose de recharger — sinon elle servira à
    // la prochaine ouverture.
    navigator.serviceWorker.addEventListener("message", function (e) {
      if (e.data && e.data.type === "appli-maj") proposerNouvelleVersion();
    });
  }
  function proposerNouvelleVersion() {
    if (document.getElementById("majAppli")) return;
    var bandeau = document.createElement("div");
    bandeau.id = "majAppli";
    bandeau.className = "maj-appli";
    bandeau.setAttribute("role", "status");
    bandeau.innerHTML = '<span>Nouvelle version de l’appli prête.</span>' +
      '<button type="button" class="maj-recharger">Recharger</button>' +
      '<button type="button" class="maj-fermer" aria-label="Plus tard" title="Plus tard">×</button>';
    bandeau.querySelector(".maj-recharger").addEventListener("click", function () { window.location.reload(); });
    bandeau.querySelector(".maj-fermer").addEventListener("click", function () { bandeau.remove(); });
    document.body.appendChild(bandeau);
  }
