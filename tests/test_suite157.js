const fs = require('fs');
const path = require('path');
const { verificateur } = require('./aide_tests');

// Round du 10.11.2026 (suite 157) — Lionel : « J'aimerai que la demande de
// congé n'apparaisse uniquement chez la personne qui emploie un ouvrier ».
// Ses choix : employeur = « Planning où il est affiché » ; l'absence
// acceptée « Partout, comme maintenant ».
// Vérifie :
//   A. sql/0048 : plannings où la personne est affichée (sinon
//      l'administrateur), policy des demandes, destinataires pour
//      envoyer-push, fonctions fermées aux comptes, rejouable.
//      (Comportement testé sur une copie locale de la base :
//      tests/sql/test_0048_demandes_chez_employeur.sql.)
//   B. envoyer-push (logic.js) : une demande n'est annoncée (et rappelée)
//      qu'aux plannings de sa personne ; sans destinataires, à tous comme
//      avant.
//   C. envoyer-push (index.ts) : destinataires lus par la clé de service,
//      sans bloquer l'envoi si la base n'est pas encore à jour.
//
// Lancer : node test_suite157.js

const RACINE = path.join(__dirname, '..');
const SQL = fs.readFileSync(path.join(RACINE, 'sql/0048_demandes_chez_employeur.sql'), 'utf8');

