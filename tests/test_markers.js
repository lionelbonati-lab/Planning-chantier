// Teste en isolation la logique de marqueurs (statut / sous-traitant) de
// WebApp.gs, y compris son interaction avec tirets() (Planning_Format.gs),
// avant de coller quoi que ce soit dans l'éditeur Apps Script.
"use strict";

var STATUT_ORDER_WEB = ["areserver", "reserve", "confirme", "annule"];
var STATUTS_WEB = { areserver: "À réserver", reserve: "Réservé", confirme: "Confirmé", annule: "Annulé" };
var MARQUEUR_SOUS_TRAITANT = "🔧 ";
var MARQUEUR_PERSONNEL = "👷 ";
var PREMIERE_LIGNE_SOUS_TRAITANT = 22;

function decoderNom_(brut, startRow) {
  var s = String(brut == null ? "" : brut);
  if (s.indexOf(MARQUEUR_SOUS_TRAITANT) === 0) return { nom: s.slice(MARQUEUR_SOUS_TRAITANT.length).trim(), sousTraitant: true };
  if (s.indexOf(MARQUEUR_PERSONNEL) === 0) return { nom: s.slice(MARQUEUR_PERSONNEL.length).trim(), sousTraitant: false };
  return { nom: s, sousTraitant: (startRow != null && startRow >= PREMIERE_LIGNE_SOUS_TRAITANT) };
}
function encoderNom_(nom, sousTraitant, startRow) {
  var n = String(nom == null ? "" : nom).trim();
  var implicite = (startRow != null && startRow >= PREMIERE_LIGNE_SOUS_TRAITANT);
  if (!!sousTraitant === implicite) return n;
  return (sousTraitant ? MARQUEUR_SOUS_TRAITANT : MARQUEUR_PERSONNEL) + n;
}
// Port JS fidèle de decoderLigneTache_/decoderTaches_/encoderTaches_ (+
// decoderNotesJour_/encoderNotesJour_) dans WebApp.gs.
// Round du 28.08.2026 (demande de Lionel) : une case = une LISTE de tâches,
// une par ligne, chacune avec son propre statut optionnel ("les 2 tâches
// peuvent avoir des statuts différents") ET son propre tag manuel
// [Important] ("faire ressortir le texte d'une tâche ou d'une note en
// rouge") — les deux crochets sont indépendants, dans n'importe quel ordre.
// Les notes (ligne 5) réutilisent EXACTEMENT la même machinerie, sans statut.
function decoderLigneTache_(ligne) {
  var s = String(ligne).replace(/^-\s+/, "");
  var statut = null, important = false, m;
  while ((m = /^\[([^\]]+)\][ \t]*/.exec(s))) {
    if (m[1] === "Important") { important = true; s = s.slice(m[0].length); continue; }
    var trouve = false;
    for (var i = 0; i < STATUT_ORDER_WEB.length; i++) {
      if (STATUTS_WEB[STATUT_ORDER_WEB[i]] === m[1]) { statut = STATUT_ORDER_WEB[i]; s = s.slice(m[0].length); trouve = true; break; }
    }
    if (!trouve) break;
  }
  return { statut: statut, texte: s, important: important };
}
function decoderTaches_(brut) {
  var s = String(brut == null ? "" : brut);
  if (s.trim() === "") return [];
  return s.split("\n")
    .map(function (l) { return l.trim(); })
    .filter(function (l) { return l !== ""; })
    .map(decoderLigneTache_);
}
function encoderTaches_(taches) {
  return (taches || [])
    .map(function (t) {
      var texte = String(t && t.texte == null ? "" : t.texte).trim();
      if (texte === "") return null;
      var pre = "";
      if (t && t.statut && STATUTS_WEB[t.statut]) pre += "[" + STATUTS_WEB[t.statut] + "] ";
      if (t && t.important) pre += "[Important] ";
      return pre + texte;
    })
    .filter(function (l) { return l !== null; })
    .join("\n");
}
function decoderNotesJour_(brut) {
  return decoderTaches_(brut).map(function (t) { return { texte: t.texte, important: t.important }; });
}
function encoderNotesJour_(entrees) {
  return encoderTaches_((entrees || []).map(function (e) { return { texte: e.texte, important: e.important }; }));
}

