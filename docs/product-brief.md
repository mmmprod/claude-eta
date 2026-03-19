# Product Brief — claude-eta

## Vision

Plugin Claude Code qui prédit combien de temps une tâche va prendre, basé sur l'analyse du projet et l'historique réel des sessions passées.

## Problème

Personne ne sait combien de temps une tâche va prendre avec Claude Code. Ni l'utilisateur, ni l'IA. Résultat : pas de planification possible, pas de visibilité sur la charge.

## Cible

Tous les utilisateurs Claude Code — devs solo, équipes, freelances.

## MVP — Phase 1 : Tracking

Avant de prédire, il faut des données. Le MVP track automatiquement :

- **Durée réelle** de chaque tâche (du prompt utilisateur à la complétion)
- **Métriques projet** au moment de la tâche (LOC, fichiers touchés, tech stack)
- **Classification tâche** (feature, bugfix, refactor, config, docs, review)
- **Complexité observée** (nombre de tool calls, fichiers lus/édités, erreurs)

### Commandes MVP

| Commande | Action |
|----------|--------|
| `/eta` | Affiche stats de la session en cours |
| `/eta history` | Historique des tâches passées avec durées |
| `/eta stats` | Moyennes par type de tâche sur ce projet |

### Données trackées par tâche

```json
{
  "task_id": "uuid",
  "project": "nom-du-projet",
  "timestamp": "ISO",
  "prompt_summary": "refactor composant X",
  "classification": "refactor",
  "duration_seconds": 342,
  "tool_calls": 18,
  "files_read": 7,
  "files_edited": 3,
  "files_created": 1,
  "errors": 0,
  "model": "opus-4.6",
  "loc_changed": 156
}
```

## Phase 2 : Prédiction (post-MVP)

Quand assez de données locales existent :
- Heuristiques par type de tâche × taille projet
- Affichage d'une estimation avant de démarrer le travail

## Phase 3 : Données communautaires (futur)

- Opt-in anonyme : partage des métriques agrégées (pas de code, pas de prompts)
- Backend léger : moyennes par (type_tâche, tech_stack, taille_projet, modèle)
- Prédictions cross-projets basées sur la communauté

## Monétisation

- **Gratuit** : tracking local + prédiction locale + données communautaires
- **Payant (futur)** : GUI dashboard, analytics avancés, intégrations (Jira, Linear)

## Stack technique

- Plugin Claude Code (hooks + skills + commands)
- TypeScript / Node.js >= 18
- Stockage local JSON/SQLite
- Pas de dépendances externes pour le MVP

## Nom

**claude-eta** — court, mémorable, SEO-friendly.
