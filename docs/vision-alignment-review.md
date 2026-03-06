# Vision Alignment Review (Stand: heute)

## Kurzfazit

Die Richtung der letzten Implementierungen ist **klar in Richtung deiner Vision**: monorepo mit Bun/TypeScript, Gateway + Surfaces, Consent/Trust, Session-State und erste Screen-Share-/Mobile-Bausteine sind vorhanden.

Gleichzeitig gibt es aktuell ein paar **strategische Drift-Punkte**, die dich später bremsen könnten (vor allem Dokumentation/Produktstory vs. tatsächlicher Stack, sowie ein paar lokale Defaults).

---

## Was bereits sehr gut zur Vision passt

1. **TypeScript-End-to-End + Monorepo**
   - Root-Workspace, Build/Test/Typecheck-Skripte und Paketstruktur passen zur Vision „eine Sprache, ein Stack“. 
2. **Gateway-zentrierte Architektur mit Surfaces/Tools**
   - Der Server registriert Chat, Sessions, Consent, Trust, Hooks, Jobs, Mobile, Network, Voice, Workspace und Screen-Share-Routen — das ist konsistent mit „Agent controls itself“ über Werkzeuge.
3. **Local-First Persistenz ist tatsächlich implementiert**
   - Standard-DB liegt unter `~/.jait/data/jait.db` und wird automatisch angelegt.
4. **Sicherheits-/Human-in-the-loop-Bausteine sind echt vorhanden**
   - Consent/Trust-Strukturen sind im Gateway-Fundament verankert.
5. **Prompting-Infrastruktur ist aktiv weiterentwickelt**
   - GPT-5.2 Prompt Resolver ist vorhanden und zeigt, dass du das Agent-Verhalten bewusst steuerst.

---

## Wo Vision und Produkt-Wirklichkeit aktuell auseinanderlaufen

1. **README erzählt noch eine frühere Produktgeneration**
   - Aktuell steht dort „Agent Chat“ mit FastAPI/Postgres/Qwen; das widerspricht der realen Bun/TS/Fastify-Monorepo-Architektur.
   - Das ist nicht nur kosmetisch: Es erzeugt falsche Onboarding-Erwartungen für Contributor und zukünftige Nutzer.

2. **Local-First Signal ist nicht überall „scharf“**
   - In der Config ist eine konkrete LAN-Ollama-URL als Fallback drin (`192.168...`) statt `localhost`.
   - Das wirkt schnell wie „machine-specific default“, nicht wie robustes local-first out-of-the-box.

3. **Screen-Share wirkt aktuell noch wie Architektur-Scaffold**
   - Service hat bereits gutes Domain-Modell (Devices, Route-Mode, Transfer Control), aber zentrale Stellen sind noch placeholder (z. B. `captureScreen()` liefert Dummy-Daten).
   - Das ist okay für einen Sprint-Übergang, sollte aber klar als „stubbed capability“ gekennzeichnet werden.

---

## Einschätzung zu deiner Frage („gehen die letzten Sachen in die richtige Richtung?“)

**Ja — klar ja.**

Die letzten Änderungen wirken wie konsistente Vertiefung deines Kernsystems (Prompt-Qualität, Tooling, Tests, Workspace/Control-Flows), nicht wie zufällige Seitensprünge.

Wenn du jetzt die richtigen Prioritäten setzt, bist du in einer sehr guten Position, von „technisch vorhanden“ zu „produktseitig glasklar“ zu kommen.

---

## Was jetzt wahrscheinlich das Richtige für dich ist (priorisiert)

### P0 – Vision-zu-Produkt-Konsistenz herstellen

- README und „Getting Started“ auf den echten Stack umstellen (Bun + Fastify + Monorepo + Local SQLite).
- In einem Satz klarstellen: OAuth/Cloud-Provider sind optional, nicht Kernabhängigkeit.

### P0 – Local-First Defaults härten

- Standardwerte für lokale Entwicklung so setzen, dass ein frischer Checkout ohne netzwerk-/host-spezifische Anpassung funktioniert (insb. Ollama-URL).

### P1 – „Beobachtbarkeit“ als Differenzierungsmerkmal schließen

- Live-Activity + Screen-Share-Layer priorisieren, aber streng vertikal (ein echter End-to-End-Pfad von Session → Aktion → Sichtbarkeit auf Zweitgerät).
- Lieber ein kleiner, echter Weg statt breiter Halbfertigkeits-Matrix.

### P1 – Consent UX als Produktkern statt Sicherheits-Nachtrag

- Approval-Flows und Action-Cards/Queue weiter schärfen; das ist für Vertrauen und tägliche Nutzbarkeit vermutlich wichtiger als zusätzliche Tool-Breite.

### P2 – Feature-Breite erst nach „Core Loop“-Reife

- Neue Integrationen/Provider nur ergänzen, wenn der Kern-Loop stabil ist: 
  „Auftrag → Ausführung → Sichtbarkeit → Zustimmung/Intervention → nachvollziehbares Ergebnis“. 

---

## Entscheidungsregel für kommende Sprints (einfach)

Wenn du zwischen zwei Tasks wählen musst, priorisiere immer den Task, der diesen Loop messbar verbessert:

1. **Agent handelt wirklich** (nicht nur textet),
2. **du siehst es live**,
3. **du kannst eingreifen/entscheiden**,
4. **das Ergebnis ist reproduzierbar & auditierbar**.

Alles, was diesen Loop nicht stärkt, ist aktuell eher „nice to have“.