// Port JS fidèle de retirerTagImportant_/preparerLignesImpression_ dans
// Planning_Format.gs (round du 28.08.2026, 2e passage — capture d'écran de
// Lionel : « certaines tâches qui ne sont pas importantes se colorient en
// rouge lors de l'impression car il y a une règle de mise en couleur pour la
// cellule entière... le texte rouge doit rester uniquement pour la tâche ou
// note importante »). Logique PURE (aucun appel Apps Script) : c'est
// exactement pour ça qu'elle peut être testée ici en isolation, avant même
// de toucher au texte riche réel (cf. test_semaines.js pour l'intégration).
function retirerTagImportant_(ligne) {
  var s = String(ligne == null ? "" : ligne);
  var tiret = "";
  var mTiret = /^-\s+/.exec(s);
  if (mTiret) { tiret = mTiret[0]; s = s.slice(mTiret[0].length); }
  var gardes = "";
  var m;
  while ((m = /^\[([^\]]+)\][ \t]*/.exec(s))) {
    if (!/^Important$/i.test(m[1])) gardes += m[0];
    s = s.slice(m[0].length);
  }
  return tiret + gardes + s;
}
function preparerLignesImpression_(brut) {
  var s = String(brut == null ? "" : brut);
  if (s === "") return { texte: "", rouges: [] };
  var lignesIn = s.split("\n");
  var lignesOut = [], rouges = [], pos = 0;
  for (var i = 0; i < lignesIn.length; i++) {
    var ligne = lignesIn[i];
    var estRouge = /important|urgent/i.test(ligne);
    var ligneAffichee = retirerTagImportant_(ligne);
    lignesOut.push(ligneAffichee);
    if (estRouge && ligneAffichee !== "") rouges.push([pos, pos + ligneAffichee.length]);
    pos += ligneAffichee.length + 1;
  }
  return { texte: lignesOut.join("\n"), rouges: rouges };
}

// Port JS fidèle de tirets() dans Planning_Format.gs — pour vérifier
// l'interaction réelle (le reformatage ajoute "- " en tête de chaque ligne
// non vide qui n'en a pas déjà une).
function tirets(v) {
  var s = String(v).trim(); if (s === "") return s;
  var l = s.split("\n");
  for (var i = 0; i < l.length; i++) { var li = l[i].trim(); if (li !== "" && li.charAt(0) !== "-") l[i] = "- " + li; }
  return l.join("\n");
}

var fails = 0;
function eq(label, got, want) {
  var g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { fails++; console.log("ÉCHEC  " + label + "\n  attendu : " + w + "\n  obtenu  : " + g); }
  else console.log("ok     " + label);
}

console.log("--- decoderNom_ / encoderNom_ ---");
eq("sous-traitant marqué", decoderNom_("🔧 Filisetti"), { nom: "Filisetti", sousTraitant: true });
eq("personnel normal", decoderNom_("Lionel"), { nom: "Lionel", sousTraitant: false });
eq("chaîne vide", decoderNom_(""), { nom: "", sousTraitant: false });
eq("null", decoderNom_(null), { nom: "", sousTraitant: false });
eq("marqueur seul, nom vide", decoderNom_("🔧 "), { nom: "", sousTraitant: true });
eq("encodage sous-traitant", encoderNom_("Filisetti", true), "🔧 Filisetti");
eq("encodage personnel", encoderNom_("Lionel", false), "Lionel");
eq("encodage avec espaces", encoderNom_("  Lionel  ", false), "Lionel");
eq("aller-retour sous-traitant", decoderNom_(encoderNom_("Plâtrier X", true)), { nom: "Plâtrier X", sousTraitant: true });
eq("aller-retour personnel", decoderNom_(encoderNom_("Julien", false)), { nom: "Julien", sousTraitant: false });

