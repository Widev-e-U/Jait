# OmniRoute in Jait einrichten

[OmniRoute](https://github.com/diegosouzapw/OmniRoute) ist ein selbst gehosteter, OpenAI-kompatibler
Router, der Anfragen an ~290 Upstream-Provider verteilt — viele davon mit Free Tier. Jait spricht ihn
als ein zusätzliches LLM-Backend an, neben OpenAI, OpenRouter und Ollama.

**Jait liefert OmniRoute nicht mit.** Der Router ist eine eigenständige Anwendung von 3,4 GB mit
eigener Datenbank, eigenem Dashboard und eigenem Update-Zyklus. Du betreibst ihn, wo du willst; Jait
kennt davon nur eine URL. Der mitgelieferte Skill **„OmniRoute Setup"** führt dich durch die
Einrichtung — frag im Chat einfach nach OmniRoute, dann übernimmt ein Modell den Rest.

> Alle Angaben hier sind gegen **OmniRoute 3.8.49** geprüft, nicht aus der Doku übernommen.

## Schnellstart — Docker auf dem Jait-Host (empfohlen)

```bash
docker run -d --name omniroute --restart unless-stopped --stop-timeout 40 \
  -p 127.0.0.1:20128:20128 -v omniroute-data:/app/data diegosouzapw/omniroute:latest
```

Das `127.0.0.1:` bindet nur auf Loopback. Lass es weg, wenn andere Geräte den Router erreichen sollen —
aber sei dir bewusst: die Inferenz-API antwortet **absichtlich ohne Authentifizierung**, ein offener
Port ist damit ein offener LLM-Proxy im Netz.

Prüfen:

```bash
curl -s http://localhost:20128/v1/models | head -c 200
```

## Alternative — npm auf dem Host

```bash
npm i -g omniroute                                  # ~3 Minuten, 3,4 GB, 127k Dateien
env -u PORT omniroute serve --port 20128 --no-open
```

Das `env -u PORT` ist kein Zierrat: **eine geerbte `PORT`-Variable schlägt `--port`.** Jait setzt
`PORT=8000`, in einer Jait-Shell startet der Router deshalb auf 8000 und kollidiert mit dem Gateway.

Für Persistenz `omniroute autostart` (systemd-User-Service) oder `omniroute serve --daemon`. Ein
`nohup` überlebt keinen Reboot.

## Auf einem anderen Host

Gleiches Vorgehen, aber ohne `127.0.0.1:`-Prefix, und anschließend **vom Jait-Host aus** prüfen:

```bash
curl -s http://<host>:20128/v1/models | head -c 200
```

## Jait verbinden

1. **Settings → API keys → OmniRoute**
   - `OMNIROUTE_BASE_URL` — nur nötig, wenn nicht `http://localhost:20128/v1`. Muss auf `/v1` enden.
   - `OMNIROUTE_API_KEY` — **optional**, leer lassen für den keyless Free Tier.
   - `OMNIROUTE_MODEL` — optionales Fallback-Modell, wenn im Picker keins gewählt ist.
2. **„Test connection"** klicken. Der Test läuft vom Gateway aus, nicht vom Browser — das ist die
   Verbindung, die funktionieren muss.
3. **Settings → Jait LLM Backend → „OmniRoute"**
4. Im Model-Picker **`auto`** wählen.

Läuft das Gateway selbst in Docker, ist `localhost` der Container:
`OMNIROUTE_BASE_URL=http://host.docker.internal:20128/v1`.

## Modelle

Der Katalog kommt live aus `/v1/models` und erscheint im Picker als eigene Gruppe „OmniRoute".

- **`auto`** — der Router entscheidet pro Anfrage. Funktioniert, wird aber von `/v1/models` **nicht**
  gelistet; Jait ergänzt es deshalb von Hand.
- **`auto/coding`, `auto/best-reasoning`, `auto/cheap`, …** — 38 engere Strategien, alle im Katalog.
- Konkrete Modell-IDs wie `openai/gpt-4o` oder `deepseek/deepseek-r1`.

Läuft der Router nicht, ist die Gruppe leer. Das ist Absicht: Modelle anzubieten, die garantiert nicht
antworten, wäre irreführender als eine fehlende Gruppe.

## Optionale Schalter

| Env | Wirkung |
| --- | --- |
| `JAIT_ACP_VIA_OMNIROUTE=1` | Leitet auch Claude Code und Codex über den Router (`ANTHROPIC_BASE_URL` / `OPENAI_BASE_URL`). **Umgeht damit dein bezahltes Claude-/ChatGPT-Abo** — bewusst opt-in. |
| `JAIT_OMNIROUTE_MCP=1` | Gibt CLI-Agenten zusätzlich OmniRoutes eigenen MCP-Server (Routing, Provider, Combos, Cache, Memory). Braucht zwingend `OMNIROUTE_API_KEY`. |

## Datenschutz

Der Router verteilt an bis zu ~290 Drittanbieter, bei einigen Free Tiers erlauben die ToS Training auf
übermittelten Daten — das Projekt markiert 15 Provider selbst entsprechend. Jait-Chats enthalten
Repository-Inhalte. Welche Upstreams benutzt werden, steuerst du im OmniRoute-Dashboard.

## Fehlerbehebung

| Symptom | Ursache | Lösung |
| --- | --- | --- |
| Keine OmniRoute-Gruppe im Picker | Router nicht erreichbar | „Test connection" in den Settings |
| Router startet auf Port 8000 | geerbte `PORT`-Variable schlägt `--port` | `env -u PORT omniroute serve --port 20128` |
| „Could not connect to omniroute at …" im Chat | Router läuft nicht | `docker start omniroute` bzw. Dienst starten |
| Lokal ok, aus Jait-Container nicht | `localhost` ist der Container | `http://host.docker.internal:20128/v1` |
| 401 beim MCP-Endpoint | MCP authentifiziert immer | Key im Dashboard anlegen, `OMNIROUTE_API_KEY` setzen |
| Nach Reboot weg | mit `nohup` gestartet | `omniroute autostart` oder Docker-Variante |
| Datenverzeichnis an unerwarteter Stelle | Router erbt das HOME des startenden Prozesses | `omniroute status` zeigt den echten Pfad |

## Wieder entfernen

```bash
docker rm -f omniroute && docker volume rm omniroute-data   # Docker
npm rm -g omniroute                                          # npm, gibt ~3,4 GB frei
```

Danach **Settings → Jait LLM Backend** zurück auf OpenAI, OpenRouter oder Ollama stellen — sonst
zeigen Chats weiter auf einen Router, den es nicht mehr gibt.

## Technische Eigenheiten

Falls du am Jait-Code arbeitest — diese drei Punkte weichen von „OpenAI-kompatibel" ab und sind der
Grund für entsprechende Sonderbehandlung im Gateway:

- **`stream` defaultet auf true.** Eine Anfrage ohne `stream`-Feld liefert `text/event-stream` statt
  JSON. `callJaitLlmCompletion()` sendet deshalb explizit `stream: false`.
- **Modell-IDs enthalten Slashes** (`openai/gpt-4o`). `resolveJaitLlmConfig()` muss den
  `omniroute`-Zweig **vor** der OpenRouter-Heuristik auflösen, die auf `includes("/")` prüft.
- **Der MCP-Endpoint verlangt immer Auth**, die Inferenz-API nicht.
