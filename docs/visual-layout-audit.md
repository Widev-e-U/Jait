# Visual layout audit

The browser audit is `tests/e2e/visual-layout-audit.spec.ts`.

Coverage: the 11 catalogue pages and all 12 settings sections, in light and dark themes, at 1440×900 and 390×844. Screenshots and overflow reports are written to `/tmp/jait-visual-audit`. Fresh test accounts exercise normal default and empty states; this is not exhaustive coverage of connected providers, populated histories, imported themes, or every nested dialog.

## Confirmed fixes

- Catalogue graph: at 1024×400, its 220px minimum height exceeded the available 174px. The bottom border extended 46px beyond the hidden container. Desktop graphs now shrink to available height; phones retain the scrollable 220px minimum. The same geometry assertion failed before and passed after, across five viewport sizes.
- Mobile shortcuts: controls squeezed the label into 70px of a 314px row. Labels now occupy 290px above the controls; desktop keeps the horizontal layout. The same width assertion failed before and passed after.
- Dropdown consistency: catalogue, agents, jobs pagination, plan selection, project folders, skill categories, and security profile options use the existing shadcn Select. Empty project and supervisor selections still map back to their original values. Security selection changes still reset consent.

The audit also checks that the job creation dialog fits a 360×640 viewport. Security workbench interaction tests use mocked responses, including profile changes; no assessments are launched by the visual audit.

## Repeat

Against a running development stack, substitute its verified frontend and gateway URLs:

```sh
FRONTEND_URL=http://127.0.0.1:3310 API_URL=http://127.0.0.1:8310 node tests/e2e/node_modules/@playwright/test/cli.js test --config tests/e2e/playwright.config.ts visual-layout-audit.spec.ts --project chromium --output /tmp/jait-layout-tests
```

Keep output directories separate when running multiple Playwright processes; they clean their output directory on startup.
