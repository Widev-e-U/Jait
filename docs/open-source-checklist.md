# Jait — Open-Source Launch Checklist

Die vollständige Checkliste um das Jait-Repository public zu stellen und jait.dev als offizielle Seite zugänglich zu machen.

---

## Phase 1: Sicherheit & Secrets (BLOCKER)

### 1.1 Hardcoded private IPs aus Source entfernen

| Datei | Zeile | Problem |
|-------|-------|---------|
| `packages/gateway/src/config.ts` | :81 | `ollamaUrl` Default `http://192.168.178.60:11434` |
| `packages/gateway/src/config.ts` | :94 | `whisperUrl` Default `http://192.168.178.60:8178` |

**Fix:** Default auf `http://localhost:11434` / `http://localhost:8178` setzen. Private IP nur per `.env`.

### 1.2 .env.example prüfen
- [x] Keine echten Keys drin (nur Platzhalter `sk-proj-your-key-here`)
- [x] `.env` und `*.env` in `.gitignore`
- [ ] `OLLAMA_URL` Kommentar enthält `192.168.178.60` → ersetzen mit `localhost:11434`

### 1.3 Git-History-Scan

Keine `.env`-Dateien wurden jemals committed. Aber es gibt:
- Commits mit `192.168.178.60` in Source-Code (config defaults)
- Commits mit `GH_TOKEN` Handling-Fixes (Runtime, keine committed Secrets)

**Empfehlung:**
- [ ] `gitleaks detect --source .` lokal laufen lassen
- [ ] Falls Secrets gefunden → Credentials rotieren, dann `git filter-repo` oder BFG
- [ ] **Alternativ:** History komplett cleanen mit frischem Initial-Commit (einfacher, da du ohnehin auf v0.2 springen willst)

### 1.4 Entscheidung: History behalten oder neustart?

| Option | Pro | Contra |
|--------|-----|--------|
| **A: History squashen** | Sauber, kein Risiko, einfach | Verliert 460 Commits + Tags |
| **B: Filter-repo** | Behält History, entfernt nur Probleme | Aufwändiger, muss gründlich sein |
| **C: History behalten, nur aktuelle Fixes** | Am schnellsten | Alte private IPs in History sichtbar |

→ **Empfehlung:** Option A — squash zu einem "Initial open-source release" Commit. Du sprints auf v0.2, History ist intern ohnehin Agent-generiert. Tags für alte Versionen sind eh irrelevant für public.

---

## Phase 2: Code Cleanup

### 2.1 Private IPs / persönliche Daten im Code

| Datei | Problem | Aktion |
|-------|---------|--------|
| `packages/gateway/src/config.ts:81` | Ollama URL `192.168.178.60` | Default → `localhost` |
| `packages/gateway/src/config.ts:94` | Whisper URL `192.168.178.60` | Default → `localhost` |
| `packages/gateway/src/tools/network-tools.ts:113` | IP-Beispiel in Beschreibung | Ersetzen mit `192.168.1.100` oder generisch |
| `apps/web/src/lib/workspace-links.test.ts:27` | `jait.basenetwork.net` URL | Ersetzen mit `https://example.jait.dev` |
| `apps/web/src/lib/automation-repositories.test.ts` | `/home/jakob/` Pfade | Ersetzen mit `/home/user/` |
| `apps/web/src/lib/chat-image-url.test.ts` | `/home/jakob/` Pfade | Ersetzen mit `/home/user/` |
| `apps/web/src/lib/tool-call-body.test.ts:120` | `/home/jakob/jait` | Ersetzen mit `/home/user/project` |
| `apps/desktop/package.json:7` | `jakob@jait.dev` | OK — öffentliche Kontakt-Email, kann bleiben |

### 2.2 Docs aufräumen

