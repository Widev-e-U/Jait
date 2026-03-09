"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.expect = exports.test = exports.TEST_USER = void 0;
exports.getTestToken = getTestToken;
exports.authenticatePage = authenticatePage;
exports.cleanupTestJobs = cleanupTestJobs;
/**
 * E2E test fixtures for authentication and common setup
 */
const test_1 = require("@playwright/test");
Object.defineProperty(exports, "expect", { enumerable: true, get: function () { return test_1.expect; } });
// API base URL
const API_URL = process.env.API_URL || 'http://localhost:8000';
// Test user data
exports.TEST_USER = {
    id: 'e2e-test-user-123',
    email: 'e2e-test@example.com',
    name: 'E2E Test User',
    picture: 'https://example.com/avatar.jpg',
};
/**
 * Create a test token via the backend test endpoint
 */
async function getTestToken(page) {
    const response = await page.request.post(`${API_URL}/auth/test/token`, {
        data: exports.TEST_USER,
    });
    if (!response.ok()) {
        throw new Error(`Failed to get test token: ${await response.text()}`);
    }
    const data = await response.json();
    return data.access_token;
}
/**
 * Authenticate a page by setting the auth state
 */
async function authenticatePage(page, token) {
    // Set localStorage before navigation
    await page.addInitScript(({ token, user }) => {
        localStorage.setItem('token', token);
        // Also set user info if needed by the app immediately
    }, { token, user: exports.TEST_USER });
}
/**
 * Clean up test jobs after tests
 */
async function cleanupTestJobs(page, token) {
    try {
        // List all jobs for the test user and delete them
        const listResponse = await page.request.get(`${API_URL}/jobs?include_disabled=true`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (listResponse.ok()) {
            const data = await listResponse.json();
            for (const job of data.items) {
                await page.request.delete(`${API_URL}/jobs/${job.id}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
            }
        }
    }
    catch (error) {
        console.warn('Failed to cleanup test jobs:', error);
    }
}
/**
 * Extended test with authentication fixture
 */
exports.test = test_1.test.extend({
    authenticatedPage: async ({ page }, use) => {
        try {
            const token = await getTestToken(page);
            await authenticatePage(page, token);
            await use(page);
            await cleanupTestJobs(page, token);
        }
        catch (error) {
            // If test endpoint not available, skip auth tests
            console.warn('Auth setup failed, tests may fail:', error);
            await use(page);
        }
    },
    apiToken: async ({ page }, use) => {
        const token = await getTestToken(page);
        await use(token);
    },
});
//# sourceMappingURL=fixtures.js.map