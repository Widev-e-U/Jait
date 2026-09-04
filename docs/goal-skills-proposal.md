# Konzeptvorschlag: Goal Skills für Jait

**Status:** Vorschlag ([PROPOSE] — siehe Abschnitt 6 für Entscheidungspunkte)
**Kontext:** Loop Engineering mit `/goal`-Skills (Claude-Code-Pattern) — Bewertung und Umsetzungsplan für Jait
**Verwandte Doku:** `docs/vision.md`, `docs/memory-model.md`, `docs/claude-code-learnings.md`

---

## 1. Executive Summary

Loop Engineering ist State of the Art: Agentic Systeme werden nicht mehr primär über bessere Prompts,
sondern über die Steuerung ihrer Iterationsschleife gebaut (Plan-Execute, Reflection, Evaluator-Optimizer,
Budgets, Stop-Kriterien — vgl. LangChain "The Art of Loop Engineering"; Anthropic "Building Effective Agents").
Claude Code hat mit `/goal` ein konkretes Produktmuster etabliert: eine session-scoped Completion Condition plus
ein kleiner Evaluator pro Turn, der "Met / Not yet met / Impossible" urteilt.

Korrektur (nachgeprüft): Eine ClawHub-Suche nach "goal" liefert sehr wohl einzelne Goal-Skills —
`write-goal` (Completion-Contract für Autonomous Mode formuliieren), `goal-runner` (Roadmap-Abarbeitung,
gekoppelt an Claude Codes eingebaute `/goal`-Stop-Hook), `codex-goal-decomposer`, dazu Produktivitäts-Skills
(`goal-tracker`, SMART/OKR-Helfer). Als *Kategorie* ist "Goal Skills" trotzdem kein etablierter
Community-Begriff — das benennen wir ehrlich. Das *Pattern* dahinter (Goal + Stop-Hook + Evaluator) ist
etabliert; die Kapselung der Loop-Policy direkt im Skill bleibt der neuere Teil, denn keins der verbreiteten
Skill-Formate (Anthropic Agent Skills, ClawHub/OpenClaw: `name`/`description`/`version`/`metadata`) hat Goal-
oder Loop-Policy-Felder — `goal-runner` verlagert die Policy stattdessen in den Plattform-Hook.

**Bewertung: Ja, für Jait sinnvoll anwendbar.** Begründung: Die harten Primitiven sind längst vorhanden —
Round-Budgets (`DEFAULT_TOOL_ROUND_CHECKPOINT = 64`, `ABSOLUTE_TOOL_ROUND_BUDGET = 200`),
Loop-Hardening (`CONVERGE_NUDGE_ROUND_STREAK = 12`, `FORCE_ANSWER_ROUND_STREAK = 24`,
`MAX_IDENTICAL_FAILURES_PER_CALL = 2`) und ein natürlicher Hook-Punkt nach jeder Tool-Runde
(`SteeringController.drain`, agent-loop.ts L3022). Was fehlt, ist genau die Goal-Schicht darüber:
keine Persistenz, kein Evaluator, keine semantischen Stop-Conditions. Empfehlung: stufenweise Einführung,
Phase 0 ist rein prompt-basiert und sofort testbar (siehe Abschnitt 4).

---

## 2. Begriffsdefinition

Das Ökosystem trennt bisher sauber zwei Dinge — Jait kann beide verbinden:

**Skill = Wissen.** Ein Skill kapselt Domänenwissen und Vorgehensweisen als Markdown (`SKILL.md` mit
YAML-Frontmatter: `name`, `description`, `requires`/`install`). Der Agent lädt ihn on-demand via `file.read`
und folgt den Instruktionen. Jait macht das bereits
(`packages/gateway/skills/`, Injektion als `<available_skills>`-Block in `skills/index.ts` L377,
Verwaltung via `skills.manage` in `tools/skill-tools.ts`).

**Loop = Steuerung.** Die Loop-Policy entscheidet, *wann* und *warum* eine Iterationsschleife weiterläuft,
stoppt oder eskaliert: Completion Conditions, Budgets, Evaluator-Verdicts, Stall-Erkennung. Das lebt im
Gateway, nicht in Textdateien — bei Claude Code als `/goal` plus Stop-Hooks, in Jait heute ausschließlich
als deterministische Konstanten in `agent-loop.ts`.