console.log("\n--- sections déduites de la ligne (seuil = " + PREMIERE_LIGNE_SOUS_TRAITANT + ") ---");
// Le cas normal du planning réel : AUCUN marqueur dans la feuille, c'est la
// seule position de la ligne qui range la personne dans la bonne section.
eq("ligne 6 sans marqueur -> personnel", decoderNom_("Lionel", 6), { nom: "Lionel", sousTraitant: false });
eq("ligne 18 sans marqueur -> personnel", decoderNom_("Yannis", 18), { nom: "Yannis", sousTraitant: false });
eq("ligne 22 (seuil pile) sans marqueur -> sous-traitant", decoderNom_("Armature / Béton", 22), { nom: "Armature / Béton", sousTraitant: true });
eq("ligne 26 sans marqueur -> sous-traitant", decoderNom_("Filisetti SA", 26), { nom: "Filisetti SA", sousTraitant: true });
// Marqueurs = surcharge explicite, dans les deux sens, quand la position ment.
eq("marqueur 🔧 au-dessus du seuil gagne", decoderNom_("🔧 Plâtrier X", 10), { nom: "Plâtrier X", sousTraitant: true });
eq("marqueur 👷 en dessous du seuil gagne", decoderNom_("👷 Julien", 26), { nom: "Julien", sousTraitant: false });
eq("encodage : position déjà bonne -> aucun marqueur (personnel)", encoderNom_("Lionel", false, 6), "Lionel");
eq("encodage : position déjà bonne -> aucun marqueur (sous-traitant)", encoderNom_("Filisetti SA", true, 26), "Filisetti SA");
eq("encodage : sous-traitant placé trop haut -> 🔧", encoderNom_("Plâtrier X", true, 10), "🔧 Plâtrier X");
eq("encodage : personnel placé trop bas -> 👷", encoderNom_("Julien", false, 26), "👷 Julien");
eq("aller-retour personnel trop bas", decoderNom_(encoderNom_("Julien", false, 26), 26), { nom: "Julien", sousTraitant: false });
eq("aller-retour sous-traitant trop haut", decoderNom_(encoderNom_("Plâtrier X", true, 10), 10), { nom: "Plâtrier X", sousTraitant: true });
eq("ligne inconnue (pas de startRow) -> personnel sauf marqueur", decoderNom_("Inconnu"), { nom: "Inconnu", sousTraitant: false });

console.log("\n--- decoderTaches_ / encoderTaches_ (1 seule tâche — cas historique) ---");
eq("statut + détail", decoderTaches_("[Confirmé] Béton radier 50m3"), [{ statut: "confirme", texte: "Béton radier 50m3", important: false }]);
eq("statut avec tiret déjà ajouté (tirets())", decoderTaches_("- [Confirmé] Béton radier 50m3"), [{ statut: "confirme", texte: "Béton radier 50m3", important: false }]);
eq("aucun marqueur", decoderTaches_("Béton radier 50m3"), [{ statut: null, texte: "Béton radier 50m3", important: false }]);
eq("tiret seul sans marqueur (texte ancien, préservé tel quel)", decoderTaches_("- Coffrage murs"), [{ statut: null, texte: "Coffrage murs", important: false }]);
eq("chaîne vide", decoderTaches_(""), []);
eq("null", decoderTaches_(null), []);
eq("espaces seuls", decoderTaches_("   "), []);
eq("crochet mais libellé inconnu -> pas de statut, ligne conservée telle quelle", decoderTaches_("[Inconnu] texte"), [{ statut: null, texte: "[Inconnu] texte", important: false }]);
eq("casse différente -> pas reconnu (mais ne casse rien)", decoderTaches_("[à réserver] Electricien"), [{ statut: null, texte: "[à réserver] Electricien", important: false }]);
eq("tous les statuts", STATUT_ORDER_WEB.map(function (k) { return decoderTaches_(encoderTaches_([{ statut: k, texte: "x" }]))[0].statut; }), STATUT_ORDER_WEB);
eq("encodage sans statut", encoderTaches_([{ statut: null, texte: "Coffrage murs" }]), "Coffrage murs");
eq("encodage avec statut", encoderTaches_([{ statut: "confirme", texte: "Béton radier 50m3" }]), "[Confirmé] Béton radier 50m3");
eq("encodage liste vide", encoderTaches_([]), "");
eq("encodage tâche sans texte -> ignorée", encoderTaches_([{ statut: "confirme", texte: "" }]), "");
eq("encodage sans arguments", encoderTaches_(null), "");
eq("aller-retour détail vide (aucune tâche)", decoderTaches_(encoderTaches_([])), []);

