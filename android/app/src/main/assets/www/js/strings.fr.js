// Tous les textes de l'appli. Pour ajouter une langue : copier ce fichier (strings.en.js…).
export const S = {
  app: 'Agenda Étoile',
  days: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'],
  daysShort: ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'],
  months: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
  monthsShort: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
  greeting: { morning: 'Bonjour', afternoon: 'Bon après-midi', evening: 'Bonsoir' },

  subjects: { anglais: 'Anglais', chimie: 'Chimie', algebre: 'Algèbre', geometrie: 'Géométrie', analyse_lineaire: 'Analyse linéaire', analyse_combinatoire: 'Analyse combinatoire', trigonometrie: 'Trigonométrie', statistiques: 'Statistiques', ec: 'Éducation à la citoyenneté (EC)', informatique: 'Informatique', physique: 'Physique', philosophie: 'Philosophie', espagnol: 'Espagnol', sport: 'Sport', bio_geo: 'Biologie / Géographie', francais: 'Français', sciences_sociales: 'Sciences sociales', creole: 'Créole', tp: 'Travaux pratiques (TP)', histoire_art: 'Histoire de l’art', echec: 'Échec', autre: 'Autre' },
  subjectEmoji: { anglais: '🌍', chimie: '🧪', algebre: '🔢', geometrie: '📐', analyse_lineaire: '📈', analyse_combinatoire: '🧩', trigonometrie: '📐', statistiques: '📊', ec: '🤝', informatique: '💻', physique: '⚛️', philosophie: '💭', espagnol: '🗣️', sport: '🏃', bio_geo: '🌱', francais: '📖', sciences_sociales: '🏛️', creole: '📝', tp: '🧰', histoire_art: '🎨', echec: '♟️', autre: '✨' },
  types: { homework: 'Devoir', lesson: 'Leçon', exam: 'Contrôle', project: 'Projet' },
  calendarEvents: { test_eval: 'Test d’évaluation', exam: 'Examen', remove: 'Retirer le marquage', marked: type => `Journée marquée : ${({test_eval:'test d’évaluation',test:'test d’évaluation',evaluation:'test d’évaluation',exam:'examen'})[type] || type}.` },
  review: { title: 'Programme de révision', intro: 'Choisis une matière. Agenda Étoile rassemble les cours, devoirs, contrôles et notes enregistrés pour cette matière.', choose: 'Choisir une matière', back: 'Toutes les matières', noItems: 'Aucune information enregistrée pour cette matière.', noNote: 'Aucune page ou ressource précisée.', items: n => `${n} élément${n > 1 ? 's' : ''} à revoir`, resources: 'Cours, pages et ressources', empty: 'Les éléments ajoutés comme tâches ou leçons apparaîtront ici automatiquement.' },
  priorities: { normal: 'Normal', important: 'Important', urgent: 'Urgent' },
  reminderModes: { eve0: 'La veille à minuit', eve18: 'La veille à 18h', same7: 'Le jour même à 7h', hour1: '1 heure avant (heure requise)', custom: 'Personnalisé… (heure requise)' },
  reminderNone: 'Pas de rappel',
  reminderStatus: { pending: 'En préparation', scheduled: 'Programmé', delivered: 'Envoyé', missed: 'Manqué', cancelled: 'Annulé' },

  nav: { today: 'Aujourd’hui', calendar: 'Calendrier', tasks: 'Tâches', progress: 'Progression', settings: 'Réglages' },
  actions: {
    add: 'Ajouter une tâche', addShort: 'Ajouter', save: 'Enregistrer', cancel: 'Annuler', delete: 'Supprimer', edit: 'Modifier',
    done: 'Marquer terminée', reopen: 'Rouvrir', close: 'Fermer', retry: 'Réessayer', show: 'Afficher', ignore: 'Ignorer',
    undo: 'Annuler', exportShort: 'Exporter', start: 'Commencer', update: 'Mettre à jour', showMore: 'Afficher plus', back: 'Retour'
  },

  today: {
    summary: (n, d, l) => `${n} tâche${n > 1 ? 's' : ''} · ${d} terminée${d > 1 ? 's' : ''} · ${l} restante${l > 1 ? 's' : ''}`,
    noTask: 'Aucune tâche aujourd’hui.', calm: 'Profite du calme.',
    sectionToday: 'Tâches du jour', late: 'À rattraper', upcoming: 'À venir',
    nothingUpcoming: 'Rien de prévu dans les 7 prochains jours.',
    allDone: 'Tout est terminé aujourd’hui. Bravo !'
  },
  missed: { title: 'Rappel manqué', body: 'Ce rappel était prévu quand l’appli était fermée.' },
  banner: {
    corrupt: 'Impossible de charger les données. Une copie de sécurité a été gardée sur cet appareil.',
    unavailable: 'Ce navigateur bloque l’enregistrement. Tes tâches seront perdues à la fermeture : exporte une sauvegarde.',
    saveFailed: 'Impossible d’enregistrer cette modification. Ce que tu vois n’est peut-être pas conservé.',
    offline: 'Hors connexion : tout fonctionne, tes données restent sur ton téléphone.',
    crash: 'Un problème est survenu à l’affichage.',
    update: 'Une nouvelle version est disponible.'
  },

  calendar: {
    prev: 'Mois précédent', next: 'Mois suivant', today: 'Aujourd’hui',
    monthProgress: (d, t) => `${d} sur ${t} terminée${d > 1 ? 's' : ''} ce mois-ci.`,
    monthEmpty: 'Rien de noté ce mois-ci. Touche un jour pour commencer.',
    cell: (label, open, done) => {
      const parts = [];
      if (open) parts.push(`${open} à faire`);
      if (done) parts.push(`${done} terminée${done > 1 ? 's' : ''}`);
      return parts.length ? `${label}, ${parts.join(', ')}` : `${label}, rien de noté`;
    }
  },
  day: {
    count: n => n === 0 ? 'Aucune tâche' : `${n} tâche${n > 1 ? 's' : ''}`,
    empty: 'Rien de noté pour ce jour.'
  },
  detail: { date: 'Date', time: 'Heure', priority: 'Priorité', reminder: 'Rappel', reminderCustomMinutes: 'Combien de minutes avant ?', note: 'Note', noNote: 'Aucune note', noTime: 'Toute la journée' },
  form: {
    newTitle: 'Nouvelle tâche', editTitle: 'Modifier la tâche', subject: 'Matière', type: 'Type', title: 'Titre',
    titlePh: 'Ex. Exercices chapitre 4', date: 'Date', time: 'Heure (facultatif)', priority: 'Priorité',
    reminder: 'Rappel', reminderCustomMinutes: 'Combien de minutes avant ?', note: 'Note (facultatif)', notePh: 'Pages, matériel, astuce pour réviser…'
  },
  tasks: {
    searchLabel: 'Rechercher une tâche', searchPh: 'Titre, matière ou note',
    filters: { all: 'Toutes', todo: 'À faire', done: 'Terminées', urgent: 'Urgentes' },
    none: 'Aucune tâche ne correspond.', emptyAll: 'Ta liste est vide. Note ton premier devoir.',
    count: n => `${n} résultat${n > 1 ? 's' : ''}`
  },
  progress: {
    week: 'Cette semaine', weekLine: (t, d) => `${t} tâche${t > 1 ? 's' : ''}, ${d} terminée${d > 1 ? 's' : ''}`,
    stars: 'Étoiles', level: n => `Niveau ${n}`, toNext: n => `Encore ${n} étoile${n > 1 ? 's' : ''} pour le niveau suivant`,
    maxLevel: 'Niveau maximum atteint. Bravo !', streak: 'Jours consécutifs', streakUnit: n => `${n} jour${n > 1 ? 's' : ''}`,
    top: 'Matière la plus active', topNone: 'Pas encore de données',
    rewards: 'Récompenses',
    levelNames: ['Petite étincelle', 'Apprenti', 'Explorateur', 'Super élève', 'Champion', 'Légende'],
    reward: { streak3: '3 jours consécutifs', done7: '7 tâches terminées', stars10: '10 étoiles', stars25: '25 étoiles' },
    unlocked: 'Débloquée', locked: 'À débloquer'
  },
  settings: {
    appearance: 'Apparence', theme: 'Thème', themes: { system: 'Système', light: 'Clair', dark: 'Sombre' },
    notifications: 'Notifications', permission: 'Autorisation',
    permStates: { granted: 'Autorisées', default: 'Non autorisées', denied: 'Bloquées', unsupported: 'Non disponibles' },
    permWhy: 'Les notifications servent uniquement à te rappeler tes devoirs et tes leçons.',
    permDenied: 'Elles sont bloquées. Autorise-les dans les réglages des notifications de l’application.',
    permUnsupported: 'Les notifications système ne sont pas accessibles dans cet environnement. Pour les activer, ouvre Agenda Étoile depuis une adresse HTTPS ou installe l’application sur ton téléphone. Tes tâches et rappels restent conservés dans l’appli.',
    enable: 'Activer les notifications', openSettings: 'Ouvrir les réglages des notifications', exactAlarm: 'Autoriser les rappels exacts', exactAlarmHelp: 'Sans cet accès, Android peut décaler légèrement un rappel.', remindersOn: 'Rappels', soundOn: 'Son et vibration', notificationSound: 'Choisis le son de la notification', notificationSoundNone: 'Son par défaut du téléphone', notificationSoundChoose: 'Choisir un son', notificationSoundChange: 'Changer le son', notificationSoundRemove: 'Retirer le son personnalisé', notificationSoundPreview: 'Écouter', notificationSoundHelp: 'Sélectionne un fichier audio depuis le sélecteur de fichiers de ton téléphone. Tu peux le changer à tout moment.', notificationSoundTooLarge: 'Ce fichier est trop volumineux. Choisis un son de 10 Mo maximum.', notificationSoundInvalid: 'Choisis un fichier audio compatible.', notificationSoundSaved: 'Son de notification enregistré.', notificationSoundRemoved: 'Son personnalisé retiré.', notificationSoundUnavailable: 'Le stockage audio local n’est pas disponible sur cet appareil.', test: 'Envoyer un rappel test',
    capOpen: 'Les rappels s’affichent quand l’appli est ouverte ou en arrière-plan, selon ton navigateur. Appli fermée, rien n’est garanti : un rappel manqué est signalé à ta prochaine ouverture.',
    calendar: 'Calendrier', firstDay: 'Premier jour de la semaine', firstDays: { 1: 'Lundi', 0: 'Dimanche' },
    data: 'Données', export: 'Exporter mes données', import: 'Importer une sauvegarde', reset: 'Réinitialiser les données',
    about: 'À propos', version: v => `Agenda Étoile, version ${v}`,
    aboutText: 'Tes données restent sur cet appareil. Rien n’est envoyé sur Internet.'
  },
  onboarding: {
    title: 'Bienvenue dans Agenda Étoile',
    lines: ['Organise tes tâches.', 'Suis ta progression.', 'Ne rate plus tes échéances.']
  },
  confirm: {
    resetTitle: 'Réinitialiser les données ?', resetBody: 'Toutes tes tâches et tes étoiles seront supprimées. Une copie de sécurité est gardée sur l’appareil.', resetOk: 'Tout supprimer',
    importTitle: 'Importer cette sauvegarde ?', importBody: (cur, inc) => `Tes ${cur} tâche${cur > 1 ? 's' : ''} actuelle${cur > 1 ? 's' : ''} seront remplacées par ${inc} tâche${inc > 1 ? 's' : ''}. Une copie de sécurité est gardée.`, importOk: 'Importer'
  },
  errors: {
    title: 'Écris le devoir ou la leçon (80 caractères maximum).',
    note: 'La note est trop longue (400 caractères maximum).',
    subject: 'Choisis une matière.', type: 'Choisis un type.', date: 'Choisis une date valide.', time: 'Cette heure n’est pas valide.',
    priority: 'Choisis une priorité.', reminder: 'Ce rappel n’est pas valide.', reminderNeedsTime: 'Pour ce type de rappel, choisis une heure pour la tâche.', reminderCustom: 'Choisis un délai entier entre 1 minute et 30 jours.',
    importFail: 'Importation impossible. Le fichier semble invalide.',
    importFuture: 'Ce fichier vient d’une version plus récente d’Agenda Étoile. Mets l’appli à jour, puis réessaie.', importEmpty: 'Ce fichier ne contient aucune tâche valide.',
    fatal: 'Impossible d’afficher cet écran.'
  },
  toast: {
    saved: 'Tâche enregistrée.', savedReminder: t => `Tâche enregistrée. Rappel prévu ${t}.`,
    reminderPassed: 'Tâche enregistrée. Le moment du rappel est déjà passé : commence dès aujourd’hui.',
    deleted: 'Tâche supprimée.', restored: 'Tâche rétablie.',
    praise: ['Bravo ! +1 étoile', 'Super travail ! +1 étoile', 'Encore une de faite ! +1 étoile', 'Tu assures ! +1 étoile'],
    doneNoStar: 'Tâche terminée.', levelUp: n => `Niveau supérieur ! Niveau ${n}`,
    saveFailed: 'Modification non enregistrée : espace insuffisant. Exporte une sauvegarde.',
    importNoSpace: 'Importation impossible : pas assez d’espace. Tes données actuelles sont conservées.',
    importedNotSaved: 'Importé, mais non enregistré sur cet appareil : exporte une sauvegarde.',
    exported: 'Sauvegarde téléchargée.', imported: n => `${n} tâche${n > 1 ? 's' : ''} importée${n > 1 ? 's' : ''}.`, importedDropped: (n, d) => `${n} tâche${n > 1 ? 's' : ''} importée${n > 1 ? 's' : ''}, ${d} ignorée${d > 1 ? 's' : ''} car invalide${d > 1 ? 's' : ''}.`,
    resetDone: 'Données réinitialisées.', notifOn: 'Notifications activées.', notifDenied: 'Notifications refusées. Tes tâches restent dans l’appli.',
    testSent: 'Rappel test envoyé.', testNeedsPermission: 'Autorise d’abord les notifications.', soundSaved: 'Son de notification enregistré.', soundRemoved: 'Son personnalisé retiré.', soundTooLarge: 'Le son doit faire 10 Mo maximum.', soundInvalid: 'Ce fichier n’est pas un son compatible.', soundUnavailable: 'Impossible d’enregistrer ce son sur cet appareil.'
  },
  notify: {
    tomorrow: 'pour demain', today: 'pour aujourd’hui', soon: 'bientôt',
    body: 'Un pas à la fois, tu vas y arriver.'
  },
  a11y: {
    markDone: t => `Marquer « ${t} » comme terminée`, nav: 'Navigation principale',
    monthTabs: 'Choisir un mois', closeSheet: 'Fermer la fenêtre', addTask: 'Ajouter une tâche',
    filters: 'Filtres', theme: 'Thème', firstDay: 'Premier jour de la semaine'
  }
};
