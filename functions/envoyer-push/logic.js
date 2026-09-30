// ============================================================
// envoyer-push — logique pure (sans réseau ni base), testée en Node par
// tests/test_suite126.js. Round du 29.09.2026 (suite 126).
//
// Lionel : « Notification Push sur le téléphone et l'ordinateur avec
// différents paramètre à régler dans l'appli. », puis, à notre question
// sur ce qui doit arriver : les 4 sortes, chacune avec son interrupteur —
// demandes d'absence, importants (la veille et le matin), à réserver,
// modifications faites sur un autre appareil.
//
// planEnvois(donnees, maintenant) décide, à chaque passage (pg_cron, une
// fois par minute au plus, cf. sql/0027_notifications_push.sql), QUOI
// envoyer à QUEL abonnement (un abonnement = un navigateur d'un appareil)
// et ce qu'il faut noter en base pour ne pas le renvoyer :
//   - demandes d'absence en attente pas encore annoncées (notifiee_push) :
//     une notification (une seule pour plusieurs demandes à la fois) ;
//     notées annoncées même sans abonné (pas de rafale à l'abonnement) ;
//   - modifications : une ligne push_modifs par session de connexion (un
//     appareil) qui a écrit dans taches, jalons ou notes. Annoncée aux
//     AUTRES appareils quand plus rien n'a bougé depuis 1 minute (une
//     série de gestes = une seule notification) ;
//   - (importants la veille et le matin, « à réserver » le matin, à heure
//     fixe : remplacés en suite 128, ci-dessous).
//
// Round du 30.09.2026 (suite 128) — Lionel : « Notifications, notification
// différents pour chaque groupe de libellé différents. Possibilité de pour
// régler x jours avant et en fonction des horaires de travail. », puis, à
// nos questions : chaque sorte actuelle a ses propres réglages, et l'heure
// d'envoi est le « Début de demi journée ». La veille et le matin à heure
// fixe (heure_veille, heure_matin) sont remplacés par :
//   - importants et à réserver : « x jours avant » (réglage de chaque
//     sorte, par appareil : abonnements_push.reglages), en JOURS DE
//     TRAVAIL (week-ends, fériés, vacances d'entreprise sautés ; compensés
//     comme la page Fériés) ; la notification part au DÉBUT DE LA
//     DEMI-JOURNÉE concernée, selon la page Horaires. Exemple : une tâche
//     importante jeudi après-midi, réglage « 1 jour avant » → mercredi à
//     l'heure du début de l'après-midi (13:00) ; une tâche du matin ou un
//     jalon (journée entière) → mercredi au début du matin (07:45) ;
//   - demandes d'absence : toujours annoncées dès leur arrivée, plus un
//     rappel « x jours avant le début » si elle attend encore (réglage,
//     aucun par défaut) ;
//   - modifications : inchangées (une minute après le dernier changement).
// Les CRÉNEAUX (début du matin, début de l'après-midi d'aujourd'hui) à
// traiter sont donnés par la base (push_creneaux_, sql/0029) : un créneau
// part dans les 4 heures qui suivent son début, une seule fois (noté dans
// push_passages). Pour chaque créneau, planEnvois cherche ce dont la date
// d'envoi, selon le réglage de l'appareil, tombe sur ce créneau.
// Heures et dates : Europe/Zurich (heure d'été comprise).
// ============================================================

const FUSEAU = "Europe/Zurich";
const CALME_MODIFS_MS = 60 * 1000;
const JOURS = ["Dim.", "Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam."];
const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const LIGNES_MAX = 5;
// Réglages d'un appareil quand il n'a rien choisi (suite 128) : importants
// et à réserver 1 jour de travail avant, pas de rappel des demandes.
const REGLAGES_DEFAUT = { importants: 1, a_reserver: 1, rappel_demandes: null };
const JOURS_MAX = 30;