console.log("\n--- plusieurs tâches par case, chacune avec son propre statut (demande de Lionel, 28.08.2026) ---");
var deuxTaches = [
  { statut: "reserve", texte: "Armature inf dalle sur étage", important: false },
  { statut: "areserver", texte: "Electricien + Sanitaire dalle", important: false }
];
eq("encodage : une ligne par tâche", encoderTaches_(deuxTaches), "[Réservé] Armature inf dalle sur étage\n[À réserver] Electricien + Sanitaire dalle");
eq("aller-retour : 2 tâches, 2 statuts différents", decoderTaches_(encoderTaches_(deuxTaches)), deuxTaches);
eq("3e tâche sans statut, mélangée aux 2 précédentes", decoderTaches_(encoderTaches_(deuxTaches.concat([{ statut: null, texte: "Nettoyage" }]))),
  deuxTaches.concat([{ statut: null, texte: "Nettoyage", important: false }]));
eq("une tâche vide au milieu (ligne ajoutée puis jamais remplie) -> ignorée, pas de trou", encoderTaches_([
  { statut: "confirme", texte: "Première" },
  { statut: null, texte: "" },
  { statut: "annule", texte: "Troisième" }
]), "[Confirmé] Première\n[Annulé] Troisième");

console.log("\n--- tag manuel [Important] (demande de Lionel, 28.08.2026 : \"faire ressortir le texte d'une tâche… en rouge\") ---");
eq("important seul, sans statut", decoderTaches_("[Important] Coulage dalle"), [{ statut: null, texte: "Coulage dalle", important: true }]);
eq("statut PUIS important (ordre d'encodage habituel)", decoderTaches_("[Confirmé] [Important] Coulage dalle"), [{ statut: "confirme", texte: "Coulage dalle", important: true }]);
eq("important PUIS statut (ordre inverse, ressaisi à la main -> reconnu quand même)", decoderTaches_("[Important] [Confirmé] Coulage dalle"), [{ statut: "confirme", texte: "Coulage dalle", important: true }]);
eq("important + tiret déjà ajouté", decoderTaches_("- [Important] Coulage dalle"), [{ statut: null, texte: "Coulage dalle", important: true }]);
eq("encodage : statut + important, dans cet ordre", encoderTaches_([{ statut: "confirme", texte: "Coulage dalle", important: true }]), "[Confirmé] [Important] Coulage dalle");
eq("encodage : important seul (pas de statut)", encoderTaches_([{ statut: null, texte: "Coulage dalle", important: true }]), "[Important] Coulage dalle");
eq("encodage : ni statut ni important -> texte nu", encoderTaches_([{ statut: null, texte: "Coulage dalle", important: false }]), "Coulage dalle");
eq("aller-retour statut+important", decoderTaches_(encoderTaches_([{ statut: "annule", texte: "Livraison béton", important: true }])), [{ statut: "annule", texte: "Livraison béton", important: true }]);
eq("2 tâches, une importante une non", decoderTaches_(encoderTaches_([
  { statut: null, texte: "Urgent : appeler le fournisseur", important: true },
  { statut: null, texte: "Nettoyage", important: false }
])), [
  { statut: null, texte: "Urgent : appeler le fournisseur", important: true },
  { statut: null, texte: "Nettoyage", important: false }
]);