**Entfernen oder nach `docs/internal/` verschieben:**
- [ ] `docs/deployment.md` — enthält SSH user, IP, Pfade → **entfernen oder stark sanitizen**
- [ ] `docs/deploy.md` — interne Deployment-Anleitung → entfernen
- [ ] `docs/sprint-12-notes.md` — internes Sprint-Log
- [ ] `docs/sprint-baselines.md` — interne Baselines
- [ ] `docs/agent-sprint-content-guide.md` — interner Guide für Agent-Sprints
- [ ] `docs/manager-task-planning.md` — internes Planungsdoc
- [ ] `docs/improvement-roadmap.md` — internes Roadmap
- [ ] `docs/implementation-plan.md` — enthält lokale Pfade
- [ ] `docs/vision-alignment-review.md` — internes Review (teilweise Deutsch)
- [ ] `docs/localstorage-audit.md` — internes Audit
- [ ] `docs/local-first-defaults.md` — internes Design-Doc
- [ ] `docs/icon-plan.md` — interner Plan
- [ ] `docs/my-rules.md` — persönliche Regeln
- [ ] `docs/screen-share-status.md` — interner Status
- [ ] `docs/testing.md` — veraltet (referenziert Python/pytest statt Bun/Vitest)

**Behalten (prüfen & aktualisieren):**
- [x] `docs/README.md` — gut als Basis, wird Root-README
- [ ] `docs/vision.md` — Sprint-Planung rausnehmen, nur Vision/Mission behalten
- [x] `docs/site/` — Landing Page, bleibt

### 2.3 .gitignore erweitern
- [ ] `apps/mobile/.expo/` hinzufügen
- [ ] Prüfen ob alle Build-Artifacts ignored sind

---

## Phase 3: Package Metadata & Versionierung

### 3.1 Version auf 0.2.0 bumpen

| Package | Aktuell | Neu |
|---------|---------|-----|
| `packages/gateway` | 0.1.137 | **0.2.0** |
| `packages/shared` | aktuell | **0.2.0** |
| `packages/api-client` | aktuell | **0.2.0** |
| `apps/web` | aktuell | **0.2.0** |
| Root `package.json` | aktuell | **0.2.0** |

### 3.2 Package.json Felder vervollständigen

Alle `package.json` brauchen:
- [ ] `author`: `"Jakob Wl <jakob@jait.dev>"`
- [ ] `license`: `"MIT"` (bereits in den meisten)
- [ ] `repository`: `{ "type": "git", "url": "https://github.com/JakobWl/Jait" }`
- [ ] `homepage`: `"https://jait.dev"`
- [ ] `keywords`: `["ai", "agent", "developer-tools", "local-first", "terminal", "coding-agent"]`
- [ ] `description` wo es fehlt (api-client, root)

---

## Phase 4: Community-Dateien erstellen

### 4.1 Root README.md
- [ ] `docs/README.md` → Root verschieben (oder erweitern)
- [ ] Logo/Banner oben
- [ ] Badges: MIT License, npm version, CI status, Downloads
- [ ] Screenshot / GIF vom Interface
- [ ] Features-Übersicht
- [ ] Quick Install (npm + Docker)
- [ ] Links zu Downloads, Docs, Contributing

### 4.2 Fehlende Dateien erstellen
- [ ] `CONTRIBUTING.md` — Wie man beiträgt, Setup, Code Style, PR-Prozess
- [ ] `CODE_OF_CONDUCT.md` — Standard Contributor Covenant
- [ ] `SECURITY.md` — Responsible Disclosure Policy
- [ ] `CHANGELOG.md` — Ab v0.2.0, vorherige Versions zusammenfassen

### 4.3 GitHub Templates
- [ ] `.github/ISSUE_TEMPLATE/bug_report.yml`
- [ ] `.github/ISSUE_TEMPLATE/feature_request.yml`
- [ ] `.github/PULL_REQUEST_TEMPLATE.md`
- [ ] `.github/FUNDING.yml` (optional, falls Sponsoring gewünscht)

---

## Phase 5: Infrastructure & DNS

### 5.1 Cloudflare — jait.dev erreichbar machen
- [ ] DNS Records prüfen: A/CNAME für `jait.dev` und `www.jait.dev`
- [ ] Aktuell zeigt jait.dev auf `192.168.178.53` (privat!) → **Öffentliche IP oder Cloudflare Tunnel**
- [ ] SSL/TLS auf "Full (Strict)" stellen
- [ ] Caching Rules für statische Assets
- [ ] Optional: Cloudflare Pages statt Self-Hosted (einfacher, kein eigener Server nötig)

