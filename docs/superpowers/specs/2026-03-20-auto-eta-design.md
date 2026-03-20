# Auto-ETA Feature Design

Feature opt-in (`/eta auto on`) qui injecte une estimation de durée au début de la réponse de Claude, basée sur les données historiques du projet.

## Décisions de design

### Seuils ajustés (vs spec original)

- **Condition 3** : min 5 tâches du même type (pas 10). Aligné sur `CALIBRATION_THRESHOLD`. 5 points suffisent pour un IQR exploitable.
- **Condition 4** : high volatility = intervalle x1.5 + confidence 60% (pas exclusion). Debug et bugfix sont les types où l'ETA est le plus utile.
- **Condition 5** : "other" reste exclu. Le classifier n'est pas assez fin, pas un vrai type.

### Architecture : module `auto-eta.ts`

Pattern miroir de `detector.ts`. Module de décision pur (zéro I/O), appelé par le hook `on-prompt.ts`.

Deux fonctions exportées :

```typescript
export function checkDisableRequest(prompt: string): boolean
export function evaluateAutoEta(params: {
  prefs: UserPreferences;
  stats: ProjectStats;
  etaAccuracy: Record<string, { hits: number; misses: number }>;
  classification: string;
  prompt: string;
  taskId: string;
}): AutoEtaDecision
```

`AutoEtaDecision` est un union à 3 valeurs :

```typescript
export type AutoEtaDecision =
  | { action: 'inject'; injection: string; prediction: LastEtaPrediction }
  | { action: 'cooldown' }
  | { action: 'skip' }
```

Le hook orchestre les side-effects (I/O fichiers, save preferences) selon le `action` retourné. `evaluateAutoEta` ne fait aucun I/O.

### Accuracy tracking par classification

`ProjectData.eta_accuracy` est `Record<string, { hits: number; misses: number }>`.

Auto-disable par type quand `misses / total > 0.5` sur 10+ prédictions pour ce type. Dérivé à la volée depuis `eta_accuracy` — pas de champ `auto_eta_disabled_reason` dans les préférences.

`/eta auto` affiche l'accuracy par type avec statut clair.

### Guard bullshit detector

`extractDurations()` dans `detector.ts` pré-filtre par lignes : skip les lignes contenant le symbole horloge ou `[claude-eta` avant de passer au regex existant. Guard par ligne, pas sur le message entier.

## Data layer

### Types ajoutés (`src/types.ts`)

```typescript
export interface UserPreferences {
  auto_eta: boolean;
  prompts_since_last_eta: number;
  last_eta_task_id?: string;
}

export interface LastEtaPrediction {
  low: number;
  high: number;
  classification: string;
  task_id: string;
  timestamp: string;
}
```

### `ProjectData` modifié

```typescript
export interface ProjectData {
  // ... existant ...
  eta_accuracy?: Record<string, { hits: number; misses: number }>;
}
```

`loadProject()` normalise `eta_accuracy` à `{}` (comme `normalizeTask` pour les tasks).

### Store : 4 fonctions ajoutées (`src/store.ts`)

| Fonction | Fichier | Pattern |
|----------|---------|---------|
| `loadPreferences()` | `_preferences.json` | try/catch, défauts `{ auto_eta: false, prompts_since_last_eta: 0 }` |
| `savePreferences(prefs)` | `_preferences.json` | écriture directe |
| `setLastEta(prediction)` | `_last_eta.json` | écriture directe |
| `consumeLastEta()` | `_last_eta.json` | lire + supprimer (même pattern que `consumeLastCompleted`) |

### Fichiers de données

```
~/.claude/plugins/claude-eta/data/
  _preferences.json    # master switch + cooldown state
  _last_eta.json       # éphémère, consommé par on-stop
```

## Constantes exportées (`src/auto-eta.ts`)

```typescript
export const MIN_TYPE_TASKS = 5;
export const HIGH_VOL_INTERVAL_MULT = 1.5;
export const HIGH_VOL_CONFIDENCE = 60;
export const NORMAL_CONFIDENCE = 80;
export const MAX_INTERVAL_RATIO = 5;
export const COOLDOWN_INTERVAL = 5;
export const ACCURACY_MIN_PREDICTIONS = 10;
export const ACCURACY_MIN_RATE = 0.5;

export const CONVERSATIONAL_PATTERNS = /^(merci|thanks|ok|oui|yes|non|no|continue|go|sure|d'accord|parfait|cool|nice|got it|understood|tell me about|what is a |how does .{0,10} work)/i;

export const DISABLE_PATTERNS = /\b(stop|disable|remove|hide|arrête|désactive|enlève)\b.{0,20}\bauto.?eta\b/i;
```