(async () => {
  const { verifier, bilan } = verificateur();

  // ---- A. sql/0048 --------------------------------------------------------------------------
  verifier(/where p\.actif and not coalesce\(l\.masque, p\.masque, false\)/.test(SQL) &&
    /where m\.role = 'admin' and not exists \(select 1 from affiches\);/.test(SQL) && /join plannings pl on pl\.entreprise_id = p\.entreprise_id/.test(SQL),
    'sql/0048 : plannings de l\'entreprise où la personne active est affichée (coche du planning, sinon la sienne) ; nulle part : l\'administrateur');
  verifier(/create policy "entreprise" on demandes_absence for all to authenticated\s+using \(entreprise_id = \(select mon_entreprise\(\)\) and demande_pour_moi_\(personne_id\)\)\s+with check \(entreprise_id = \(select mon_entreprise\(\)\)\);/.test(SQL) &&
    /select exists \(select 1 from plannings_de_la_personne_\(p_personne\) x where x = mon_planning\(\)\);/.test(SQL),
    'sql/0048 : un compte ne voit et ne traite que les demandes des personnes affichées dans son planning');
  verifier(/revoke all on function plannings_de_la_personne_\(bigint\) from public, anon, authenticated;\s+grant execute on function plannings_de_la_personne_\(bigint\) to service_role;/.test(SQL) &&
    /revoke all on function destinataires_demandes_\(\) from public, anon, authenticated;\s+grant execute on function destinataires_demandes_\(\) to service_role;/.test(SQL) &&
    /where q\.statut = 'en_attente'/.test(SQL),
    'sql/0048 : destinataires des demandes en attente pour la fonction serveur seule');
  verifier(!/^create (table|index|trigger)/m.test(SQL) && /drop policy if exists "entreprise" on demandes_absence;/.test(SQL) && !/est_absence/.test(SQL.replace(/^--.*$/gm, '')),
    'sql/0048 : rejouable ; les absences acceptées ne changent pas (visibles partout)');

  // ---- B. logic.js --------------------------------------------------------------------------
  {
    const src = fs.readFileSync(path.join(RACINE, 'functions/envoyer-push/logic.js'), 'utf8').replace(/export \{[\s\S]*?\};\s*$/, '');
    const L = new Function(src + '; return { planEnvoisParPlanning };')();
    const MAINTENANT = new Date('2026-09-30T12:00:00Z');
    // Rappel 1 jour avant : une demande du jeudi 1er octobre après-midi tombe sur le créneau du mercredi après-midi.
    const demande = (id, personne, debut) => ({ id, personne_id: personne, date_debut: debut, date_fin: debut, demi_debut: 'aprem', demi_fin: 'aprem', motif: 'Congé', type: 'nouvelle' });
    const base = (plus) => Object.assign({
      abonnements: [{ id: 1, planning_id: 'P1', session_id: 's1', reglages: { rappel_demandes: 1 } }, { id: 2, planning_id: 'P2', session_id: 's2', reglages: { rappel_demandes: 1 } }],
      demandes: [demande(5, 1, '2026-10-05'), demande(6, 2, '2026-10-06')],
      demandesEnAttente: [demande(7, 1, '2026-10-01'), demande(8, 2, '2026-10-01')],
      modifs: [], personnes: [{ id: 1, nom: 'Mathis', ordre: 1 }, { id: 2, nom: 'Paul', ordre: 2 }], chantiers: [], statuts: [], taches: [], jalons: [], notes: [], aReserver: [],
      horaires: [{ id: 1, date_debut: '2026-09-01', date_fin: '2026-12-17', matin_debut: '07:45:00', aprem_debut: '13:00:00', aprem_fin: '16:45:00' }], feries: [],
      creneaux: [{ cle: '2026-09-30:aprem', jour: '2026-09-30', demi: 'aprem' }]
    }, plus);
    // appareil:sorte:personnes nommées dans le message
    const resume = (plan) => plan.envois.map((e) => e.abonnement.id + ':' + e.message.tag + ':' +
      e.message.corps.split('\n').map((l) => l.split(' · ')[0]).sort().join('+')).sort().join(' | ');
    const p = L.planEnvoisParPlanning(base({ destinataires: [{ personne_id: 1, planning_id: 'P1' }, { personne_id: 2, planning_id: 'P2' }, { personne_id: '2', planning_id: 'P1' }] }), MAINTENANT);
    const seul = L.planEnvoisParPlanning(base({ destinataires: [{ personne_id: 1, planning_id: 'P1' }, { personne_id: 2, planning_id: 'P2' }] }), MAINTENANT);
    verifier(resume(seul) === '1:demandes:Mathis | 1:rappel-demandes-aprem:Mathis | 2:demandes:Paul | 2:rappel-demandes-aprem:Paul' &&
      JSON.stringify(seul.demandesAnnoncees) === '[5,6]',
      'demande et rappel annoncés au seul planning où l\'ouvrier est affiché ; toutes notées comme annoncées (' + resume(seul) + ')');
    verifier(resume(p) === '1:demandes:Mathis+Paul | 1:rappel-demandes-aprem:Mathis+Paul | 2:demandes:Paul | 2:rappel-demandes-aprem:Paul',
      'ouvrier affiché dans les deux plannings : sa demande arrive aux deux (' + resume(p) + ')');
    const avant = L.planEnvoisParPlanning(base({}), MAINTENANT);
    const aucun = L.planEnvoisParPlanning(base({ destinataires: [] }), MAINTENANT);
    verifier(resume(avant) === '1:demandes:Mathis+Paul | 1:rappel-demandes-aprem:Mathis+Paul | 2:demandes:Mathis+Paul | 2:rappel-demandes-aprem:Mathis+Paul' &&
      aucun.envois.length === 0 && JSON.stringify(aucun.demandesAnnoncees) === '[5,6]',
      'sans destinataires (base d\'avant 0048) : à tous, comme avant ; aucun destinataire : rien d\'envoyé (' + resume(avant) + ')');
  }

  // ---- C. index.ts --------------------------------------------------------------------------
  {
    const ts = fs.readFileSync(path.join(RACINE, 'functions/envoyer-push/index.ts'), 'utf8');
    verifier(/const destinataires = \(demandes\.length \|\| demandesEnAttente\.length\)\s+\? await admin\.rpc\("destinataires_demandes_"\)\.then\(\(r\) => \(r\.error \? null : r\.data\), \(\) => null\)\s+: \[\];/.test(ts) &&
      /horaires, feries, creneaux, destinataires \}, maintenant\);/.test(ts),
      'envoyer-push : destinataires lus (clé de service) seulement s\'il y a des demandes ; base pas à jour : comme avant');
  }

  process.exit(bilan([]));
})();