**Goal-Loop-Primitive im Gateway** (Baustein A): die Laufzeitmechanik — session-scoped Goal, Evaluator,
Verdicts, Stop-Bedingungen. Analogon zu Claude Code `/goal`, aber in Jaits Loop-Hardening integriert.

**Goal Skill** (Baustein B): ein Skill, der *Ziel + Erfolgskriterien + Loop-Policy* kapselt. Er lädt
Fachwissen (klassische Skill-Rolle) **und** setzt beim Start die Goal-Parameter der Session (`goal.set` aus
dem Skill-Body heraus). Damit bleibt der Skill standardkonform, die Policy wird aber deklarativ transportiert.

Kurz: **Baustein A ist der Motor, Baustein B ist die Bedienanleitung, die der Motor versteht.**

---

## 3. Konzept: Drei Bausteine

### A) Goal-Loop im Gateway (Claude-Code-`/goal`-Parallele)

**Funktionsumfang:**

- **Session-scoped Goal:** Genau ein aktives Goal pro Session/Thread, gesetzt via neue `goal.*`-Tools oder
  per Run-Parameter. Kein globaler Goal-Store in Phase 1.
- **Evaluator pro Turn:** Ein kleiner, billiger Agent-Call (Haiku-Klasse) nach jeder Tool-Runde (oder alle
  N Runden, siehe Guardrails), der gegen die Erfolgskriterien urteilt. Verdicts:
  - `met` → Loop stoppt ordentlich, Ergebnis + Goal-Status werden ausgegeben.
  - `not-yet-met` → Loop läuft weiter (Standard-Verdikt, konservativer Fallback bei unsicherem Urteil).
  - `impossible` → **Eskalation statt Auto-Delete**: Goal-Status `escalated`, Nutzer wird über Turn-Output
    und/oder Reminder informiert (Abweichung von Claude Code, das das Goal bei unrecoverable Errors löscht —
    bewusst, siehe Abschnitt 5).
- **Stall-Handling:** Kein Tool-Use über mehrere Runden → Loop stoppt, **Goal bleibt gesetzt** (wie
  Claude Code bei Stalls), Resume möglich.
- **Stop-Bedingungen:** Goal erfüllt, Budget erschöpft, Stall, `impossible`-Eskalation — das harte
  Round-Budget (`ABSOLUTE_TOOL_ROUND_BUDGET = 200`) bleibt in allen Fällen als letzter Backstop aktiv.
- **Statusanzeige:** Runde, Token-Spend und letzter Eval-Verdict laufen über `onEvent` in den Turn-Output —
  Nutzer sehen jederzeit, ob der Loop "auf ein Ziel hin" arbeitet.

**Konkrete Implementierungs-Punkte (aus der Capability-Map):**

1. **Hook-Punkt:** Nach jeder Tool-Runde, direkt neben `SteeringController.drain()`
   (`packages/gateway/src/tools/agent-loop.ts` L3022–3031). Dort fließen bereits Steering-Nachrichten in die
   History; der Eval-Verdict nutzt denselben Injektionsmechanismus (`[GOAL-CHECK] …` als System-Nachricht) —
   kein neuer Kanal nötig.
2. **Budget-Andockung:** `requestedRoundBudget`/`roundBudget`/`roundLimit` (agent-loop.ts L2828–2832).
   Das Goal ergänzt die budgetäre Stop-Bedingung um eine *semantische* — es kann den Loop früher stoppen,
   nie später als das Hardcap 200.
3. **Re-Use der Hardening-Mechanik:** `CONVERGE_NUDGE_ROUND_STREAK = 12` (Re-Anchoring nach 12
   fortschrittslosen Runden) und `FORCE_ANSWER_ROUND_STREAK = 24` (Tools entzogen) bleiben als
   Determinismus-Backstops aktiv und sind komplementär zum Evaluator: Der Evaluator urteilt semantisch,
   die Streak-Guards fangen das "ewige Weiterlesen" ohne Eval-Call. Ebenso unverändert:
   `MAX_TRANSPORT_RETRIES = 2`, `MAX_REPLAY_STEERINGS = 1`, `MAX_IDENTICAL_FAILURES_PER_CALL = 2`.
