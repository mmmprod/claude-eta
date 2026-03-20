# Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the admin-export feature with tests and a standalone HTML dashboard for visualizing plugin health data.

**Architecture:** `/eta admin-export` dumps JSON with 6 sections (already done). Tests validate each section builder. Standalone HTML file uses drag-and-drop to load the JSON and render charts/tables — zero dependencies, no build pipeline.

**Tech Stack:** node:test (tests), vanilla HTML/CSS/JS (dashboard), Chart.js via CDN (charts)

---

### Task 1: Tests for admin-export

**Files:**
- Create: `tests/admin-export.test.js`

- [ ] **Step 1: Write tests for section builders**

Test all 6 section builders with synthetic data: health (uptime, stop_reasons, stale detection), eta_accuracy (aggregation, auto-disable logic), data_quality (distribution, coverage, time ratios, weekly volume), supabase (graceful offline), insights (passthrough), subagents (ratio, median, by_agent_type).

- [ ] **Step 2: Run tests**

Run: `npm run build && node --test tests/admin-export.test.js`
Expected: All pass

- [ ] **Step 3: Verify full suite still passes**

Run: `npm test`
Expected: 268+ pass (excluding dist-sync check)

### Task 2: HTML Admin Dashboard

**Files:**
- Create: `admin/dashboard.html`

- [ ] **Step 1: Design and build standalone HTML**

Single-file HTML with embedded CSS/JS. Drag-and-drop JSON loading. 6 sections matching the export schema. Dark theme, monospace aesthetic matching CLI tool identity. Chart.js CDN for sparklines/donuts.

- [ ] **Step 2: Test with real export data**

Open in browser, drop admin-export.json, verify all sections render.

### Task 3: Documentation

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add admin-export to CLAUDE.md**

Document the new command, the JSON schema sections, and the dashboard HTML location.
