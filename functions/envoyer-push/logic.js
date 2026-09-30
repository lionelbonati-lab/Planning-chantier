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
//   - veille : à partir de l'heure réglée (18 h par défaut), une fois par
//     jour, les importants de demain ;
//   - matin : à partir de l'heure réglée (7 h par défaut), une fois par
//     jour, les importants du jour et les tâches « à réserver » ;
//     veille et matin ne partent que dans les 4 heures qui suivent l'heure
//     réglée (appareil abonné le soir : pas de « ce matin » à 20 h), le
//     jour est noté dans tous les cas.
// Heures et dates : Europe/Zurich (heure d'été comprise).
// ============================================================

const FUSEAU = "Europe/Zurich";
const FENETRE_HEURES = 4;
const CALME_MODIFS_MS = 60 * 1000;
const JOURS = ["Dim.", "Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam."];
const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const LIGNES_MAX = 5;

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

// ---- Demandes d'absence --------------------------------------------------
function quandDemande(q) {
  const deb = q.date_debut;
  if (deb === q.date_fin) {
    const demi = q.demi_debut === q.demi_fin ? (q.demi_debut === "matin" ? ", matin" : ", après-midi") : "";
    return dateCourte(deb) + demi;
  }
  return dateCourte(deb) + " → " + dateCourte(q.date_fin);
}
function messageDemandes(demandes, nomsPersonnes) {
  const ligne = function (q) {
    return (nomsPersonnes[q.personne_id] || "?") + " · " + (q.motif || "Absence") + " · " + quandDemande(q);
  };
  if (demandes.length === 1) {
    const q = demandes[0];
    const titre = q.type === "annulation" ? "Annulation d’absence demandée" : q.type === "modification" ? "Modification d’absence demandée" : "Demande d’absence";
    return { titre: titre, corps: ligne(q), tag: "demandes" };
  }
  return { titre: pluriel(demandes.length, "demande") + " d’absence", corps: limiterLignes(demandes.map(ligne)), tag: "demandes" };
}

// ---- Importants d'un jour ------------------------------------------------
// Une ligne par tâche (matin + après-midi = une), jalon ou note ; jalons,
// notes, puis personnes dans l'ordre du planning.
function importantsDuJour(iso, d) {
  const ordre = {};
  (d.personnes || []).forEach(function (p, i) { ordre[p.id] = p.ordre != null ? p.ordre : i; });
  const noms = {};
  (d.personnes || []).forEach(function (p) { noms[p.id] = p.nom; });
  const chantiers = {};
  (d.chantiers || []).forEach(function (c) { chantiers[c.id] = c.nom; });
  const vus = {}, lignes = [];
  function ajouter(sorte, rang, qui, t) {
    const cle = [sorte, t.personne_id == null ? "" : t.personne_id, t.texte || "", t.chantier_id == null ? "" : t.chantier_id].join("|");
    if (vus[cle]) return;
    vus[cle] = true;
    const ch = t.chantier_id != null && chantiers[t.chantier_id] ? " (" + chantiers[t.chantier_id] + ")" : "";
    lignes.push({ rang: rang, texte: qui + " — " + (t.texte || "(sans texte)") + ch });
  }
  (d.jalons || []).forEach(function (j) { if (j.important && j.date === iso) ajouter("jalon", -2, "Jalon", j); });
  (d.notes || []).forEach(function (n) { if (n.important && n.date === iso) ajouter("note", -1, "Note", n); });
  (d.taches || []).forEach(function (t) {
    if (!t.important || t.date !== iso || !(t.personne_id in noms)) return;
    ajouter(t.est_absence ? "absence" : "tache", ordre[t.personne_id], noms[t.personne_id] + (t.est_absence ? " · absence" : ""), t);
  });
  return lignes.sort(function (a, b) { return a.rang - b.rang; }).map(function (l) { return l.texte; });
}

// ---- À réserver ----------------------------------------------------------
// Même statut que l'appli (statutAReserverCle_, a-reserver.js) : celui de
// clé « areserver », sinon le premier de la liste ; même regroupement
// (jours ouvrés qui se suivent = une tâche).
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
    if (g && g.k === cle(t) && (t.date === g.au || t.date === prochainJourOuvre(g.au))) { g.au = t.date; return; }
    g = { k: cle(t), du: t.date, au: t.date, qui: noms[t.personne_id], texte: t.texte || "(sans texte)" };
    groupes.push(g);
  });
  return groupes.sort(function (a, b) { return a.du < b.du ? -1 : a.du > b.du ? 1 : 0; });
}
function messageAReserver(groupes, nomStatut) {
  const lignes = groupes.map(function (g) { return dateCourte(g.du) + " · " + g.qui + " · " + g.texte; });
  return { titre: (nomStatut || "À réserver") + " : " + pluriel(groupes.length, "tâche"), corps: limiterLignes(lignes), tag: "a-reserver" };
}
function majuscule(t) { return t ? t.charAt(0).toUpperCase() + t.slice(1) : t; }

