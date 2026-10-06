# Jait capability catalog

The product registry lives in `packages/shared/src/capability-catalog.ts`. Every routable page satisfies `JaitPageContract`: title, path, mode, explanation, example user requests, explained features, exact tool references, and tool namespaces. A feature without tools must declare its UI-only reason. AppView and history paths derive from this registry. Navigation's exhaustive icon map and the page outlet's exhaustive route check make new page additions require UI integration.

Add a page here when implementing it, then implement its renderer and navigation icon. Add a feature to the owning page when extending the page's behavior. This is an authored product contract, not an inference from JSX or a generated claim about planned functionality.

Tool membership is live. Tools inherit a product page from their namespace or category during registration; use `ToolDefinition.page` for an explicit association. New registered tools, including connected adapters, appear on the next catalog call, and removed tools disappear. Feature references resolve against currently exposed tools; missing references remain visible as coverage gaps. Adding a tool does not magically implement a UI feature.

`jait.catalog` is a core read-only tool exposed to Jait's loop and MCP providers. No arguments gives the feature tree. Each page includes a live tool count and up to fifteen tool references; use pageId and toolOffset to read further references. A query or pageId gives relevant tool schemas (at most twelve, bounded to preserve valid MCP JSON); both Jait loops activate the same matches format as tools.search. Runtime scope and consent remain enforced when executing the selected tools.

The shared native and external-provider instructions require catalog lookup for harness/page/configuration/team requests. Persistent agents are managed through `agent.profiles.inspect` (read-only list/get) and `agent.profiles` (list/get/create/update/delete). Both use the same user-owned ThreadService records as the Agents page. The API and tools share profile validation. Reporting lines reject cycles and foreign managers. Updates merge only supplied fields; deleting a manager detaches reports and thread references.

Profile schedules and tasks are saved configuration. They do not independently create executable scheduled jobs. Use cron tools for jobs and thread.control with personaAgentId for agent execution.

Every catalog-associated tool card links to its owning page, including collapsed completed cards. Catalog lookup cards show explained page features and missing tools. Link destinations and titles come from the trusted page registry, not arbitrary tool-supplied URLs. Links use Jait's existing in-app notification navigation so project/chat context stays intact.

The avatar menu includes Catalogue beneath Usage on desktop and mobile. Its modal uses the same react-force-graph-2d package as Network: a complete page graph, focused page trees, search, node details, unavailable-tool markers, and page navigation. It consumes live /api/tools metadata and the shared page membership rule. Opening, refreshing, returning focus, and a 30-second interval update tool availability; closing cancels requests and polling.