console.log("\n--- interaction réelle avec tirets() (le point le plus piégeux) ---");
// Scénario : l'appli enregistre une ou plusieurs tâches, puis
// reformaterZone() (déjà appelée par apiEnregistrerCellulePersonne)
// applique tirets() sur la valeur de la cellule ; au prochain chargement,
// CHAQUE tâche doit rester reconnue avec son propre statut, son propre
// [Important] et un texte propre. tirets() ajoute "- " à CHAQUE ligne non
// vide qui n'en a pas déjà une (cf. Planning_Format.gs) — c'est ce qui
// permet à decoderLigneTache_ de fonctionner ligne par ligne exactement
// comme avant, juste répété pour chaque tâche plutôt qu'une seule fois pour
// toute la case.
[
  [[{ statut: "confirme", texte: "Béton radier 50m3", important: false }], [{ statut: "confirme", texte: "Béton radier 50m3", important: false }]],
  [[{ statut: "areserver", texte: "Electricien murs", important: false }], [{ statut: "areserver", texte: "Electricien murs", important: false }]],
  [[{ statut: "annule", texte: "", important: false }], []], // texte vide -> rien à encoder, rien à relire
  [[{ statut: null, texte: "Coffrage murs", important: false }], [{ statut: null, texte: "Coffrage murs", important: false }]],
  [[{ statut: null, texte: "Coulage dalle", important: true }], [{ statut: null, texte: "Coulage dalle", important: true }]],
  [[{ statut: "confirme", texte: "Coulage dalle", important: true }], [{ statut: "confirme", texte: "Coulage dalle", important: true }]],
  // Le cas de Lionel : 2 tâches, 2 statuts différents, chacune reformatée
  // indépendamment par tirets() — ni l'une ni l'autre ne doit "manger" le
  // tiret de l'autre.
  [
    [{ statut: "reserve", texte: "Armature inf dalle sur étage", important: false }, { statut: "areserver", texte: "Electricien + Sanitaire dalle", important: true }],
    [{ statut: "reserve", texte: "Armature inf dalle sur étage", important: false }, { statut: "areserver", texte: "Electricien + Sanitaire dalle", important: true }]
  ],
  // Une tâche AVEC statut et une SANS, mélangées : la seconde ligne n'a
  // qu'un tiret ajouté par tirets(), sans "[Label]" à reconnaître — elle
  // doit rester une tâche à part entière, sans statut, texte propre.
  [
    [{ statut: "confirme", texte: "Première", important: false }, { statut: null, texte: "Deuxième", important: false }],
    [{ statut: "confirme", texte: "Première", important: false }, { statut: null, texte: "Deuxième", important: false }]
  ]
].forEach(function (paire) {
  var taches = paire[0], attendu = paire[1];
  var enregistre = encoderTaches_(taches);
  var apresReformatage = tirets(enregistre); // ce que la cellule contient vraiment après reformaterZone()
  var relu = decoderTaches_(apresReformatage);
  eq(
    "cycle complet " + JSON.stringify(taches) + " (valeur cellule finale = " + JSON.stringify(apresReformatage) + ")",
    relu,
    attendu
  );
});

console.log("\n--- multi-ligne préexistant sans statut (ancienne limitation résolue) ---");
// Avant ce round, une case à plusieurs lignes SANS statut était traitée
// comme un seul détail opaque (seule la 1ère ligne était examinée pour un
// éventuel statut). Désormais chaque ligne devient sa propre tâche — c'est
// justement ce qui permet de leur donner ensuite des statuts différents
// depuis la fiche, sans rien perdre : le texte de chaque ligne survit,
// juste mieux structuré qu'avant. Pas une régression : une amélioration.
var multi = "- première tâche\n- deuxième tâche";
eq("multi-ligne sans statut -> 2 tâches distinctes (au lieu d'un seul détail opaque)", decoderTaches_(multi), [
  { statut: null, texte: "première tâche", important: false },
  { statut: null, texte: "deuxième tâche", important: false }
]);

console.log("\n--- decoderNotesJour_ / encoderNotesJour_ (round du 28.08.2026, demande de Lionel : \"ajouter une note comme tu l'as fait avec les tâches\") ---");
eq("case vide -> aucune note", decoderNotesJour_(""), []);
eq("case null -> aucune note", decoderNotesJour_(null), []);
eq("une seule note (cas historique, la grande majorité des jours)", decoderNotesJour_("Livraison béton"), [{ texte: "Livraison béton", important: false }]);
eq("une note importante", decoderNotesJour_("[Important] Fermeture matériaux"), [{ texte: "Fermeture matériaux", important: true }]);
eq("2 notes indépendantes le même jour (le cas que Lionel veut démêler)", decoderNotesJour_("Livraison béton\n[Important] RDV client 14h"), [
  { texte: "Livraison béton", important: false },
  { texte: "RDV client 14h", important: true }
]);
eq("encodage : plusieurs notes -> une ligne chacune", encoderNotesJour_([
  { texte: "Livraison béton", important: false },
  { texte: "RDV client 14h", important: true }
]), "Livraison béton\n[Important] RDV client 14h");
eq("encodage : note sans texte -> ignorée", encoderNotesJour_([{ texte: "", important: true }]), "");
eq("encodage : aucun argument", encoderNotesJour_(null), "");
eq("aller-retour, plusieurs notes dont une importante", decoderNotesJour_(encoderNotesJour_([
  { texte: "Livraison béton", important: false },
  { texte: "RDV client 14h", important: true },
  { texte: "Contrôle électricité", important: false }
])), [
  { texte: "Livraison béton", important: false },
  { texte: "RDV client 14h", important: true },
  { texte: "Contrôle électricité", important: false }
]);
eq("une note reformatée par tirets() (comme apiEnregistrerPlage) reste reconnue", decoderNotesJour_(tirets(encoderNotesJour_([{ texte: "Livraison béton", important: true }]))), [{ texte: "Livraison béton", important: true }]);

