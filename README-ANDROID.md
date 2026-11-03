# Agenda Étoile — couche Android native (v2.1.9)

Cette couche Android remplace les limitations de la PWA pour les rappels :
- permission de notifications Android ;
- choix d'un fichier audio avec le sélecteur Android ;
- copie du son dans MediaStore pour fournir un URI stable au système ;
- canal de notification Android utilisant le son choisi ;
- programmation des rappels avec AlarmManager (alarme exacte, repli contrôlé sinon) ;
- annulation/reprogrammation des rappels quand une tâche change ;
- ouverture de la tâche depuis la notification ;
- export (sélecteur « Enregistrer sous ») et import (sélecteur de fichiers) des sauvegardes JSON.

## Obtenir l'APK sans ordinateur (GitHub Actions)

1. Envoie le projet sur GitHub (`git add -A && git commit -m "APK" && git push` depuis Termux).
2. Sur GitHub : onglet **Actions** > **Compiler l’APK Android** > **Run workflow**
   (le workflow démarre aussi tout seul quand un fichier de `android/` change).
3. Attends la coche verte (5 à 10 minutes), ouvre l'exécution, descends jusqu'à **Artifacts**
   et télécharge **AgendaEtoile-APK** (un zip contenant `AgendaEtoile-2.1.9-release.apk` et `-debug.apk`).
4. Décompresse, ouvre le `.apk` (le « release » de préférence) et autorise l'installation depuis cette source.

Si la compilation échoue, ouvre l'étape en rouge et envoie les 40 dernières lignes du journal.

## Signature

Par défaut l'APK est signé avec `android/app/agenda-etoile.jks` (mot de passe `agendaetoile`, alias `agenda`).
La signature reste la même d'une compilation à l'autre : une nouvelle version s'installe **par-dessus** l'ancienne
sans perdre les tâches. Ne change pas de clé après la première installation, sinon Android refusera la mise à jour
(il faudrait désinstaller, donc exporter ses données d'abord).

Clé personnelle (facultatif, recommandé si le dépôt est public) : crée une clé avec `keytool`, puis ajoute ces
secrets dans GitHub > Settings > Secrets and variables > Actions : `ANDROID_KEYSTORE_BASE64` (le `.jks` encodé avec
`base64 -w0`), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.

## Compiler avec Android Studio (si tu as un ordinateur)

Ouvrir le dossier `android/`. `gradle/wrapper/gradle-wrapper.properties` demande Gradle 8.9 et Android Studio le télécharge
tout seul (JDK 17, Android Gradle Plugin 8.6.1, compileSdk 35). Puis **Build > Build APK(s)**.
Le projet cible Android 35 et fonctionne à partir d'Android 8.0 (testé en conception pour Android 14).

## Rappels exacts
- Android 13 et plus (dont Android 14) : la permission `USE_EXACT_ALARM` est accordée à l'installation, aucun réglage manuel.
  (Si tu publies un jour sur Google Play, cette permission est réservée aux applis de réveil/agenda : à revoir à ce moment-là.)
- Android 12 / 12L : autoriser « Alarmes et rappels » dans Réglages > Applications > Agenda Étoile.
- Autoriser aussi les notifications Android. Sans cette permission, une alarme peut se déclencher sans afficher de notification.
- Sur certains téléphones (Tecno/HiOS, Infinix, Xiaomi, Huawei…), régler la batterie de l'appli sur **Sans restriction** et
  autoriser le **démarrage automatique**, sinon le système peut tuer l'appli et retarder les rappels.
- Le mode « la veille à minuit » est fixé à 00:00 le jour précédant la tâche. Si ce moment est déjà passé quand la tâche
  est créée, le rappel n'est pas programmé et l'application le signale.
- Les alarmes sont reprogrammées au redémarrage du téléphone, après une mise à jour de l'appli, quand l'accès aux alarmes
  exactes change, et à chaque ouverture de l'application.

## Son personnalisé
Android verrouille le comportement sonore d'un canal après sa création. Agenda Étoile crée donc un nouveau canal quand
l'utilisateur change de son et supprime l'ancien. Les réglages que l'utilisateur change lui-même dans Android restent prioritaires.

## Corrections apportées à la couche Android (révision « synchronisée »)
- `MainActivity` : trois méthodes du pont JavaScript s'appelaient elles-mêmes à l'infini (état des notifications, ouverture des
  réglages de notifications et d'alarmes) : plantage ou état « non pris en charge ». Appels désormais qualifiés.
- Les fichiers de l'appli sont servis en `https://appassets.androidplatform.net/assets/www/…` au lieu de `file://` :
  les modules JavaScript (`<script type="module">`) ne se chargent pas depuis `file://` dans une WebView (écran de démarrage bloqué).
  La navigation hors de l'appli est bloquée (liens externes ouverts dans le navigateur).
- Import de sauvegarde : le sélecteur de fichiers n'existait pas dans la WebView ; ajouté. Export : les liens `blob:` ne
  téléchargent rien dans une WebView ; l'export passe par le sélecteur « Enregistrer sous » Android (`saveFile`).
- Pas de service worker dans l'APK (les fichiers sont locaux ; évite qu'une ancienne copie en cache masque une mise à jour).
- Bouton Retour : ferme d'abord la fiche ou la fenêtre ouverte. Rotation / clavier : l'activité n'est plus recréée.
- Icône de notification : étoile monochrome (l'icône couleur s'affichait en carré blanc), couleur d'accent rose.
- Son personnalisé : type MIME forcé en `audio/*` pour que MediaStore accepte les fichiers sans type précis.
- Android 15 : retour du comportement d'affichage des versions précédentes (pas de bord à bord imposé).
- Gradle : version Gradle fixée (8.9), Java 17, signature stable, lint non bloquant, `gradle-wrapper.properties`.
- Workflow GitHub Pages : le projet Android n'est plus publié avec le site.