## Decision flow dans `evaluateAutoEta`

Ordre exact :

1. **C1** : `prefs.auto_eta === true`
2. **C3** : `clsStats = stats.byClassification.find(classification)`, `clsStats.count >= MIN_TYPE_TASKS`
3. **C4** : si `clsStats.volatility === 'high'` alors mult = 1.5, conf = 60% ; sinon mult = 1, conf = 80%
4. **C5** : `classification !== 'other'`
5. **C6** : `prompt.length >= 20` ET `!CONVERSATIONAL_PATTERNS.test(prompt)`
6. **Interval check** : `high > low * MAX_INTERVAL_RATIO` alors skip
7. **Per-type accuracy** : `etaAccuracy[classification]` a 10+ prédictions ET misses/total > 0.5 alors skip
8. **Cooldown** : premier prompt du task (taskId change) OU `prompts_since >= COOLDOWN_INTERVAL`

Note : C2 (stats !== null) est vérifié par le hook avant l'appel. `evaluateAutoEta` reçoit `stats: ProjectStats` (non nullable).

Retour : `inject` (toutes conditions passent + cooldown OK), `cooldown` (conditions passent mais cooldown actif), `skip` (condition échouée).

## Hook `on-prompt.ts` — flux modifié

Flux existant (inchangé) :
1. readStdin
2. flushActiveTask (previous task)
3. consumeLastCompleted (recap)
4. loadProject + computeStats
5. create task + addTask + setActiveTask
6. build contextParts (recap + stats/cold-start)

Nouveau — Auto-ETA (après étape 6) :

7. loadPreferences()
8. checkDisableRequest(prompt) ?
   - oui : prefs.auto_eta = false, savePreferences, contextParts.push disable message
   - non : continue
9. evaluateAutoEta({ prefs, stats, classification, prompt, taskId, etaAccuracy: data.eta_accuracy })
10. switch decision.action :
    - inject : contextParts.push(injection), setLastEta(prediction), reset cooldown, savePreferences
    - cooldown : increment prompts_since_last_eta, savePreferences
    - skip : rien
11. respond(contextParts.join)

`stats` utilisé pour counts/intervalles est calculé à l'étape 4, AVANT ajout de la tâche en cours. `data.eta_accuracy` est le seul champ accédé depuis projectData.

## Self-check dans `on-stop.ts`

Dans `flushAndRecord()`, APRÈS le flush + setLastCompleted :

1. consumeLastEta() retourne lastEta ou null
2. Si lastEta est null alors skip
3. Si data est null alors skip
4. lastTask = data.tasks[dernier]
5. Si lastTask.task_id !== lastEta.task_id alors skip (mismatch)
6. Si lastTask.duration_seconds est null alors skip
7. hit = duration >= lastEta.low ET duration <= lastEta.high
8. data.eta_accuracy[lastEta.classification] avec init par défaut { hits: 0, misses: 0 }
9. Incrémenter hits ou misses
10. saveProject(data)

Pas de modification des préférences dans on-stop. L'auto-disable par type est dérivé depuis `eta_accuracy` par `evaluateAutoEta` à chaque invocation.

## Guard bullshit detector (`src/detector.ts`)

Pré-filter dans `extractDurations()` :

```typescript
const filteredText = text
  .split('\n')
  .filter(line => !line.includes('\u23F1') && !line.includes('[claude-eta'))
  .join('\n');
```

Puis exec le regex sur filteredText au lieu de text.

## Commande `/eta auto`

### CLI (`src/cli/eta.ts`)

Nouveau mode `auto` avec sous-arguments :

- `/eta auto` : statut (master switch + accuracy par type)
- `/eta auto on` : active auto_eta
- `/eta auto off` : désactive auto_eta

Affichage `/eta auto` (exemple) :