console.log("\n--- preparerLignesImpression_ / retirerTagImportant_ (round du 28.08.2026, 2e passage : rouge par LIGNE à l'impression, jamais pour la cellule entière) ---");
eq("cellule vide", preparerLignesImpression_(""), { texte: "", rouges: [] });
eq("cellule null", preparerLignesImpression_(null), { texte: "", rouges: [] });
eq("une ligne, rien d'important", preparerLignesImpression_("- Coffrage murs"), { texte: "- Coffrage murs", rouges: [] });
eq("une ligne taguée [Important] -> tag retiré, toute la ligne rouge", preparerLignesImpression_("- [Important] Réserver livraison armature"), { texte: "- Réserver livraison armature", rouges: [[0, 29]] });

// Le cas EXACT de la capture d'écran de Lionel (case "Lionel", mardi
// après-midi) : 2 tâches dans la même case, une seule taguée Important —
// avant ce correctif, TOUTE la case ressortait rouge à l'impression.
var casLionel = preparerLignesImpression_("- Rangement du chantier, évacuation matériel\n- [Important] Réserver livraison armature murs Filisetti");
eq("cas Lionel : tag retiré uniquement sur la ligne concernée", casLionel.texte, "- Rangement du chantier, évacuation matériel\n- Réserver livraison armature murs Filisetti");
eq("cas Lionel : une seule plage rouge (la 2e ligne uniquement, pas la 1ère)", casLionel.rouges.length, 1);
(function () {
  var lignes = casLionel.texte.split("\n");
  var deb = casLionel.rouges[0][0], fin = casLionel.rouges[0][1];
  eq("cas Lionel : la plage rouge correspond exactement à la 2e ligne (offsets)", casLionel.texte.slice(deb, fin), lignes[1]);
  eq("cas Lionel : la plage rouge NE COUVRE PAS la 1ère ligne", deb >= lignes[0].length, true);
})();

eq("statut + Important, dans cet ordre -> statut gardé, tag Important retiré, rouge", preparerLignesImpression_("[Réservé] [Important] Livraison armature"), { texte: "[Réservé] Livraison armature", rouges: [[0, 28]] });
eq("Important + statut, ordre inverse -> même résultat, l'ordre ne compte pas", preparerLignesImpression_("[Important] [Réservé] Livraison armature"), { texte: "[Réservé] Livraison armature", rouges: [[0, 28]] });
eq("mot-clé automatique SANS tag (\"urgent\" en texte libre) -> reste rouge, texte inchangé (rien à retirer)", preparerLignesImpression_("Attention, chantier urgent demain"), { texte: "Attention, chantier urgent demain", rouges: [[0, 33]] });
eq("ni tag ni mot-clé -> jamais rouge, texte inchangé", preparerLignesImpression_("- Coffrage têtes"), { texte: "- Coffrage têtes", rouges: [] });

// 3 lignes, 1ère et 3e importantes, 2e non : vérifie que 2 plages rouges
// disjointes sont produites (pas fusionnées, pas décalées par l'absence de
// tag sur la ligne du milieu).
var trois = preparerLignesImpression_("[Important] Première\nDeuxième, rien de spécial\n[Important] Troisième");
eq("3 lignes, 1re et 3e importantes -> texte des 3 lignes, tags retirés", trois.texte, "Première\nDeuxième, rien de spécial\nTroisième");
eq("3 lignes, 1re et 3e importantes -> exactement 2 plages rouges", trois.rouges.length, 2);
(function () {
  var lignes = trois.texte.split("\n");
  eq("3 lignes : 1re plage = 1re ligne exactement", trois.texte.slice(trois.rouges[0][0], trois.rouges[0][1]), lignes[0]);
  eq("3 lignes : 2e plage = 3e ligne exactement (la 2e n'en génère aucune)", trois.texte.slice(trois.rouges[1][0], trois.rouges[1][1]), lignes[2]);
})();

console.log("\n" + (fails === 0 ? "TOUT PASSE (" : "ÉCHECS : " + fails + " / ") + "voir ci-dessus pour le détail)");
process.exit(fails === 0 ? 0 : 1);
