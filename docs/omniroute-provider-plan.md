# OmniRoute als AI-Provider in Jait

Branch: `feat/omniroute-provider`

## 1. Was OmniRoute ist (verifiziert)

OmniRoute (`npm i -g omniroute`, MIT, <https://github.com/diegosouzapw/OmniRoute>) ist **kein Cloud-Service**, sondern
ein **lokal laufender Router/Proxy** (Next.js-App + Express-Proxy), der ~290 Upstream-Provider hinter *einem*
OpenAI-kompatiblen Endpoint bündelt.

| Eigenschaft | Wert |
| --- | --- |
| Dashboard | `http://localhost:20128` |
| OpenAI-API | `http://localhost:20128/v1` (`/chat/completions`, `/models`, `/embeddings`, `/audio/*`, `/ocr`) |
| Anthropic-API | `http://localhost:20128` (`ANTHROPIC_BASE_URL`) |
| Auth | `Authorization: Bearer <key aus Dashboard → Endpoints>`; keyless möglich (Free-Tier-Provider sind vorverdrahtet) |
| Streaming | SSE (plus WS-Bridge `/v1/ws`) |
| Modell-IDs | echte IDs (`openai/gpt-4o`, `deepseek/deepseek-chat`, …) **plus** Routing-Aliase: `auto`, `auto/coding`, `auto/fast`, `auto/cheap`, `auto/smart`, `auto/<category>:<tier>` |
| MCP | eigener MCP-Server unter `/api/mcp/stream` |
| Response-Header | `X-OmniRoute-Decision` (Strategie/Provider/Latenz) |

Für Jait heißt das: **es ist ein weiterer OpenAI-kompatibler Backend-Endpoint** — architektonisch am nächsten an
OpenRouter, betrieblich am nächsten an Ollama (localhost, optional erreichbar, kein Key zwingend).

## 2. Designentscheidung

Jait kennt heute zwei Provider-Klassen:

1. **`jait`** — der in-process Agent-Loop (`JaitProvider` → `runAgentLoop`) mit vollem Tool-Registry, Consent,
   Memory, Kontext-Pruning. Das *konkrete* HTTP-Backend dahinter wählt `UserSettings.jaitBackend`
   (`"openai" | "openrouter" | "ollama"`).
2. **ACP-Provider** (`claude-code`, `codex`, `cursor`, `pi`, …) — Subprozesse, die per Agent Client Protocol reden.

OmniRoute ist ein Inferenz-Endpoint, kein Agent. Ein eigener `CliProviderAdapter` würde `JaitProvider` 1:1
duplizieren. **Deshalb: OmniRoute wird ein vierter `jaitBackend`-Wert** — `"omniroute"`.

Damit funktionieren sofort und ohne Zusatzarbeit: Streaming, Tool-Calling, Consent/Trust, Memory, Sub-Agents/Swarm,
Thread-Titel-Generierung, Commit-Message-Generierung, Channels (WhatsApp/Telegram) und `/model` im Chat — weil alle
diese Pfade über `resolveJaitLlmConfig()` bzw. `callJaitLlmCompletion()` laufen.

**Zusatzbaustein (Phase 2, optional):** ACP-Provider durch OmniRoute leiten, indem beim Spawn
`ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN` bzw. `OPENAI_BASE_URL` / `OPENAI_API_KEY` gesetzt werden. Das ist
reine Env-Injektion in `loadAcpProviderConfigs()` / `AcpProvider` und macht Claude Code + Codex gratis-fähig.

**Verworfen:** eigener Top-Level-Provider `omniroute` im Provider-Dropdown. Er müsste den kompletten Agent-Loop
nachbauen, und `providerTypeFromId`/`ProviderRegistry`/Auth-Status/Model-Fetch würden für einen reinen HTTP-Endpoint
dupliziert. Falls die eigene Zeile im Dropdown gewünscht ist, ist der billige Weg ein UI-Alias, der intern
`chat_provider=jait` + `jait_backend=omniroute` setzt — nicht ein zweiter Adapter.

## 3. Konkrete Änderungen (Datei für Datei)

### 3.1 Kern: Backend-Auflösung

**`packages/gateway/src/services/jait-llm.ts`** — Kernstück.

- `resolveJaitLlmConfig()` bekommt einen `backend === "omniroute"`-Zweig **vor** der OpenRouter-Heuristik:
  ```ts
  if (backend === "omniroute") {
    const baseUrl = apiKeys["OMNIROUTE_BASE_URL"]?.trim()
      || options.config.omnirouteBaseUrl
      || "http://localhost:20128/v1";
    return {
      backend: "omniroute",
      // Key ist optional (keyless Free-Tier); leerer Bearer bricht manche Fetch-Pfade,
      // deshalb Platzhalter wie bei Ollama.
      openaiApiKey: apiKeys["OMNIROUTE_API_KEY"]?.trim() || options.config.omnirouteApiKey || "omniroute",
      openaiBaseUrl: baseUrl.replace(/\/+$/, ""),
      openaiModel: requestedModel || "auto",
      contextWindow: inferContextWindow(requestedModel),
    };
  }
  ```
- **Fallstrick (wichtig):** heute gilt `const isOpenRouterModel = requestedModel.includes("/")` und
  `useOpenRouter = backend === "openrouter" || isOpenRouterModel || isOpenRouterBaseUrl`. OmniRoute-Modelle
  enthalten fast immer einen Slash (`openai/gpt-4o`, `auto/coding`). Ohne den vorgezogenen Early-Return würde
  jede OmniRoute-Anfrage nach `https://openrouter.ai/api/v1` umgebogen werden. Der `omniroute`-Zweig **muss**
  vor dieser Heuristik stehen — das ist die einzige echte Regressionsfalle im ganzen Vorhaben.
- `normalizeOpenRouterModelId()` **nicht** anwenden: OmniRoute hat eigene Aliase, die Alias-Map von OpenRouter
  würde z. B. `gpt-4o` fälschlich zu `openai/gpt-4o` machen (bei OmniRoute unnötig und je nach Katalog falsch).

**`packages/gateway/src/config.ts`**

- `AppConfig` um `omnirouteBaseUrl: string` und `omnirouteApiKey: string` erweitern
  (`OMNIROUTE_BASE_URL` default `http://localhost:20128/v1`, `OMNIROUTE_API_KEY` default `""`).
- `inferContextWindow()`: `auto`/`auto/*` trifft heute den 128k-Default. Das ist vertretbar, aber ein expliziter
  Zweig (`if (m.startsWith("auto")) return 128_000;`) dokumentiert die Absicht — und OmniRoute komprimiert
  ohnehin serverseitig (RTK/Caveman), sodass ein zu großzügiges Fenster teurer ist als ein zu kleines.

### 3.2 Persistenz & Settings

**`packages/gateway/src/services/users.ts`**
- `export type JaitBackend = "openai" | "openrouter" | "ollama" | "omniroute";`

**`packages/gateway/src/db/schema.ts`**
- Spalte `jait_backend` ist bereits `text().notNull().default("openai")` — **keine Migration nötig**, nur der
  Kommentar `// 'openai' | 'openrouter'` ist schon jetzt veraltet und wird mitgezogen.

**`packages/gateway/src/routes/auth.ts`**
- `JAIT_BACKEND_VALUES` um `"omniroute"` erweitern (sonst wird der Wert bei `PATCH /api/auth/settings`
  stillschweigend verworfen → UI-Umschalten hätte keinen Effekt).
- `ENV_KEY_MAP` in `/api/auth/settings/env-status` um `OMNIROUTE_BASE_URL` und `OMNIROUTE_API_KEY` ergänzen,
  damit die Settings-UI „per Env gesetzt" korrekt anzeigt.

### 3.3 Modell-Katalog

**`packages/gateway/src/providers/model-fetchers.ts`**
- Neue `fetchOmniRouteModels(apiKey, baseUrl)` analog zu `fetchOpenAIModels`, aber **ohne** den
  `isChatCapableOpenAIModelId`-Filter (der würde alles außer `gpt-*`/`o*` wegwerfen — bei OmniRoute wären das
  ~99 % des Katalogs). Eigener Cache-Slot + In-Flight-Guard nach bestehendem Muster, TTL wie remote (5 min).
- Katalog kann groß sein (500+ Modelle) → Cap analog `OPENROUTER_MAX_MODELS`, plus die Routing-Aliase
  (`auto`, `auto/coding`, `auto/fast`, `auto/cheap`, `auto/smart`) **vorangestellt und fest verdrahtet**,
  damit sie auch ohne erreichbaren Router im Picker stehen.
- `supportsReasoningEffort()` greift schon über Substrings (`deepseek-r1`, `gpt-5`, `reason`, …) und funktioniert
  für OmniRoute-IDs unverändert.

**`packages/gateway/src/services/jait-models.ts`**
- `JaitModelGroup` um `"OmniRoute"` erweitern; vierten parallelen Fetch-Zweig ergänzen (Fehler → leere Liste,
  wie bei Ollama, damit ein nicht laufender Router nichts kaputt macht).
- Konsequenz: Der Model-Picker zeigt OmniRoute als eigene Gruppe — genau die UX, die der User erwartet.

### 3.4 Frontend

**`apps/web/src/hooks/useAuth.ts`**
- `export type JaitBackend = 'openai' | 'openrouter' | 'ollama' | 'omniroute'`

**`apps/web/src/components/settings/SettingsPage.tsx`**
- `<SelectItem value="omniroute">OmniRoute (lokaler Router)</SelectItem>`
- Hinweistext-Kette um einen `omniroute`-Fall erweitern („Modelle kommen vom lokalen OmniRoute unter
  `OMNIROUTE_BASE_URL` (Default `http://localhost:20128/v1`). API-Key optional.")
- `API_KEY_GROUPS`: neue Gruppe `{ label: 'OmniRoute', fields: ['OMNIROUTE_BASE_URL', 'OMNIROUTE_API_KEY'] }`.
- Der Suchfilter (`matchesSearch(... jaitBackend ...)`) zieht den neuen Wert automatisch mit.

**`apps/web/src/components/chat/provider-model-selector.tsx`**
- `GROUP_TO_BACKEND` um `OmniRoute: 'omniroute'` erweitern, und den inline-Typ
  `'openai' | 'openrouter' | 'ollama'` in `updateSettings({ jait_backend: … })` mitziehen.
  Ohne das schaltet die Auswahl eines OmniRoute-Modells das Backend **nicht** um und die Anfrage geht an OpenAI —
  ein stiller, schwer zu debuggender Fehler.

### 3.5 Prompts & Kontext

**`packages/gateway/src/tools/prompts/prompt-registry.ts`**
- `ModelEndpoint.backend` ist frei-textuell, kein Enum → kein Muss. Aber: der Prompt-Selektor entscheidet u. a.
  über `endpoint.backend === "ollama"` (lokale Modelle bekommen einen kompakteren Prompt). OmniRoute routet
  potenziell auf sehr kleine Free-Modelle. Empfehlung: **nicht** pauschal als „local" behandeln, sondern die
  bestehende modellbasierte Familienerkennung greifen lassen (`glm-*`, `deepseek-*`, … funktionieren bereits
  über `familyPrefixes`). Nur Doku-Kommentar anpassen, damit `"omniroute"` als bekannter Wert gelistet ist.

### 3.6 Tests

- `packages/gateway/src/services/jait-llm.test.ts` — neue Fälle:
  - `backend: "omniroute"` + Modell **mit** Slash → bleibt bei OmniRoute-BaseURL (Regressionstest für die
    OpenRouter-Heuristik).
  - `OMNIROUTE_BASE_URL` aus `apiKeys` schlägt Config.
  - kein Key gesetzt → Platzhalter-Key, kein Throw (anders als OpenRouter, das ohne Key wirft).
- `packages/gateway/src/providers/model-fetchers.test.ts` — `fetchOmniRouteModels`: Cache, Nicht-200,
  Netzwerkfehler → Stale-Fallback, Aliase immer vorne.
- Neue `packages/gateway/src/routes/chat-omniroute.test.ts` nach dem Muster von `chat-openrouter.test.ts`
  (Streaming-Turn end-to-end gegen einen gemockten `/chat/completions`).
- `packages/gateway/src/services/thread-title.test.ts` — ein Fall mit `jaitBackend: "omniroute"`.

## 4. Auswirkungen / was nachgezogen werden muss

| Bereich | Auswirkung |
| --- | --- |
| **DB-Migration** | Keine. `jait_backend` ist eine freie Textspalte mit Default. |
| **Rückwärtskompatibilität** | Keine Änderung an bestehenden Backends, solange der `omniroute`-Zweig **vor** der OpenRouter-Slash-Heuristik greift. Das ist der einzige riskante Punkt. |
| **API-Contract** | `PATCH /api/auth/settings` akzeptiert einen neuen Enum-Wert — additiv. Ältere Web-Clients gegen neuen Gateway: unkritisch. Neuer Web-Client gegen alten Gateway: Umschalten wird verworfen (Wert fällt auf `openai` zurück) → beim Deploy Gateway zuerst. |
| **`packages/shared`** | Aktuell hält `shared` den `JaitBackend`-Typ **nicht** — er ist in `gateway/services/users.ts` und in `apps/web/hooks/useAuth.ts` **dupliziert**. Beim Anfassen sollte er nach `packages/shared/src/types` wandern (AGENTS.md: „Keep shared contracts in `packages/shared`"), sonst driften die beiden Listen weiter auseinander. Das ist ein kleiner, sauberer Nebenrefactor — bewusst als eigener Commit. |
| **`.env.example`** | `OMNIROUTE_BASE_URL` / `OMNIROUTE_API_KEY` dokumentieren. |
| **Docker** | Läuft der Gateway im Container, ist `localhost:20128` **nicht** der Host. Für `docker/` braucht es `host.docker.internal:20128` bzw. einen dokumentierten `OMNIROUTE_BASE_URL`-Override. Gleiche Klasse Problem wie bei Ollama heute — analog dokumentieren. |
| **SSRF-Guards** | `OMNIROUTE_BASE_URL` ist eine user-setzbare URL, die der Gateway server-seitig anfragt. Wie `OLLAMA_URL`/`OPENAI_BASE_URL` behandeln; sicherstellen, dass sie nicht in Pfade gerät, die durch die SSRF-Prüfung müssen. |
| **Datenschutz** | OmniRoute routet an bis zu 290 Drittanbieter, teils Free-Tier mit Trainings-Erlaubnis in den ToS (das Projekt flaggt 15 Provider selbst). Das gehört in den Settings-Hinweistext, nicht nur in die Doku — Jait-Chats enthalten Repo-Inhalte. |
| **Kosten/Quota-Sichtbarkeit** | `X-OmniRoute-Decision` nennt den tatsächlich benutzten Provider. Nice-to-have: Header auslesen und im Chat als Activity-Event anzeigen, damit man bei `auto` sieht, wer geantwortet hat. Nicht Phase 1. |
| **Verfügbarkeit** | Router läuft nicht → `/v1/models` schlägt fehl → Gruppe ist leer und der Chat wirft einen Connect-Fehler. Der Model-Fetch fängt das (leere Liste), der Chat-Pfad braucht eine verständliche Fehlermeldung statt eines rohen `ECONNREFUSED`. |
| **CI** | Keine neuen Netzabhängigkeiten in Tests (alles gemockt). `bun run typecheck` fängt die Enum-Erweiterungen an allen Stellen — insbesondere die inline getippten `'openai' \| 'openrouter' \| 'ollama'` in `provider-model-selector.tsx`. |
| **Release** | Nach AGENTS.md: `CHANGELOG.md` + Version in `packages/gateway/package.json` bumpen; `apps/web` ändert sich mit, also auch dessen Version, falls separat publiziert. |

## 5. Umsetzungsreihenfolge

1. **Phase 1 — Backend (Gateway)**: `config.ts`, `jait-llm.ts`, `users.ts`, `auth.ts`, `model-fetchers.ts`,
   `jait-models.ts` + Tests. Verifizierbar per `curl` gegen den Chat-Endpoint, ohne UI.
2. **Phase 2 — UI**: `useAuth.ts`, `SettingsPage.tsx`, `provider-model-selector.tsx`.
3. **Phase 3 — Aufräumen**: `JaitBackend` nach `packages/shared`, `.env.example`, `docs/`, Docker-Hinweis.
4. **Phase 4 (optional) — ACP durch OmniRoute**: Env-Injektion (`ANTHROPIC_BASE_URL`/`ANTHROPIC_AUTH_TOKEN`,
   `OPENAI_BASE_URL`/`OPENAI_API_KEY`) für `claude-code` und `codex` in `loadAcpProviderConfigs()`, hinter einem
   expliziten Schalter (`JAIT_ACP_VIA_OMNIROUTE=1`), damit niemand versehentlich sein Claude-Abo umleitet.
5. **Phase 5 (optional) — OmniRoute-MCP**: `http://localhost:20128/api/mcp/stream` als zusätzlicher MCP-Server
   registrierbar machen. Unabhängig vom Rest, rein additiv.

## 6. Offene Punkte für den User

- Soll OmniRoute im Provider-Dropdown eine **eigene Zeile** bekommen (UI-Alias) oder reicht es als
  Backend-Auswahl unter „Jait"? (Plan geht von Letzterem aus.)
- Phase 4 (Claude Code / Codex durch OmniRoute routen) mitnehmen oder erstmal weglassen?
- Läuft OmniRoute bei dir schon auf `localhost:20128`, oder auf einem anderen Host im Homelab? Das entscheidet,
  ob der Default `localhost` bleibt oder konfiguriert werden muss.
