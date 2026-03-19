---
stepsCompleted: [1, 2, 3, 4]
session_topic: 'claude-eta Phase 2 — Prediction engine + interception des mauvaises estimations LLM'
session_goals: 'Prédire les durées avec précision, intercepter/corriger les estimations foireuses de Claude, permettre aux utilisateurs de demander des timings calibrés'
selected_approach: 'progressive-flow'
techniques_used: ['Cross-Pollination', 'Morphological Analysis', 'Six Thinking Hats', 'Solution Matrix']
ideas_generated: 19
---

# Brainstorming Session — claude-eta Prediction Engine

**Date :** 2026-03-19
**Participant :** Mehdi
**Sujet :** Prédiction de durée de tâche + interception des estimations LLM

## Architecture — 4 Layers + Module Transversal

```
Layer 0 — Feedback Loop (Stop → recalibration)
Layer 1 — Estimation statique (T0 context + T1 triage score)
Layer 2 — Raffinement live (T2→T3 recalculation + splits)
Layer 3 — Intelligence collective (crowdsourced baselines)
Module transversal — Bullshit Detector (scan + annotation)
```

## Idées Clés

### Top 3 Différenciateurs
1. **#18 Pre-emptive Context Injection** — Calibrer Claude plutôt que le corriger
2. **#11 Confidence Intervals** — Intervalles qui se resserrent en live
3. **#17 Silent by Default** — Invisible quand tout va bien

### Catalogue Complet (19 concepts)

| # | Concept | Source | Score |
|---|---------|--------|-------|
| #18 | Pre-emptive Context Injection | Creative/Six Hats | 20/20 |
| #14 | Passive Velocity Context (T0) | Cross-Pollination | 19/20 |
| #9 | Composite Triage Score (APACHE-style) | Médecine | 17/20 |
| #11 | Confidence Intervals | Finance | 16/20 |
| #17 | Silent by Default | Risk analysis | 16/20 |
| #10 | Early Warning Score | Médecine | 14/20 |
| #8 | Split Phase Detection | Speedrun | 14/20 |
| #1 | Live ETA Recalculation | GPS/Waze | 13/20 |
| #6 | Live Split Comparison | Speedrun | 12/20 |
| #19 | Task Similarity Matching | Creative | 12/20 |
| #4 | Prompt Complexity Scoring | CI/CD | 12/20 |
| #16 | Auto-clustering vs labels | Risk analysis | 10/20 |
| #2 | Crowdsourced Velocity Dataset | GPS/Waze | 8/20 |

### Risques Identifiés
- **#15** Privacy/Trust — inspectable by default
- **#16** Classification noise — clustering > labels
- **#17** Notification fatigue — silent by default

## Plan d'Implémentation

### Vague 1 — Quick Wins
- P1: #18 Pre-emptive Context Injection (UserPromptSubmit → additionalContext)
- P2: #14 Passive Velocity Context (SessionStart)
- P3: #17 Silent by Default (design decision)

### Vague 2 — Core Prediction
- P4: #9 Composite Triage Score
- P5: #11 Confidence Intervals
- P6: Layer 0 recalibration enrichie

### Vague 3 — Live Refinement
- P7-P10: Phase detection, early warning, live recalc, splits UI

### Vague 4 — Intelligence (futur)
- P11-P13: Similarity matching, auto-clustering, crowdsourced
