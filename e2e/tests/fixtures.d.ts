/**
 * E2E test fixtures for authentication and common setup
 */
import { expect, Page } from '@playwright/test';
export declare const TEST_USER: {
    id: string;
    email: string;
    name: string;
    picture: string;
};
/**
 * Create a test token via the backend test endpoint
 */
export declare function getTestToken(page: Page): Promise<string>;
/**
 * Authenticate a page by setting the auth state
 */
export declare function authenticatePage(page: Page, token: string): Promise<void>;
/**
 * Clean up test jobs after tests
 */
export declare function cleanupTestJobs(page: Page, token: string): Promise<void>;
interface JobsFixtures {
    authenticatedPage: Page;
    apiToken: string;
}
/**
 * Extended test with authentication fixture
 */
export declare const test: import("@playwright/test").TestType<import("@playwright/test").PlaywrightTestArgs & import("@playwright/test").PlaywrightTestOptions & JobsFixtures, import("@playwright/test").PlaywrightWorkerArgs & import("@playwright/test").PlaywrightWorkerOptions>;
export { expect };
//# sourceMappingURL=fixtures.d.ts.map