<p align="center">
  <img src="https://github.com/user-attachments/assets/5f973f0a-f720-40c9-8046-f55371ededf9" alt="claude-eta" width="720" />
</p>

<p align="center">
  <a href="https://github.com/mmmprod/claude-eta/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT License" /></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen?style=flat-square&logo=node.js&logoColor=white" alt="Node >= 18" /></a>
  <a href="https://claude.com"><img src="https://img.shields.io/badge/Claude_Code-plugin-D97757?style=flat-square&logo=claude&logoColor=white" alt="Claude Code Plugin" /></a>
  <img src="https://img.shields.io/badge/data-100%25_local-222?style=flat-square&logo=shield&logoColor=white" alt="100% Local" />
  <a href="https://github.com/mmmprod/claude-eta/stargazers"><img src="https://img.shields.io/github/stars/mmmprod/claude-eta?style=flat-square&color=yellow" alt="Stars" /></a>
</p>

<h3 align="center">Claude guesses. claude-eta measures.</h3>

<p align="center">
  Tracks real task durations. Learns your velocity. Feeds real data<br/>
  back into Claude so it stops hallucinating time estimates.
</p>

---

Claude says *"this should take about 2 days."* You finish in 12 minutes. Every time.

claude-eta fixes this by building a feedback loop that doesn't exist: it times every task, counts every tool call, and feeds that data back to Claude before it responds.

## Install

```bash
claude plugin marketplace add mmmprod/claude-eta
claude plugin install claude-eta
```

No account. No API key. No config. Just start working.

### Update

```bash
claude plugin update claude-eta@claude-eta
```

## How it works

1. You type a prompt
2. claude-eta classifies it, starts a timer, injects your velocity stats
3. Claude works. Tool calls, file ops, errors are counted silently.
4. Task completes. Duration recorded. Next estimate improves.

After ~5 tasks, Claude gets your real numbers instead of guessing. When it still says something absurd, the bullshit detector catches it and corrects inline.

**Continuation detection** — short acknowledgements ("ok", "continue", "vas-y") don't reset the timer. The active turn stays alive and the estimate refines in real time based on the current phase (explore → edit → validate → repair loop).

9 hooks track the full lifecycle — including tool failures, subagents, and session end. Data is append-only JSONL, isolated per session and agent.

## Commands

| Command | Description |
|---|---|
| `/eta` | Session stats |
| `/eta history` | Last 20 tasks with real durations |
| `/eta stats` | Averages by task type |
| `/eta insights` | Deep patterns in your task data (9 analyses) |
| `/eta compare` | Read-only comparison against community baselines |
| `/eta contribute` | Preview anonymized data to share |
| `/eta contribute --confirm` | Upload (opt-in) |
| `/eta export` | Save anonymized data locally |
| `/eta inspect` | See exactly what's stored |
| `/eta auto` | Auto-ETA status and accuracy |
| `/eta auto on/off` | Toggle automatic ETA injection |
| `/eta community` | Community sharing status and consent flow |
| `/eta community on` | Explicitly allow manual anonymized uploads |
| `/eta community off` | Explicitly stay local-only |
| `/eta recap` | Today's daily journal |
| `/eta help` | All commands |

## Help the algorithm

The estimation engine improves with data. Three ways to help:

1. **Use it.** Every task makes your local estimates better.
2. **`/eta contribute --confirm`** shares anonymized per-task records only after the user enables community sharing with `/eta community on`: task type, duration, tool/file counts, model name, hashed project/contributor IDs. No code, no prompts, no file paths.
3. **Open an issue** when an estimate is way off.

## Privacy

**100% local by default.** No cloud, no telemetry, no tracking.

Data lives under `${CLAUDE_PLUGIN_DATA}` (or `~/.claude/plugins/claude-eta/` for local dev). Project identity uses `sha256(realpath(cwd))` — two projects named `app` in different directories never collide.

`/eta inspect` to see everything. `/eta export` to review before sharing.

On first use, claude-eta starts local-only. When community features become relevant, the CLI makes the choice explicit: run `/eta community off` to confirm you want to stay private, or `/eta community on` to allow manual anonymized uploads.

Community features are split:

- `compare` is read-only and does not upload your data
- `contribute` stays blocked until the user enables sharing with `/eta community on`