4. **Continuous-Modus:** `continuous = !maxRounds || maxRounds <= 0` (agent-loop.ts L2815) ⇒ unbegrenzt
   mit Checkpoints alle `roundBudget` Runden (L3002). Genau hier zahlt das Goal am meisten: Im
   Sub-Agent-Kontext (`agent.spawn`, `SUBAGENT_MAX_ROUNDS = 0`) ist das Goal die einzige *semantische*
   Abbruchbedingung. Der autonomCheckpointPrompt ("Reassess the original request …", L3007–3014) wird zum
   Vorbild für das Goal-Reminder-Prompt.

### B) Goal Skills als Frontmatter-Erweiterung

**Vorgeschlagene Felder** (alle optional, additiv zum bestehenden Frontmatter):

| Feld | Typ | Bedeutung |
|---|---|---|
| `goal` | string | Kurzform des Ziels (Wunschformulierung; Detaillierung im Skill-Body) |
| `success_criteria` | string[] | Messbare/maschinenprüfbare Kriterien — Eingabe für den Evaluator |
| `max_turns` | number | Goal-spezifisches Turn-Budget (≤ `ABSOLUTE_TOOL_ROUND_BUDGET`, wird ge-capped) |
| `escalate` | `user` \| `clear` | Verhalten bei Verdict `impossible` (Default: `user`) |
| `on_stall` | `stop` \| `continue` | Verhalten bei Stall (kein Tool-Use) (Default: `stop`, Goal bleibt) |
| `on_failure` | `checkpoint` \| `discard` | Verhalten bei Budget-Erschöpfung (Default: `checkpoint` via `memory.save`) |

**Beispiel-SKILL.md:**

```markdown
---
name: goal-driven-refactor
description: Führt eine Refactoring-Aufgabe mit explizitem Ziel, messbaren
  Erfolgskriterien und hartem Turn-Budget aus. Nutzen, wenn eine Aufgabe
  "nachweisbar fertig" sein soll, bevor der Loop stoppt.
goal: "Modul src/legacy/api.ts nutzt keine deprecated API mehr"
success_criteria:
  - "grep -rn 'deprecatedFn' src/ liefert 0 Treffer"
  - "npm test im Projekt ist grün"
  - "CHANGELOG-Abschnitt aktualisiert"
max_turns: 40
escalate: user
on_stall: stop
on_failure: checkpoint
---

# Goal-driven Refactoring

1. Rufe `goal.set` mit dem Ziel und den success_criteria aus dem Frontmatter
   auf (wörtlich übernehmen, nicht paraphrasieren).
2. Vor jeder Fortsetzung: prüfe die Erfolgskriterien gegen den aktuellen Stand.
   Nenne das nächste unvollständige Kriterium laut.
3. Hake jedes erfüllte Kriterium im Session-Todo ab und sichere den Stand
   mit `memory.save` (Checkpoint).
4. Erhältst du `[GOAL-CHECK] not-yet-met`, fahre mit dem kleinsten nächsten
   Schritt fort. Bei `impossible`: stoppe und erkläre dem Nutzer den Blocker.
```

**Ablageorte** (bestehende Jait-Konvention): `~/.jait/skills/` (nutzerweit),
`packages/gateway/skills/` (gebündelt, aktuell 10 Skills — keiner davon goal-fokussiert:
architecture, code-review, data-analysis, debugging, deep-research, omniroute-setup, performance,
reproduction-validation, security-audit, test-generation), `.jait/skills` bzw. `.agents/skills`
(projektspezifisch).

**Aktivierung — prompt-gesteuert, nicht kernel-magisch:** Die Frontmatter-Felder sind ein
*Default-Template*. Aktiv gesetzt wird das Goal erst durch `goal.set` aus dem Skill-Body heraus
(Instruktion im Skill, ausgeführt vom Haupt-Agenten). Das hält die Injektion als
`<available_skills>` (skills/index.ts L377) unverändert — name/description reichen für die
Sichtbarkeit, die Policy-Felder werden erst beim vollständigen Laden via `file.read` relevant.

**Design-Risiko (offen benannt):** Der Anthropic-Skills-Standard und ClawHub/OpenClaw kennen die
Felder nicht. Third-Party-Parser/Validatoren können sie ignorieren (unkritisch — unbekannte
Frontmatter-Felder sind additive Metadaten) oder in strengen Schemata anmeckern. Deshalb:
Felder sind optional, Jait-Verhalten ist **ohne** die Felder identisch, und die kanonische
Policy-Quelle bleibt der `goal.set`-Aufruf, nicht das Frontmatter.