```
## Auto-ETA Status

Master switch: **enabled**

| Type     | Predictions | Accuracy | Status              |
|----------|-------------|----------|---------------------|
| bugfix   |          12 | 7/12 58% | active              |
| config   |           8 | -        | < 10 predictions    |
| feature  |           0 | -        | no data             |
```

### Command file (`commands/eta.md`)

Ajout de `auto` dans argument-hint.

## Injection format

```
[claude-eta auto-eta] At the very start of your response, display a single ETA line
in the SAME LANGUAGE as the user's prompt:
"(horloge) Estimated: [low]–[high] ([confidence]%, based on [count] similar [type] tasks)"
Adapt the word "Estimated" to the user's language.
Do not elaborate on it, do not caveat it, do not discuss it unless the user asks.
```

`fmtSec()` pour low/high. `clsStats.count` pour le count.

## Tests (32 total)

### `tests/auto-eta.test.js` (30 tests)

**checkDisableRequest (4 tests)**

1. "stop auto-eta" retourne true
2. "désactive l'auto eta" retourne true
3. "explain what eta means" retourne false
4. "what is the eta for this" retourne false

**evaluateAutoEta conditions (10 tests)**

5. C1 : auto_eta false retourne skip
6. C3 : < 5 tasks du type retourne skip
7. C3 : >= 5 tasks ne skip pas (positive)
8. C4 : high volatility retourne inject (pas skip)
9. C5 : classification "other" retourne skip
10. C6a : prompt < 20 chars retourne skip
11. C6b : prompt conversationnel retourne skip
12. Interval trop large (high > 5 fois low) retourne skip
13. Type auto-disabled (>50% miss sur 10+) retourne skip
14. Toutes conditions passent retourne inject, contient marqueur auto-eta

**High volatility values (1 test)**

15. Volatility "high" retourne confidence 60%, intervalle x1.5

**Cooldown (4 tests)**

16. Premier prompt (new task) retourne inject
17. 2ème prompt même tâche retourne cooldown
18. 5ème prompt (prompts_since = 4) retourne inject
19. Tâche change retourne reset puis inject

**Self-check accuracy (5 tests)**

20. Durée dans l'intervalle retourne hits++ pour le type
21. Durée hors intervalle retourne misses++ pour le type
22. 6 miss sur 10 retourne type auto-désactivé (evaluateAutoEta skip)
23. 5 miss sur 10 retourne reste actif (seuil >50% strict)
24. Fichier _last_eta.json absent retourne self-check skip silencieusement

**Store preferences (3 tests)**

27. load/save roundtrip
28. Fichier manquant retourne défauts
29. consumeLastEta retourne read + delete

**Format injection (1 test)**

30. Format complet : contient fmtSec(low), fmtSec(high), nom du type, count

### `tests/detector.test.js` (2 tests ajoutés)

25. Ligne avec symbole horloge ignorée, estimation sur autre ligne extraite
26. Ligne avec [claude-eta ignorée

## Fichiers modifiés/créés

| Fichier | Action |
|---------|--------|
| `src/types.ts` | Ajouter UserPreferences, LastEtaPrediction, modifier ProjectData |
| `src/store.ts` | Ajouter loadPreferences, savePreferences, setLastEta, consumeLastEta, normaliser eta_accuracy dans loadProject |
| `src/auto-eta.ts` | NOUVEAU : checkDisableRequest, evaluateAutoEta, constantes |
| `src/hooks/on-prompt.ts` | Orchestration Auto-ETA (étapes 7-10) |
| `src/hooks/on-stop.ts` | Self-check accuracy dans flushAndRecord |
| `src/detector.ts` | Pré-filter lignes plugin dans extractDurations |
| `src/cli/eta.ts` | Mode auto (status/on/off) |
| `commands/eta.md` | Ajout auto dans argument-hint |
| `CLAUDE.md` | Ajout Auto-ETA dans Key modules |
| `tests/auto-eta.test.js` | NOUVEAU : 30 tests |
| `tests/detector.test.js` | 2 tests ajoutés |

## Contraintes

- Zéro nouvelle dépendance
- Ne pas toucher on-tool-use.ts ni _active.json (hot path)
- Backward compat : _preferences.json manquant = défauts, ProjectData sans eta_accuracy = {}
- normalizeTask() inchangé (pas de nouveau champ sur TaskEntry)
- Tous les tests existants passent
- Build propre (npm run build et npm run lint)
