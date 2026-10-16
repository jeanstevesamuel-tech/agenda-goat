# Agenda Étoile — couche Android native (v2.1.8)

Cette couche Android remplace les limitations de la PWA pour les rappels :
- permission de notifications Android ;
- choix d'un fichier audio avec le sélecteur Android ;
- copie du son dans MediaStore pour fournir un URI stable au système ;
- canal de notification Android utilisant le son choisi ;
- programmation des rappels avec AlarmManager, avec alarme exacte si l'accès est accordé et repli contrôlé sinon ;
- annulation/reprogrammation des rappels quand une tâche change ;
- ouverture de la tâche depuis la notification.

## Build

Ouvrir le dossier `android/` dans Android Studio avec un SDK Android installé, puis lancer **Build > Build APK(s)**.

Le projet cible Android 35 et supporte Android 8.0+.

### Important pour les rappels exacts
Android 12+ peut exiger l'accès système « Alarmes et rappels ». Si cet accès n'est pas accordé, l'application utilise un rappel `setAndAllowWhileIdle`, qui peut être décalé par Android.

### Son personnalisé
Android verrouille le comportement sonore d'un canal après sa création. Agenda Étoile crée donc un nouveau canal lorsque l'utilisateur change de son et supprime l'ancien canal personnalisé. Les réglages que l'utilisateur change lui-même dans Android restent prioritaires.


## Diagnostic des rappels (v2.1.8)

- Les alarmes Android sont resynchronisées depuis les tâches enregistrées au démarrage de l'application.
- Pour une heure aussi précise que possible sur Android 12+, ouvrir Réglages > Applications > Agenda Étoile > Alarmes et rappels et autoriser les alarmes exactes si cette option est proposée. Sans cette autorisation, Android utilise un rappel inexact qui peut être retardé par le système.
- Autoriser aussi les notifications Android dans Réglages > Applications > Agenda Étoile > Notifications. Sans cette permission, une alarme peut se déclencher mais Android n'affichera pas la notification.
- Le mode « la veille à minuit » est fixé à 00:00 le jour précédant la tâche. Si ce moment est déjà passé quand la tâche est créée, le rappel n'est pas programmé ; l'application affiche un message signalant que l'heure choisie est passée.
- La PWA ouverte dans un navigateur ne peut pas garantir les alarmes lorsque le navigateur est fermé. Pour les alarmes en arrière-plan et application fermée, utiliser la version APK Android compilée et installée.