[Details below.](#community-baselines)

## Roadmap

| Layer | Status | What |
|---|---|---|
| 0 — Feedback Loop | Shipped | Task timing, classification, per-session recalibration |
| 1 — Static Estimation | Shipped | Shrinkage quantile intervals, complexity scoring |
| 2 — Live Refinement | Shipped | Phase-aware remaining-time estimates, continuation detection, elapsed subtraction |
| 3 — Collective Intelligence | Shipped | Opt-in community baselines via `/eta contribute`, server-side dedup |
| 4 — Deep Insights | Shipped | 9 correlation/breakdown/temporal analyses |
| BS Detector | Shipped | Catches absurd time claims using classification-specific baselines |
| Auto-ETA | Shipped | Opt-in automatic ETA injection with accuracy self-check |
| v2 Architecture | Shipped | Append-only JSONL, per-session isolation, 9 hooks, subagent support |

## Community baselines

`/eta compare` fetches anonymous community averages (read-only, no upload). The first time community features become relevant, the CLI also shows the local-only vs opt-in choice clearly, but the compare request itself never uploads anything.

`/eta contribute` previews what would be sent. Nothing leaves your machine until you both enable sharing with `/eta community on` and run `/eta contribute --confirm`. If you prefer to stay private, `/eta community off` makes that choice explicit and keeps uploads blocked.

**Sent:** task type, duration, tool/file counts, normalized model name, project hash, contributor hash, dedup key, plugin version, error count. Run `/eta export` to see the exact payload.

**Never sent:** prompts, file paths, project names, code.

**Dedup:** each record carries a `dedup_key` (sha256 of contributor + task ID). Retries, second machines, or local state resets won't create duplicates — the server rejects them via a unique index.

## Maintainer infra

This section is only needed if you run the shared community baseline backend.

### GitHub Actions secrets

The workflow [`refresh-baselines.yml`](./.github/workflows/refresh-baselines.yml) requires these repository secrets:

| Secret | Purpose |
|---|---|
| `SUPABASE_FUNCTION_URL` | Supabase Edge Functions base URL, for example `https://<project-ref>.supabase.co/functions/v1` |
| `SUPABASE_ANON_KEY` | Supabase anon key used as the JWT bearer token when calling the Edge Function |
| `REFRESH_SECRET` | Shared secret sent in the `x-refresh-secret` header |

### Edge Function environment

The Edge Function [`supabase/functions/refresh-baselines/index.ts`](./supabase/functions/refresh-baselines/index.ts) also needs these runtime variables in Supabase:

| Secret | Purpose |
|---|---|
| `REFRESH_SECRET` | Must match the GitHub Actions `REFRESH_SECRET` value |
| `SUPABASE_SERVICE_ROLE_KEY` | Used by the function to run the `refresh_baselines()` RPC |
| `SUPABASE_URL` | Provided automatically by Supabase in the function runtime |

### Manual verification

After deploying the SQL schema and the `refresh-baselines` Edge Function:

1. Run the `Refresh community baselines` workflow manually with `workflow_dispatch`.
2. Confirm the GitHub Actions job succeeds.
3. Query the public cache endpoint and check that rows exist and `computed_at` moved forward:

```bash
curl 'https://<project-ref>.supabase.co/rest/v1/baselines_cache?select=task_type,project_loc_bucket,model,sample_count,computed_at&order=computed_at.desc'
```

If the workflow succeeds but `baselines_cache` is still empty, that usually means there are not enough recent rows in `velocity_records` yet. The current SQL only materializes:

- task-level baselines with at least 10 records in the last 90 days
- task + project size baselines with at least 5 records in the last 90 days

## Troubleshooting

| Problem | Fix |
|---|---|
| `command not found: claude` | [Install Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview) |
| `/eta` shows nothing | Normal on first use. Complete a few tasks first. |
| `/eta contribute` fails with `dedup_key` error | Run the Supabase migration `20260321_dedup_key.sql` on your instance |
| Plugin not in `claude plugin list` | `claude plugin marketplace update claude-eta && claude plugin update claude-eta@claude-eta` |
| Need latest version | Same command as above, then restart Claude Code |

## Contributing

```bash
git clone https://github.com/mmmprod/claude-eta && cd claude-eta
npm install && npm run build && npm test
```

**Code:** better heuristics, new hooks, edge cases. PRs with tests preferred.

**Data:** `/eta contribute --confirm` after a few sessions. More data = better baselines for everyone.

The [Roadmap](#roadmap) shows what's next.

## License

MIT

---

<p align="center">
  <sub>Built by <a href="https://github.com/mmmprod">@mmmprod</a> &middot; Claude guesses. We measure.</sub>
</p>
