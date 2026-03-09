/**
 * Trust Routes — Sprint 4.4
 *
 * REST API for trust level inspection and management.
 */
export function registerTrustRoutes(app, trustEngine) {
    // GET /api/trust/levels — list all trust levels
    app.get("/api/trust/levels", async () => {
        const levels = trustEngine.listAll();
        return { levels };
    });
    // GET /api/trust/levels/:actionType — get trust level for a specific action type
    app.get("/api/trust/levels/:actionType", async (request) => {
        const { actionType } = request.params;
        const state = trustEngine.getState(actionType);
        return state;
    });
    // POST /api/trust/levels/:actionType/reset — reset trust for an action type
    app.post("/api/trust/levels/:actionType/reset", async (request) => {
        const { actionType } = request.params;
        const state = trustEngine.reset(actionType);
        return state;
    });
}
//# sourceMappingURL=trust.js.map