### C) Persistenz & Resume

- **Goal-State in SQLite** — Muster: `packages/gateway/src/memory/sqlite-backend.ts` (neben
  `service.ts`/`scoring.ts`). Eigene Tabelle `goals` statt Missbrauch des Memory-Stores:
  `id, session_id, thread_id, user_id, text, success_criteria (json), max_turns,
  status (active|met|escalated|failed), eval_verdicts (json), created_at, updated_at`.
  Begründung: `memory.save` hat TTL und Scope project/contact — *Vergessen* ist dort ein Feature;
  ein Goal braucht deterministische Persistenz mit explizitem Lebenszyklus. Optional zusätzlich ein
  `memory.save`-Spiegel-Eintrag, damit der Goal-Verlauf über `memory.search` auffindbar bleibt.
- **Warum nicht Session-Todos/Todos:** Session-Todos leben nur In-Memory (`tools/core/todo.ts`) —
  gut als Fortschrittsanzeige *während* des Laufs, ungeeignet als Goal-Quelle über Sessions.
  `jait.todos` ist repo-gebunden und nutzerorientiert (`repo-proposal-tools.ts` L55) — als
  "später weitermachen"-Backlog für Menschen, nicht als Maschinen-State.
- **Wake-up/Continue über bestehende Infrastruktur:**
  - **Scheduler:** Cron über `scheduler/service.ts` + `routes/jobs.ts` — ein Goal mit
    `on_failure: checkpoint` kann einen Resume-Job anlegen ("nächster Workspace-Start: Goal fortsetzen").
  - **Threads:** `routes/threads.ts` — Goal-Status hängt an der Thread-ID, Resume öffnet den Thread
    mit `[GOAL-RESUME]`-Kontext.
  - **Reminders:** `memory.save kind=reminder` + `services/reminders.ts` — Nutzer-Eskalation bei
    `impossible` oder gestorbenen Goals ("Goal X wartet seit 2 Tagen auf deine Entscheidung").

---

## 4. Phasierung

### Phase 0 — Rein prompt-basiert [Aufwand: S]

Ein Goal-Skill (z. B. in `packages/gateway/skills/` oder projektspezifisch in `.jait/skills`), der den
Loop **ohne Kernel-Änderung** steuert:

- Skill-Instruktion erzwingt: Ziel + Kriterien zu Turn-Beginn formulieren, nach jeder Tool-Runde
  selbstevaluieren ("Prüfe Kriterium 1 — erfüllt ja/nein, begründe in einem Satz"), Fortschritt im
  Session-Todo (`tools/core/todo.ts`) und Checkpoints via `memory.save` führen.
- Nutzen: Validiert Prompt-Formulierung und Erfolgskriterien-Granularität mit echten Workloads; die
  Selbsteval-Protokolle aus Phase 0 sind direkt das Prompt-Material für den Phase-1-Evaluator.
- Abgrenzung zum nächsten Prior Art (`write-goal` auf ClawHub): Auch dieser Skill hilft, eine vage Absicht
  in einen Completion-Contract zu gießen — aber als einmalige Zielformulierung für Autonomous Mode. Phase 0
  geht darüber hinaus: Runden-Evaluator mit Met/Not-yet-met/Impossible, Checkpoints via `memory.save`,
  Budget-Eskalation — Loop-Policy statt nur Zielformulierung.
- Risiko: Compliance ist nur "weich" (Modell kann die Instruktion ignorieren), kein deterministischer
  Stop, kein Resume über Session-Ende hinaus. Eval-Kosten: 0.
- Empfehlung: sofort starten, 1–2 reale Workloads testen (Kandidat: `reproduction-validation`-Skill
  als Pilot, da es ohnehin Verifikations-kritisch ist).

### Phase 1 — `goal.*`-Tools + Eval-Hook im Loop [Aufwand: M]

- Neue Tools `goal.set` / `goal.status` / `goal.clear` (session-scoped, analog zum Stil von
  `skills.manage` in `tools/skill-tools.ts`).
- Evaluator-Call am Hook-Punkt `SteeringController.drain` (agent-loop.ts L3022–3031), Default: alle
  4 Runden + bei Verifikationspunkten + vor Budget-Erschöpfung. Verdicts wie in Baustein A;
  `impossible` → Eskalation. Budgets (64/200) und Hardening-Konstanten unverändert.