// Date (AAAA-MM-JJ) et heure (0-23) à Zurich.
function heureLocale(maintenant) {
  const parts = {};
  new Intl.DateTimeFormat("en-CA", { timeZone: FUSEAU, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
    .formatToParts(maintenant).forEach(function (p) { parts[p.type] = p.value; });
  return { iso: parts.year + "-" + parts.month + "-" + parts.day, heure: +parts.hour % 24 };
}
function decalerIso(iso, n) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function prochainJourOuvre(iso) {
  const d = new Date(iso + "T00:00:00Z");
  do { d.setUTCDate(d.getUTCDate() + 1); } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}
function estWeekend(iso) { const j = new Date(iso + "T00:00:00Z").getUTCDay(); return j === 0 || j === 6; }
// « Jeu. 1 oct. », comme les listes de l'appli (a-reserver.js).
function dateCourte(iso) {
  const d = new Date(iso + "T00:00:00Z");
  return JOURS[d.getUTCDay()] + " " + d.getUTCDate() + " " + MOIS[d.getUTCMonth()];
}
function pluriel(n, mot) { return n + " " + mot + (n > 1 ? "s" : ""); }
function limiterLignes(lignes) {
  if (lignes.length <= LIGNES_MAX) return lignes.join("\n");
  return lignes.slice(0, LIGNES_MAX - 1).join("\n") + "\n… et " + (lignes.length - LIGNES_MAX + 1) + " autres";
}
function typeActif(abo, type) {
  const t = abo.types || {};
  return t[type] !== false;
}
// « x jours avant » d'une sorte pour cet appareil ; null = pas d'envoi
// (rappel des demandes pas demandé).
function reglage(abo, cle) {
  const r = abo.reglages || {};
  const v = cle in r ? r[cle] : REGLAGES_DEFAUT[cle];
  if (v === null || v === undefined || v === "") return null;
  return Math.max(0, Math.min(JOURS_MAX, Math.floor(+v) || 0));
}

// ---- Calendrier de travail (suite 128) ------------------------------------
// Mêmes règles que l'appli : horaireDuJour (page-horaires.js : rien le
// week-end, la dernière période qui commence l'emporte) et jour travaillé
// de la page Fériés (férié et vacances d'entreprise : non ; compensé :
// seulement s'il a sa propre période d'un jour, cf. heuresFerieJour_).
function minutesDe(hhmm) {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || "");
  return m ? +m[1] * 60 + +m[2] : null;
}
function calendrier(d) {
  const horaires = (d.horaires || []).slice().sort(function (a, b) {
    return a.date_debut < b.date_debut ? -1 : a.date_debut > b.date_debut ? 1 : (a.id || 0) - (b.id || 0);
  });
  const feries = {};
  (d.feries || []).forEach(function (f) { feries[f.date] = f; });
  return { horaires: horaires, feries: feries, travaille: {} };
}
function horaireDuJour(iso, cal) {
  if (estWeekend(iso)) return null;
  let h = null;
  cal.horaires.forEach(function (p) { if (p.date_debut <= iso && iso <= p.date_fin) h = p; });
  if (!h) return null;
  return { matin: minutesDe(h.matin_debut), aprem: h.aprem_debut && h.aprem_fin ? minutesDe(h.aprem_debut) : null, jourSeul: h.date_debut === h.date_fin };
}
function jourTravaille(iso, cal) {
  if (iso in cal.travaille) return cal.travaille[iso];
  let oui = !estWeekend(iso);
  const f = cal.feries[iso];
  if (oui && f) oui = f.categorie === "compenses" && !!(horaireDuJour(iso, cal) || {}).jourSeul;
  cal.travaille[iso] = oui;
  return oui;
}
// Jour d'envoi pour un jour visé : le x-ième jour de travail avant lui
// (« 1 jour avant » un lundi ou un samedi = le vendredi) ; 0 = le jour
// même, ou, s'il n'est pas travaillé, le dernier jour de travail avant.
function jourEnvoi(iso, jours, cal) {
  let d = iso, garde = 0;
  if (!jours) {
    while (!jourTravaille(d, cal) && garde++ < 400) d = decalerIso(d, -1);
    return d;
  }
  for (let k = 0; k < jours; k++) {
    do { d = decalerIso(d, -1); } while (!jourTravaille(d, cal) && garde++ < 400);
  }
  return d;
}
// Créneau d'envoi (« AAAA-MM-JJ:matin » ou « …:aprem ») d'une chose datée
// (demi : "matin", "aprem" ou null = journée entière → le matin). Jour
// d'envoi sans après-midi (période « matin seul ») : au début du matin.
function creneauEnvoi(iso, demi, jours, cal) {
  const j = jourEnvoi(iso, jours, cal);
  const h = horaireDuJour(j, cal);
  const aprem = demi === "aprem" && (h ? h.aprem !== null : true);
  return j + ":" + (aprem ? "aprem" : "matin");
}
// « demain matin », « aujourd’hui après-midi », « lun. 5 oct. »…
function quand(iso, demi, jourEnvoiIso) {
  const jour = iso === jourEnvoiIso ? "aujourd’hui" : iso === decalerIso(jourEnvoiIso, 1) ? "demain" : dateCourte(iso).toLowerCase();
  return jour + (demi === "matin" ? " matin" : demi === "aprem" ? " après-midi" : "");
}
function majuscule(t) { return t ? t.charAt(0).toUpperCase() + t.slice(1) : t; }

// ---- Demandes d'absence --------------------------------------------------
function quandDemande(q) {
  const deb = q.date_debut;
  if (deb === q.date_fin) {
    const demi = q.demi_debut === q.demi_fin ? (q.demi_debut === "matin" ? ", matin" : ", après-midi") : "";
    return dateCourte(deb) + demi;
  }
  return dateCourte(deb) + " → " + dateCourte(q.date_fin);
}
function ligneDemande(q, nomsPersonnes) {
  return (nomsPersonnes[q.personne_id] || "?") + " · " + (q.motif || "Absence") + " · " + quandDemande(q);
}
function messageDemandes(demandes, nomsPersonnes) {
  const ligne = function (q) { return ligneDemande(q, nomsPersonnes); };
  if (demandes.length === 1) {
    const q = demandes[0];
    const titre = q.type === "annulation" ? "Annulation d’absence demandée" : q.type === "modification" ? "Modification d’absence demandée" : "Demande d’absence";
    return { titre: titre, corps: ligne(q), tag: "demandes" };
  }
  return { titre: pluriel(demandes.length, "demande") + " d’absence", corps: limiterLignes(demandes.map(ligne)), tag: "demandes" };
}
// Rappel (suite 128) : demandes toujours en attente, x jours avant leur début.
function messageRappelDemandes(demandes, nomsPersonnes, creneau) {
  const titre = demandes.length === 1 ? "Rappel : demande d’absence en attente" : "Rappel : " + demandes.length + " demandes d’absence en attente";
  return { titre: titre, corps: limiterLignes(demandes.map(function (q) { return ligneDemande(q, nomsPersonnes); })), tag: "rappel-demandes-" + creneau.demi };
}

// ---- Importants ------------------------------------------------------------
// Suite 128 : chaque important avec sa date et sa demi-journée ("matin",
// "aprem", null = journée entière : jalon, note sans demi, tâche du matin
// ET de l'après-midi). Une ligne par tâche et par jour ; rang : jalons,
// notes, puis personnes dans l'ordre du planning.
function elementsImportants(d) {
  const ordre = {};
  (d.personnes || []).forEach(function (p, i) { ordre[p.id] = p.ordre != null ? p.ordre : i; });
  const noms = {};
  (d.personnes || []).forEach(function (p) { noms[p.id] = p.nom; });
  const chantiers = {};
  (d.chantiers || []).forEach(function (c) { chantiers[c.id] = c.nom; });
  const parCle = {}, liste = [];
  function ajouter(sorte, rang, qui, t) {
    const cle = [t.date, sorte, t.personne_id == null ? "" : t.personne_id, t.texte || "", t.chantier_id == null ? "" : t.chantier_id].join("|");
    const demi = t.demi === "matin" || t.demi === "aprem" ? t.demi : null;
    const deja = parCle[cle];
    if (deja) { if (deja.demi !== demi) deja.demi = null; return; }
    const ch = t.chantier_id != null && chantiers[t.chantier_id] ? " (" + chantiers[t.chantier_id] + ")" : "";
    parCle[cle] = { date: t.date, demi: demi, rang: rang, texte: qui + " — " + (t.texte || "(sans texte)") + ch };
    liste.push(parCle[cle]);
  }
  (d.jalons || []).forEach(function (j) { if (j.important) ajouter("jalon", -2, "Jalon", j); });
  (d.notes || []).forEach(function (n) { if (n.important) ajouter("note", -1, "Note", n); });
  (d.taches || []).forEach(function (t) {
    if (!t.important || !(t.personne_id in noms)) return;
    ajouter(t.est_absence ? "absence" : "tache", ordre[t.personne_id], noms[t.personne_id] + (t.est_absence ? " · absence" : ""), t);
  });
  return liste;
}
const RANG_DEMI = { matin: 1, aprem: 2 };
function rangDemi(demi) { return RANG_DEMI[demi] || 0; }
// Un seul moment visé : « Demain après-midi : 2 importants » ; plusieurs
// (vendredi pour samedi, dimanche et lundi…) : « 3 importants à venir »,
// chaque ligne précédée de son moment.
function messageImportants(elements, creneau) {
  const liste = elements.slice().sort(function (a, b) {
    return a.date < b.date ? -1 : a.date > b.date ? 1 : rangDemi(a.demi) - rangDemi(b.demi) || a.rang - b.rang;
  });
  const moments = {};
  liste.forEach(function (e) { moments[e.date + "|" + (e.demi || "")] = true; });
  const tag = "importants-" + creneau.demi;
  if (Object.keys(moments).length === 1) {
    const e = liste[0];
    return { titre: majuscule(quand(e.date, e.demi, creneau.jour)) + " : " + pluriel(liste.length, "important"), corps: limiterLignes(liste.map(function (x) { return x.texte; })), tag: tag };
  }
  return {
    titre: pluriel(liste.length, "important") + " à venir",
    corps: limiterLignes(liste.map(function (x) { return majuscule(quand(x.date, x.demi, creneau.jour)) + " · " + x.texte; })),
    tag: tag
  };
}

// ---- À réserver ----------------------------------------------------------
// Même statut que l'appli (statutAReserverCle_, a-reserver.js) : celui de
// clé « areserver », sinon le premier de la liste ; même regroupement
// (jours ouvrés qui se suivent = une tâche). Suite 128 : demi-journée du
// premier jour gardée (demi : "matin", "aprem", null = les deux).
function statutAReserver(statuts) {
  const liste = (statuts || []).slice().sort(function (a, b) { return (a.ordre || 0) - (b.ordre || 0); });
  return liste.find(function (s) { return s.cle === "areserver"; }) || liste[0] || null;
}
function groupesAReserver(d, iso) {
  const statut = statutAReserver(d.statuts);
  if (!statut) return [];
  const noms = {};
  (d.personnes || []).forEach(function (p) { noms[p.id] = p.nom; });
  const cle = function (t) { return [t.personne_id, t.texte || "", t.chantier_id == null ? "" : t.chantier_id].join("|"); };
  const lignes = (d.aReserver || []).filter(function (t) { return t.statut_id === statut.id && t.date >= iso && t.personne_id in noms; })
    .sort(function (a, b) {
      const ka = cle(a), kb = cle(b);
      if (ka !== kb) return ka < kb ? -1 : 1;
      return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    });
  const groupes = [];
  let g = null;
  lignes.forEach(function (t) {
    const demi = t.demi === "matin" || t.demi === "aprem" ? t.demi : null;
    if (g && g.k === cle(t) && (t.date === g.au || t.date === prochainJourOuvre(g.au))) {
      if (t.date === g.du && g.demi !== demi) g.demi = null;
      g.au = t.date;
      return;
    }
    g = { k: cle(t), du: t.date, au: t.date, demi: demi, qui: noms[t.personne_id], texte: t.texte || "(sans texte)" };
    groupes.push(g);
  });
  return groupes.sort(function (a, b) { return a.du < b.du ? -1 : a.du > b.du ? 1 : 0; });
}
function messageAReserver(groupes, nomStatut, creneau) {
  const lignes = groupes.map(function (g) { return majuscule(quand(g.du, g.demi, creneau.jour)) + " · " + g.qui + " · " + g.texte; });
  return { titre: (nomStatut || "À réserver") + " : " + pluriel(groupes.length, "tâche"), corps: limiterLignes(lignes), tag: "a-reserver-" + creneau.demi };
}

// ---- Plan d'un passage ---------------------------------------------------
// donnees : { abonnements, demandes (en attente, pas encore annoncées),
//   demandesEnAttente (toutes celles en attente, pour le rappel),
//   modifs [{session_id, derniere}], personnes (actives), chantiers,
//   statuts, taches / jalons / notes (importants à venir), aReserver
//   (tâches avec statut), horaires, feries, creneaux (créneaux
//   d'aujourd'hui à traiter : [{cle, jour, demi}], push_creneaux_) }.
// Renvoie { envois: [{abonnement, message}], demandesAnnoncees: [id],
//   modifsTraitees: [session_id], passages: [cle des créneaux traités] }.
function planEnvois(d, maintenant) {
  const envois = [];
  const noms = {};
  (d.personnes || []).forEach(function (p) { noms[p.id] = p.nom; });

  const parId = function (a, b) { return a.id - b.id; };
  const demandes = (d.demandes || []).slice().sort(parId);
  const msgDemandes = demandes.length ? messageDemandes(demandes, noms) : null;

  const limite = maintenant.getTime() - CALME_MODIFS_MS;
  const modifsTraitees = (d.modifs || []).filter(function (m) { return new Date(m.derniere).getTime() <= limite; });
  const sessionsModif = modifsTraitees.map(function (m) { return m.session_id || ""; });
  const msgModifs = { titre: "Planning modifié", corps: "Des changements ont été faits sur un autre appareil.", tag: "modifs" };

  // Créneaux : ce qui, selon le réglage de l'appareil, part à ce créneau.
  const creneaux = d.creneaux || [];
  const cal = calendrier(d);
  const memo = {};
  const partA = function (creneau, iso, demi, jours) {
    const k = iso + "|" + (demi || "") + "|" + jours;
    if (!(k in memo)) memo[k] = creneauEnvoi(iso, demi, jours, cal);
    return memo[k] === creneau.cle;
  };
  let elements = null, groupes = null;
  const statut = statutAReserver(d.statuts);
  const enAttente = (d.demandesEnAttente || []).slice().sort(parId);

  (d.abonnements || []).forEach(function (abo) {
    if (msgDemandes && typeActif(abo, "demandes")) envois.push({ abonnement: abo, message: msgDemandes });
    if (typeActif(abo, "modifs") && sessionsModif.some(function (s) { return !s || s !== (abo.session_id || ""); }))
      envois.push({ abonnement: abo, message: msgModifs });

    creneaux.forEach(function (c) {
      let j = reglage(abo, "importants");
      if (j !== null && typeActif(abo, "importants")) {
        if (!elements) elements = elementsImportants(d);
        const choisis = elements.filter(function (e) { return partA(c, e.date, e.demi, j); });
        if (choisis.length) envois.push({ abonnement: abo, message: messageImportants(choisis, c) });
      }
      j = reglage(abo, "a_reserver");
      if (j !== null && typeActif(abo, "a_reserver")) {
        if (!groupes) groupes = groupesAReserver(d, "");
        const choisis = groupes.filter(function (g) { return partA(c, g.du, g.demi, j); });
        if (choisis.length) envois.push({ abonnement: abo, message: messageAReserver(choisis, statut ? majuscule(statut.nom) : null, c) });
      }
      j = reglage(abo, "rappel_demandes");
      if (j !== null && typeActif(abo, "demandes")) {
        const choisies = enAttente.filter(function (q) { return partA(c, q.date_debut, q.demi_debut, j); });
        if (choisies.length) envois.push({ abonnement: abo, message: messageRappelDemandes(choisies, noms, c) });
      }
    });
  });

  return {
    envois: envois,
    demandesAnnoncees: demandes.map(function (q) { return q.id; }),
    modifsTraitees: modifsTraitees.map(function (m) { return m.session_id; }),
    passages: creneaux.map(function (c) { return c.cle; })
  };
}

export {
  heureLocale,
  decalerIso,
  dateCourte,
  horaireDuJour,
  calendrier,
  jourTravaille,
  jourEnvoi,
  creneauEnvoi,
  elementsImportants,
  groupesAReserver,
  messageDemandes,
  planEnvois,
};
