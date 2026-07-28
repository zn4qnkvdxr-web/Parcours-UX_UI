# Parcours UX/UI — suivi partagé

Page unique de suivi d'un parcours de montée en compétence.
Contenu figé dans un fichier JSON, progression stockée côté serveur, deux niveaux d'accès pilotés par l'URL.

```
index.html        la page
parcours.json     le contenu — le seul fichier à modifier au quotidien
api/progress.js   lecture / écriture de la progression
vercel.json       en-têtes (pas d'indexation)
```

Pile volontairement nue : HTML, CSS et JavaScript natifs, aucune dépendance npm, aucune étape de build.

---

## 1. Déploiement

### 1.1 Créer le projet

Pousser le dossier sur GitHub, puis l'importer dans Vercel (**Add New → Project**).
Aucun réglage de build : Vercel sert les fichiers statiques et expose `api/progress.js` comme fonction.

### 1.2 Brancher le stockage

Vercel KV n'existe plus en produit maison ; l'équivalent passe désormais par le Marketplace.

- Dashboard du projet → **Storage** → **Marketplace** → **Upstash for Redis** → **Connect**
- ou en ligne de commande : `vercel install upstash`

L'intégration injecte automatiquement les identifiants dans le projet.
Selon son millésime, les variables s'appellent `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`
ou `KV_REST_API_URL` / `KV_REST_API_TOKEN` — la fonction accepte les deux jeux de noms.

Le palier gratuit d'Upstash (256 Mo, 500 000 commandes par mois) est très au-delà de cet usage.

### 1.3 Déclarer le jeton d'écriture

**Settings → Environment Variables** → ajouter `EDIT_TOKEN`.

Générer une valeur longue et non devinable :

```bash
openssl rand -hex 16
```

Redéployer après avoir ajouté les variables — elles ne sont lues qu'au démarrage de la fonction.

### 1.4 Vérifier

```bash
curl "https://<projet>.vercel.app/api/progress?p=<slug>"
# → {"checked":{},"links":{},"updatedAt":null}
```

---

## 2. Les deux liens

Le slug est déduit du sous-domaine : un projet nommé `parcours-<nom>` sert automatiquement le parcours `<nom>`. Aucun paramètre à ajouter pour la lecture.

| Usage | Lien | Droits |
|---|---|---|
| Suivi, référents | `https://parcours-<nom>.vercel.app/` | lecture, rafraîchi toutes les 45 s |
| Personne accompagnée | `https://parcours-<nom>.vercel.app/<EDIT_TOKEN>` | lecture et écriture |

Le lien d'édition place le jeton dans le chemin. La racine, elle, reste propre et diffusable — elle ne contient jamais le jeton.

**Réutilisation.** Pour une nouvelle personne, déployer un projet nommé `parcours-<autre-nom>` : le slug suit tout seul, sans toucher au code. Un déploiement par personne, même base de code.

**Ce que le jeton protège vraiment.** L'écriture est vérifiée côté serveur par comparaison à durée constante : sans jeton valide, aucune modification n'est acceptée. La lecture reste ouverte à qui détient l'adresse racine. Adapté à un partage interne, insuffisant pour des données sensibles.

Repli local : hors Vercel (fichier ouvert directement), l'ancienne forme `?p=<slug>` et `?k=<jeton>` reste active pour les tests.

---

## 3. Modifier le contenu

Tout se passe dans `parcours.json`. Commit, push, Vercel redéploie.

```json
{
  "id": "e2",
  "titre": "Famille de composants",
  "semaine": "Semaine du 10 août",
  "jalon": "Quatre à cinq composants réutilisables, dont un composé.",
  "taches": [
    { "id": "e2-decliner", "texte": "Décliner les composants d'une page" }
  ]
}
```

**Règle unique : les `id` sont la mémoire de la progression.**

- Ajouter une tâche → nouvel objet, nouvel `id`. Les coches existantes ne bougent pas.
- Retirer une tâche → supprimer l'objet. Sa coche est ignorée.
- Renommer un libellé (`texte`) → sans effet sur les coches.
- **Ne jamais réutiliser ni renommer un `id` déjà publié** : la coche suivrait le mauvais élément.

Une étape est validée quand toutes ses tâches sont cochées. Le compteur, la barre et la chaleur du fond en découlent — rien à mettre à jour à la main.

---

## 4. Fonctionnement

- **Enregistrement** groupé 800 ms après la dernière action, pas à chaque clic. Une pastille en bas d'écran signale l'état.
- **Concurrence** : dernière écriture gagnante. Un seul éditeur, donc sans conséquence.
- **Stockage indisponible** : la page reste consultable et manipulable, la pastille affiche « Hors ligne ». Rien n'est perdu côté serveur.
- **Sanitation** : la fonction ne conserve que des booléens et des chaînes courtes. Ce qui arrive du navigateur n'est jamais réinjecté tel quel.

---

## 5. Plan Vercel

Le plan Hobby est gratuit et couvre techniquement cet usage sans difficulté, mais il est réservé à un usage personnel non commercial. Un outil interne d'entreprise, produit sur temps salarié, relève du plan Pro.

Trois voies : rattacher le projet à une équipe Vercel déjà existante ; ouvrir un plan Pro ; ou héberger ailleurs. Le code est identique dans tous les cas.

---

## 6. Réutiliser le squelette

Le patron ne dépend pas du contenu : une coquille statique, une variable d'URL qui désigne l'instance, une fonction qui lit et écrit un document JSON.

Pour un nouveau parcours : nouveau slug, rien d'autre.
Pour un autre usage : remplacer `parcours.json` et les libellés de `index.html`.

---

## 7. Recette

`TNR-parcours.xlsx` — campagne de non-régression, 63 cas répartis sur dix domaines, à rejouer avant chaque mise en production.

Quatre onglets : mode d'emploi, matrice de couverture (9 configurations), cas de test, synthèse calculée.
Trois colonnes de statut par cas — Mobile, Tablette, Desktop — avec liste déroulante et mise en évidence automatique. Les cellules grisées marquent les cas hors périmètre pour la classe concernée.

Règle de sortie : un seul KO sur un cas P1 interdit la mise en production.

**Toujours utiliser un slug de recette dédié.** La campagne écrit et efface des données ; la lancer sur un parcours réel effacerait une progression.

Passe complète environ 2 h, passe courte (cas P1 seuls) environ 45 min.
