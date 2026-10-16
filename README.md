# Agenda Étoile v2.1.4 (robustesse)

Appli de devoirs et de leçons pour élèves. HTML, CSS et JavaScript natifs, sans framework, sans build.

## Structure
- `index.html` : coquille de l'appli (avec une Content Security Policy stricte)
- `css/` : design system (`base.css`) puis composants, calendrier, tâches, fenêtres, responsive
- `js/` : un module par responsabilité (`state`, `storage`, `tasks`, `notifications`, `reminders`, `calendar`, `ui`, `validation`, `statistics`, `utils`, `strings.fr`)
- `sw.js`, `manifest.webmanifest`, `icons/` : installation et fonctionnement hors ligne
- `tests/` : 61 tests automatiques, un test de fumée de l'interface et des mesures de performance

## Mise en ligne (depuis Termux)
```
unzip agenda-etoile-v2.1.2.zip
cd agenda-etoile-v2.1.2
git add . && git commit -m "Agenda Étoile v2.1.2" && git push
```
Puis active GitHub Pages dans les réglages du dépôt. L'appli doit être servie en https : les modules JavaScript ne fonctionnent pas en ouvrant `index.html` directement depuis les fichiers.

## Tests et simulations
- `npm test` : 61 tests + contrôles de cohérence + test de fumée
- `npm run sim` : toutes les simulations d'affilée (moteur sur 120 000 actions avec horloge truquée, 16 fuseaux horaires dont Haïti, fuzz de 31 500 données, parcours de l'interface écran par écran, service worker, démarrage, audit CSS/HTML/manifeste)
- `node tests/perf.mjs` ou `/tests/perf.html` sur ton téléphone : temps avec 10 000 tâches
- `/tests/` dans le navigateur : la suite de tests, sans Node
Limite : tout cela tourne sous Node avec un faux DOM. Ça ne remplace pas un vrai téléphone.

## Données
Tout reste sur l'appareil (localStorage). Les données de la v1 sont migrées automatiquement et l'ancienne copie n'est jamais supprimée. Le bouton « Exporter » crée un fichier de sauvegarde.

## Rappels : ce qui est vrai
Le moteur décide si un rappel est **dû** sans dépendre d'aucune API expérimentale, puis tente l'affichage et enregistre le résultat (**livré** seulement si la tentative a réussi).
- Appli ouverte ou visible : notification système si autorisée, et message dans l'appli.
- Arrière-plan : comportement dépendant du navigateur.
- Appli cachée et aucune notification système possible : le rappel reste en attente et s'affiche dans l'appli si tu reviens pendant la tolérance de 10 minutes.
- Appli fermée : rien n'est promis. Au prochain lancement, un rappel non livré apparaît comme « manqué » avec Afficher / Ignorer.
- Un rappel fiable à minuit appli fermée demande une version Android native ou un serveur Web Push.

Règle de tolérance (identique partout), pour un rappel prévu à 21:05 : livré jusqu'à 21:15 inclus, « manqué » à partir de 21:15 et une milliseconde.

## Limites connues
- Les données sont dans localStorage (environ 430 octets par tâche) : la limite du navigateur, de l'ordre de 5 Mo, serait atteinte vers 10 000 tâches, bien au-delà d'un usage scolaire normal. Si l'enregistrement échoue, un bandeau et un message le disent et proposent d'exporter une sauvegarde ; un import trop gros est refusé et tes données actuelles sont conservées.
- Pas encore testé sur de vrais téléphones ni avec un lecteur d'écran.

## Historique
- 2.1.2 : corrections issues de la campagne de simulations (voir ci-dessous).
- 2.1.1 : une seule copie de récupération pour une base corrompue (les anciennes copies horodatées sont nettoyées), rappel différé quand aucun canal n'est disponible, alertes claires si le stockage est plein.
- 2.1.0 : retrait de Notification Triggers, distinction « dû » / « livré », versions synchronisées et vérifiées, retour immédiat quand on termine une tâche, calendrier plus sobre.
- 2.0.0 : refonte modulaire.

### Défauts trouvés par les simulations (2.1.2)
Rappel manqué affiché sur une tâche déjà terminée ; rappels manqués périmés jamais rangés ; note de 400 caractères avec retours à la ligne refusée si le navigateur renvoie des CRLF ; import d'un fichier sans version qui écrasait matières et types ; fichier d'une version future accepté ; troncature à 50 000 tâches non signalée ; recherche « maths » qui ne trouvait pas Mathématiques ; message « tout est terminé » absent après la dernière tâche du jour ; raccourci « Nouvelle tâche » qui n'ouvrait rien ; rechargement inutile de la page à la toute première installation ; anciens fichiers possibles dans le cache à l'installation d'une mise à jour ; une erreur d'interface pouvait arrêter les rappels suivants ; données d'un autre onglet écrasées ; textes sans style ; navigateurs sans `<dialog>` modal.


### 2.1.3
- Rappel personnalisable : choix d'un délai libre de 1 minute à 30 jours avant l'heure de la tâche.
- Validation et tests dédiés au rappel personnalisé.

### 2.1.4
Ajout d’un choix de son de notification dans Réglages. Le fichier audio est stocké localement et peut être remplacé ou retiré à tout moment. Dans une PWA, le navigateur ne permet pas de forcer le son système de la notification : la lecture personnalisée est donc disponible pour l’aperçu et l’intégration native devra gérer le canal de notification sonore dans l’APK final.

## Nouveautés 2.1.8

- Le calendrier permet de marquer une date comme **Test**, **Examen** ou **Évaluation** depuis la fiche du jour. Les dates sont colorées, légendées et conservées dans les données.
- L’onglet **Révision** regroupe les tâches et leçons par matière. Les notes saisies dans les tâches (pages, chapitres, ressources) sont affichées avec chaque élément.
- Les marqueurs du calendrier sont conservés dans les exports et restaurés lors de l’importation.
- Les anciennes données sans marqueurs restent compatibles.