- Nutzen: deterministische, semantische Stop-Condition; Statusanzeige über `onEvent`;
  im continuous/Sub-Agent-Modus die erste sinnvolle Abbruchbedingung jenseits von Checkpoints.
- Risiko: Eval-Kosten (kleines Modell, getaktet), Fehlverdicts (→ konservativer Bias Richtung
  `not-yet-met`, `impossible` eskaliert statt zu löschen). Interaktion mit Swarm/Plan-Modus
  muss definiert werden (siehe Abschnitt 5).

### Phase 2 — Frontmatter-Felder + Resume via Scheduler [Aufwand: M]

- Frontmatter-Parsing erweitern; beim Skill-Load (Volltext via `file.read`) liest der Agent die
  Policy und ruft `goal.set` — zusätzlich optional: Gateway parst die Felder direkt beim
  Skill-Load und legt sie als Default unter dem Goal ab.
- Persistenz-Tabelle `goals` (SQLite nach Muster `memory/sqlite-backend.ts`), Resume über
  Scheduler-Wake-up (`scheduler/service.ts`, `routes/jobs.ts`) und Threads.
- Nutzen: Skills werden deklarativ tragbar; lange Ziele überleben Session-Ende und App-Restarts;
  Goal-Dashboard wäre trivial darauf aufbauend möglich.
- Risiko: Standard-Kompatibilität (siehe Baustein B), TTL/Lebenszyklus-Fragen, mehr Test-Surface
  im Loop-Kern — deshalb zuletzt.

---

## 5. Risiken & Guardrails

1. **Endlos-Loops:** `ABSOLUTE_TOOL_ROUND_BUDGET = 200` bleibt **immer** aktiv — ein Goal kann den
   Loop frühestens stoppen, nie über das Budget hinaus laufen lassen. Auch im continuous-Modus
   (`SUBAGENT_MAX_ROUNDS = 0`) gelten die Checkpoints weiter. Das Goal ist eine zusätzliche,
   semantische Stop-Bedingung, kein Ersatz für die budgetären.
2. **Eval-Kosten:** Evaluator nur alle N Runden (Default 4), bei Verifikationspunkten und kurz vor
   Budget-Erschöpfung; billiges Modell (Haiku-Klasse), konfigurierbar; Token-Spend des Evaluators
   in der Statusanzeige ausweisen, nicht verstecken.
3. **Swarm/Plan-Modus-Interaktion:** Goal ist zunächst **nur im `agent`-Modus** aktiv (chat-modes.ts:
   `ask`/`agent`/`swarm`/`plan`). Im Swarm-Modus wäre der natürliche Ort Teil-Goals pro Sub-Agent
   (`agent.spawn`) mit einem Coordinator-Goal darüber — aber erst nach Phase 1, nicht als Voraussetzung.
   Im `plan`-Modus ist der Plan selbst die Stop-Bedingung; ein Goal dort wäre redundant und wird
   ignoriert (mit Hinweis im Turn-Output).
4. **Supervised-Mode-Approvals:** `runtimeMode: full-access | supervised` (thread-tools.ts) bleibt
   maßgeblich: Ein Eval-Verdict `met` stoppt den Loop zwar, aber Tools mit Approval-Pflicht werden
   nicht stillschweigend freigegeben, nur weil das Goal das fordert; Eskalationen laufen über die
   bestehenden Approval-Wege.
5. **Eval-Fehlentscheidungen:** Verdict `impossible` → **Status `escalated` + Nutzer-Benachrichtigung**
   (Turn-Output und ggf. Reminder), niemals Auto-Delete des Goals (bewusste Abweichung von Claude
   Code, das unrecoverable Errors zum Goal-Verlust nutzt — ein gelöschtes Goal verliert den Kontext
   für einen Retry). Verdict `met` bei mehrdeutigen Kriterien: Evaluator-Prompt bekommt konservativen
   Bias ("im Zweifel not-yet-met") und Kriterien sollten maschinenprüfbar formuliert sein
   (Phase-0-Skill gibt das Muster vor).
6. **Prompt-Injection über Skills:** Policy-Felder nur aus gebündelten/nutzer-eigenen Skills als
   Auto-Template vertrauen; projekt-lokale Skills (`.jait/skills`) verlangen die implizite Bestätigung
   durch den Nutzer-Aufruf bzw. binden an die bestehenden Konsent-Mechanismen der Tool-Tiers.

