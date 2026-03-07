# @jait/mobile

React-Native/Expo Einstieg für die Handy-App mit denselben Design-Tokens wie Web/Desktop.

## Start

```bash
bun run --filter '@jait/mobile' dev
```

## Zielbild

- Gemeinsame Design-Tokens (`@jait/ui-shared`) für visuelle Konsistenz.
- Basiskomponenten nativ in `src/components` (z. B. `BaseCard`, `AdaptiveLayout`).
- Schrittweise Migration der Screens (Chat, Jobs, Settings), damit Funktionsparität zur Web-App entsteht.

## Bestehende Integration

- Die bestehende Gateway-Bootstrap-Logik bleibt über `src/mobile-bootstrap.ts` erhalten.
- Capacitor-Skripte bleiben in `package.json` verfügbar für den bisherigen WebView-Pfad.