### 5.2 Option: Site auf Cloudflare Pages oder GitHub Pages migrieren
- Einfacher als eigener nginx-Server
- Automatisches Deployment bei Push
- Kein Server-Management nötig
- `docs/site/index.html` → Cloudflare Pages oder GitHub Pages deployment

### 5.3 Gateway Demo-Instanz (optional)
- [ ] Falls eine öffentliche Demo gewünscht → separater Server mit Rate-Limiting
- [ ] Ansonsten nur Self-Host Anleitung

---

## Phase 6: Repository Public Stellen

### 6.1 Finaler Pre-Flight Check
- [ ] `gitleaks detect --source .` → clean
- [ ] `bun run typecheck` → clean
- [ ] `bun run test` → green
- [ ] `bun run lint` → clean
- [ ] Alle package.json metadata korrekt
- [ ] Keine private IPs in Source
- [ ] Keine internen Docs im Repo
- [ ] README sieht gut aus
- [ ] LICENSE vorhanden (MIT ✓)
- [ ] .env.example keine echten Werte

### 6.2 GitHub Repo-Settings
- [ ] Repository auf **Public** stellen
- [ ] Description setzen: "Local-first AI developer agent with terminal, filesystem, browser control, and automation"
- [ ] Topics: `ai`, `agent`, `developer-tools`, `typescript`, `local-first`, `coding-agent`
- [ ] Website: `https://jait.dev`
- [ ] Social Preview Image hochladen
- [ ] Discussions aktivieren (optional)
- [ ] Wiki deaktivieren (Docs sind im Repo)
- [ ] Vulnerability Alerts aktivieren
- [ ] Dependabot aktivieren
- [ ] Branch Protection für `main`: Require CI pass

### 6.3 npm Packages
- [ ] Prüfen ob `@jait/gateway`, `@jait/shared`, `@jait/web` auf npm public sind
- [ ] Package README auf npm ist aktuell

---

## Phase 7: Launch & Marketing

### 7.1 Release v0.2.0 erstellen
- [ ] Git Tag `v0.2.0`
- [ ] GitHub Release mit Changelog, Download-Links, Feature-Highlights
- [ ] Motivation: "First public open-source release"

### 7.2 Social Media Posts

**Reddit** (beste Subs für dieses Projekt):
- [ ] `r/programming` — "Show /r/programming: Jait – an open-source local-first AI coding agent"
- [ ] `r/selfhosted` — Self-Hosted AI Agent angle
- [ ] `r/LocalLLaMA` — Ollama-Integration hervorheben
- [ ] `r/webdev` — Developer tooling angle
- [ ] `r/opensource` — Open-source launch announcement

**LinkedIn:**
- [ ] Personal Post: Open-source Journey, was Jait kann, warum local-first
- [ ] Screenshots/GIF vom Interface
- [ ] Link zu GitHub + jait.dev

**Hacker News** (optional aber high-impact):
- [ ] "Show HN: Jait – Local-first AI developer agent (open source)"

**Twitter/X** (optional):
- [ ] Launch Tweet mit Demo-GIF

### 7.3 Post-Launch
- [ ] GitHub Stars/Issues monitoren
- [ ] Erste Issues labeln (`good first issue`, `help wanted`)
- [ ] Auf Feedback reagieren

---

## Zusammenfassung — Reihenfolge

```
1. ⬜ Secrets & IPs fixen (config.ts, .env.example, tests)
2. ⬜ Interne Docs entfernen/aufräumen
3. ⬜ Entscheidung: History squashen oder behalten?
4. ⬜ Version auf 0.2.0 bumpen
5. ⬜ Package metadata vervollständigen
6. ⬜ Root README, CONTRIBUTING, SECURITY, CHANGELOG erstellen
7. ⬜ GitHub Templates erstellen
8. ⬜ jait.dev öffentlich erreichbar machen (Cloudflare)
9. ⬜ Finaler Check (gitleaks, typecheck, test, lint)
10. ⬜ Repo public stellen
11. ⬜ v0.2.0 Release erstellen
12. ⬜ Reddit + LinkedIn Posts
```