---

## 6. Empfehlung [PROPOSE]

**Klare Empfehlung: Umsetzen.** Die Recherche zeigt ein etabliertes Pattern (Claude Code `/goal`,
Evaluator-Loops, Budget-Primitive), Jait hat die harte Infrastruktur bereits gebaut
(Budgets, Hardening, Hook-Punkt, Persistenz-Muster) und es fehlt exakt die eine Schicht, die das
Pattern produktiv macht: die Goal-Schicht. Phase 0 kostet fast nichts und liefert die Prompts für
Phase 1 — es gibt keinen Grund, nicht sofort zu testen.

**Entscheidungspunkte für dich (Jakob):**

1. **[PROPOSE] Policy-Deklaration: Skill-Frontmatter vs. Run-Parameter.** Empfehlung: *beides, mit
   klarer Priorität* — `goal.set` ist die Laufzeit-Wahrheit (explizit, session-scoped, testbar),
   Frontmatter-Felder sind das deklarative Default-Template, das `goal.set` vorbefüllt. Falls du nur
   eines willst: Run-Parameter zuerst (kleinere Oberfläche, kein Standard-Risiko), Frontmatter erst
   in Phase 2.
2. **[PROPOSE] Evaluator-Modellwahl.** Empfehlung: kleines, billiges Modell (Haiku-Klasse),
   konfigurierbar pro Gateway-Config, Default-Frequenz alle 4 Runden. Alternative: Hauptmodell
   evaluiert sich selbst (kostenloser Eval-Call entfällt, aber Selbst-Evaluation ist messbar weniger
   zuverlässig — dagegen spricht die gesamte Evaluator-Optimizer-Literatur).
3. **[PROPOSE] Reihenfolge.** Empfehlung: Phase 0 sofort als Test mit 1–2 realen Workloads
   (`reproduction-validation` als Pilot), Phase 1 erst nach Auswertung der Selbsteval-Protokolle.
   Falls du Phase 0 überspringen willst: Phase 1 direkt, aber dann ohne Prompt-Material aus realen
   Läufen.
4. **[PROPOSE] Verhalten bei `impossible`.** Empfehlung: Eskalation (Status `escalated` + Reminder)
   statt Claude-Code-Style Auto-Clear — Jait hat mit Reminders (`services/reminders.ts`) und Threads
   ohnehin die bessere Eskalations-Infrastruktur als ein CLI-Tool.

---

## 7. Quellen (gekürzt)

1. Claude Code Doku — `/goal`: `code.claude.com/docs/en/goal.md` (session-scoped Completion Condition,
   Haiku-Evaluator, Verdicts "Met / Not yet met / Impossible", Stall-/Error-Verhalten)
2. Anthropic — "Building Effective Agents": `anthropic.com/engineering/building-effective-agents`
   (Evaluator-Optimizer, Workflow-vs-Agent-Trennung)
3. LangChain Blog — "The Art of Loop Engineering": `langchain.com/blog/the-art-of-loop-engineering`
4. Anthropic Agent Skills: `agentskills.io` (Skill-Format ohne Goal-/Loop-Policy-Felder)
5. ClawHub/OpenClaw Skills: `docs.openclaw.ai/tools/skills`, `github.com/openclaw/clawhub`
   (Suche "goal": u. a. `write-goal`, `goal-runner`, `codex-goal-decomposer`, `goal-tracker`;
   Format `name`/`description`/`version`/`metadata` — ohne Goal-/Loop-Policy-Felder)
6. LangGraph — Stop-Budgets: `docs.langchain.com` (`GRAPH_RECURSION_LIMIT`)
7. CrewAI — Iterations-Budgets: `docs.crewai.com/concepts/agents` (`max_iter`)
8. Jait-Codebase (Primärquelle dieser Proposal): `packages/gateway/src/tools/agent-loop.ts`
   (Budgets L1933f, Hardening L1972f, Hook-Punkt L3022f), `packages/gateway/src/skills/index.ts` (L377),
   `packages/gateway/src/memory/sqlite-backend.ts`, `packages/gateway/src/scheduler/service.ts`

---

*Ende des Vorschlags. Bewertung des übergeordneten Auftrags: "Goal Skills" sind für Jait sinnvoll —
die Goal-Schicht ist das fehlende Puzzleteil über einer bereits sehr harten Loop-Infrastruktur.*