// ---- Plan d'un passage ---------------------------------------------------
// donnees : { abonnements, demandes (en attente, pas encore annoncées),
//   modifs [{session_id, derniere}], personnes (actives), chantiers,
//   statuts, taches / jalons / notes (importants d'aujourd'hui et demain),
//   aReserver (tâches avec statut, à partir d'aujourd'hui) }.
// Renvoie { envois: [{abonnement, message}], majAbonnements: [{id, …}],
//   demandesAnnoncees: [id], modifsTraitees: [session_id] }.
function planEnvois(d, maintenant) {
  const local = heureLocale(maintenant);
  const demain = decalerIso(local.iso, 1);
  const envois = [], majAbonnements = [];
  const noms = {};
  (d.personnes || []).forEach(function (p) { noms[p.id] = p.nom; });

  const demandes = (d.demandes || []).slice().sort(function (a, b) { return a.id - b.id; });
  const msgDemandes = demandes.length ? messageDemandes(demandes, noms) : null;

  const limite = maintenant.getTime() - CALME_MODIFS_MS;
  const modifsTraitees = (d.modifs || []).filter(function (m) { return new Date(m.derniere).getTime() <= limite; });
  const sessionsModif = modifsTraitees.map(function (m) { return m.session_id || ""; });
  const msgModifs = { titre: "Planning modifié", corps: "Des changements ont été faits sur un autre appareil.", tag: "modifs" };

  let impDemain = null, impAujourdhui = null, aReserver = null;
  const statut = statutAReserver(d.statuts);

  (d.abonnements || []).forEach(function (abo) {
    const maj = { id: abo.id };
    if (msgDemandes && typeActif(abo, "demandes")) envois.push({ abonnement: abo, message: msgDemandes });
    if (typeActif(abo, "modifs") && sessionsModif.some(function (s) { return !s || s !== (abo.session_id || ""); }))
      envois.push({ abonnement: abo, message: msgModifs });

    const hVeille = abo.heure_veille == null ? 18 : abo.heure_veille;
    if (local.heure >= hVeille && abo.derniere_veille !== local.iso) {
      maj.derniere_veille = local.iso;
      if (local.heure < hVeille + FENETRE_HEURES && typeActif(abo, "importants")) {
        if (!impDemain) impDemain = importantsDuJour(demain, d);
        if (impDemain.length) envois.push({ abonnement: abo, message: { titre: "Demain, " + dateCourte(demain).toLowerCase() + " : " + pluriel(impDemain.length, "important"), corps: limiterLignes(impDemain), tag: "veille" } });
      }
    }
    const hMatin = abo.heure_matin == null ? 7 : abo.heure_matin;
    if (local.heure >= hMatin && abo.dernier_matin !== local.iso) {
      maj.dernier_matin = local.iso;
      if (local.heure < hMatin + FENETRE_HEURES) {
        if (typeActif(abo, "importants")) {
          if (!impAujourdhui) impAujourdhui = importantsDuJour(local.iso, d);
          if (impAujourdhui.length) envois.push({ abonnement: abo, message: { titre: "Aujourd’hui : " + pluriel(impAujourdhui.length, "important"), corps: limiterLignes(impAujourdhui), tag: "matin" } });
        }
        if (typeActif(abo, "a_reserver")) {
          if (!aReserver) aReserver = groupesAReserver(d, local.iso);
          if (aReserver.length) envois.push({ abonnement: abo, message: messageAReserver(aReserver, statut ? majuscule(statut.nom) : null) });
        }
      }
    }
    if (Object.keys(maj).length > 1) majAbonnements.push(maj);
  });

  return {
    envois: envois,
    majAbonnements: majAbonnements,
    demandesAnnoncees: demandes.map(function (q) { return q.id; }),
    modifsTraitees: modifsTraitees.map(function (m) { return m.session_id; })
  };
}

export {
  heureLocale,
  decalerIso,
  dateCourte,
  importantsDuJour,
  groupesAReserver,
  messageDemandes,
  planEnvois,
};
