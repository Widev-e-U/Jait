# LocalStorage Audit

## Ziel

Arbeitskontext und laufende Session-Daten sollen nicht am offenen Browser-Tab haengen. Geraetebezogene oder bewusst lokale UI-Praeferenzen duerfen in `localStorage` bleiben.

## Bereits umgesetzt

- `queued_messages`
  - Von rein lokalem Tab-State auf synchronisierten Session-State umgestellt.
  - Status: erledigt

- `chat.mode`
  - Von `localStorage` auf synchronisierten Session-State umgestellt.
  - Status: erledigt

- `chat.view`
  - Von `localStorage` auf synchronisierten Session-State umgestellt.
  - Status: erledigt

- `workspace.layout`
  - `showWorkspaceTree` und `showWorkspaceEditor` von `localStorage` auf synchronisierten Session-State umgestellt.
  - Status: erledigt

- `chatProvider`
  - Lokale Persistenz entfernt; bleibt ueber User-Settings (`chat_provider`) serverseitig gespeichert.
  - Status: erledigt

- `jait_automation_repos`
  - Die alte `AutomationPage` nutzt jetzt die Repo-API statt `localStorage`.
  - Status: erledigt

- `token`
  - Von `localStorage` in einen zentralen Auth-Store auf `sessionStorage` umgestellt.
  - Legacy-Werte aus `localStorage` werden beim ersten Lesen uebernommen und entfernt.
  - Status: erledigt

- `cliModelsByProvider`
  - Von `localStorage` auf synchronisierten Session-State umgestellt.
  - Altes `localStorage` wird nur noch als einmaliger Legacy-Migrationspfad gelesen.
  - Status: erledigt

## Bewusst vorerst lokal belassen

- `showSessionsSidebar`
  - Rein lokale Oberflaechenpraeferenz.

- `showDebugPanel`
  - Rein lokale Oberflaechenpraeferenz.

- `jait-gateway-url`
  - Client-lokales Gateway-Override, absichtlich geraetebezogen.

- `device-id`
  - Absichtlich geraetebezogen.

- `screen-share` auto-approve
  - Eher geraete- als sessionbezogen.

## Noch offen

- Auth auf HttpOnly-Cookie umstellen
  - Der aktuelle Schritt entfernt `token` aus `localStorage`, nutzt aber weiter `Bearer`-Header aus `sessionStorage`.

- `cliModelsByProvider` langfristig als User-Setting modellieren
  - Aktuell Session-State, funktional okay, aber noch keine benutzerweite serverseitige Praeferenz.
