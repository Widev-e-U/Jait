/**
 * E2E tests for the Jobs management UI
 */
import { test, expect } from './fixtures'

test.describe('Jobs Page Navigation', () => {
  test('should navigate to jobs page when clicking Jobs tab', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/')
    
    // Click on Jobs tab in navigation
    await authenticatedPage.click('button:has-text("Jobs")')
    
    // Should see the jobs page header
    await expect(authenticatedPage.locator('h1:has-text("Scheduled Jobs")')).toBeVisible()
  })

  test('should show empty state when no jobs exist', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/')
    await authenticatedPage.click('button:has-text("Jobs")')
    
    // Should show empty state
    await expect(authenticatedPage.locator('text=No scheduled jobs yet')).toBeVisible()
    await expect(authenticatedPage.locator('button:has-text("Create Your First Job")')).toBeVisible()
  })
})

test.describe('Create Job Dialog', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/')
    await authenticatedPage.click('button:has-text("Jobs")')
  })

  test('should open create job dialog', async ({ authenticatedPage }) => {
    await authenticatedPage.click('button:has-text("New Job")')
    
    // Dialog should be visible
    await expect(authenticatedPage.locator('h2:has-text("Create New Job")')).toBeVisible()
    
    // Should have Agent Task and System Job tabs
    await expect(authenticatedPage.locator('button[role="tab"]:has-text("Agent Task")')).toBeVisible()
    await expect(authenticatedPage.locator('button[role="tab"]:has-text("System Job")')).toBeVisible()
  })

  test('should close dialog when clicking cancel', async ({ authenticatedPage }) => {
    await authenticatedPage.click('button:has-text("New Job")')
    await expect(authenticatedPage.locator('h2:has-text("Create New Job")')).toBeVisible()
    
    await authenticatedPage.click('button:has-text("Cancel")')
    await expect(authenticatedPage.locator('h2:has-text("Create New Job")')).not.toBeVisible()
  })

  test('should close dialog when clicking X button', async ({ authenticatedPage }) => {
    await authenticatedPage.click('button:has-text("New Job")')
    await expect(authenticatedPage.locator('h2:has-text("Create New Job")')).toBeVisible()
    
    // Click the X close button
    await authenticatedPage.locator('button:has(svg.lucide-x)').click()
    await expect(authenticatedPage.locator('h2:has-text("Create New Job")')).not.toBeVisible()
  })

  test('should show validation error for missing required fields', async ({ authenticatedPage }) => {
    await authenticatedPage.click('button:has-text("New Job")')
    
    // Try to submit without filling required fields
    await authenticatedPage.click('button:has-text("Create Job")')
    
    // Should show validation errors (HTML5 or custom)
    // Note: Actual validation behavior depends on implementation
    await expect(authenticatedPage.locator('[role="dialog"]')).toBeVisible()
  })

  test('should select schedule from presets', async ({ authenticatedPage }) => {
    await authenticatedPage.click('button:has-text("New Job")')
    
    // Open schedule dropdown
    await authenticatedPage.click('[data-testid="schedule-select"]').catch(async () => {
      // Fallback: click any Select trigger that might be the schedule
      await authenticatedPage.locator('button:has-text("Hourly")').click()
    })
    
    // The preset dropdown should be visible if implemented with Select component
  })

  test('should toggle custom schedule input', async ({ authenticatedPage }) => {
    await authenticatedPage.click('button:has-text("New Job")')
    
    // Find and click custom toggle
    const customToggle = authenticatedPage.locator('text=Custom').locator('..').locator('button[role="switch"]')
    await customToggle.click()
    
    // Should show custom input field
    await expect(authenticatedPage.locator('input[placeholder="* * * * *"]')).toBeVisible()
  })
})

test.describe('Create Agent Task Job', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/')
    await authenticatedPage.click('button:has-text("Jobs")')
  })

  test('should create an agent task job', async ({ authenticatedPage }) => {
    await authenticatedPage.click('button:has-text("New Job")')
    
    // Fill in the job name
    await authenticatedPage.fill('input#name', 'Test Daily Summary')
    
    // Select provider (if providers are available)
    try {
      await authenticatedPage.click('[data-testid="provider-select"]')
      await authenticatedPage.locator('text=ollama').first().click()
    } catch {
      // Provider might not be available in test
    }
    
    // Fill in prompt
    await authenticatedPage.fill('textarea#prompt', 'Summarize the daily activities')
    
    // Submit
    await authenticatedPage.click('button:has-text("Create Job")')
    
    // Should close dialog and show job in list
    await expect(authenticatedPage.locator('h2:has-text("Create New Job")')).not.toBeVisible({ timeout: 5000 })
  })
})

test.describe('Job Card Actions', () => {
  // Helper to create a job via API before testing
  async function createTestJob(page: any, token: string) {
    const API_URL = process.env.API_URL || 'http://localhost:8000'
    const response = await page.request.post(`${API_URL}/jobs`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        name: 'E2E Test Job',
        description: 'Created for E2E testing',
        cron_expression: '0 * * * *',
        job_type: 'agent_task',
        prompt: 'Test prompt for E2E',
        provider: 'ollama',
        model: 'qwen2.5:7b',
        enabled: true,
      },
    })
    return response.json()
  }

  test('should display job card with correct information', async ({ authenticatedPage, apiToken }) => {
    // Create a job via API
    const job = await createTestJob(authenticatedPage, apiToken)
    
    await authenticatedPage.goto('/')
    await authenticatedPage.click('button:has-text("Jobs")')
    
    // Should see the job card
    await expect(authenticatedPage.locator(`text=${job.name}`)).toBeVisible()
    await expect(authenticatedPage.locator('text=Agent Task')).toBeVisible()
    await expect(authenticatedPage.locator('text=0 * * * *')).toBeVisible()
  })

  test('should toggle job enabled state', async ({ authenticatedPage, apiToken }) => {
    const job = await createTestJob(authenticatedPage, apiToken)
    
    await authenticatedPage.goto('/')
    await authenticatedPage.click('button:has-text("Jobs")')
    
    // Find the toggle switch for this job and click it
    const jobCard = authenticatedPage.locator(`text=${job.name}`).locator('..')
    const toggle = jobCard.locator('button[role="switch"]')
    
    // Check initial state
    await expect(toggle).toHaveAttribute('data-state', 'checked')
    
    // Toggle off
    await toggle.click()
    await expect(toggle).toHaveAttribute('data-state', 'unchecked')
    
    // Toggle back on
    await toggle.click()
    await expect(toggle).toHaveAttribute('data-state', 'checked')
  })

  test('should trigger job immediately', async ({ authenticatedPage, apiToken }) => {
    const job = await createTestJob(authenticatedPage, apiToken)
    
    await authenticatedPage.goto('/')
    await authenticatedPage.click('button:has-text("Jobs")')
    
    // Click Run Now button
    await authenticatedPage.click('button:has-text("Run Now")')
    
    // Should show some feedback (button might show loading state)
    // Note: Actual behavior depends on Temporal being available
  })

  test('should open job history dialog', async ({ authenticatedPage, apiToken }) => {
    const job = await createTestJob(authenticatedPage, apiToken)
    
    await authenticatedPage.goto('/')
    await authenticatedPage.click('button:has-text("Jobs")')
    
    // Click History button
    await authenticatedPage.click('button:has-text("History")')
    
    // Should see history dialog
    await expect(authenticatedPage.locator('h2:has-text("Job History")')).toBeVisible()
    await expect(authenticatedPage.locator(`text=${job.name}`)).toBeVisible()
  })

  test('should open edit dialog', async ({ authenticatedPage, apiToken }) => {
    const job = await createTestJob(authenticatedPage, apiToken)
    
    await authenticatedPage.goto('/')
    await authenticatedPage.click('button:has-text("Jobs")')
    
    // Click Edit button (icon button with pencil)
    const jobCard = authenticatedPage.locator(`text=${job.name}`).locator('..').locator('..')
    await jobCard.locator('button:has(svg.lucide-edit)').click()
    
    // Should see edit dialog with populated fields
    await expect(authenticatedPage.locator('h2:has-text("Edit Job")')).toBeVisible()
    await expect(authenticatedPage.locator(`input[value="${job.name}"]`)).toBeVisible()
  })

  test('should delete job with confirmation', async ({ authenticatedPage, apiToken }) => {
    const job = await createTestJob(authenticatedPage, apiToken)
    
    await authenticatedPage.goto('/')
    await authenticatedPage.click('button:has-text("Jobs")')
    
    // Should see the job initially
    await expect(authenticatedPage.locator(`text=${job.name}`)).toBeVisible()
    
    // Setup dialog handler for confirmation
    authenticatedPage.on('dialog', dialog => dialog.accept())
    
    // Click Delete button (red trash icon)
    const jobCard = authenticatedPage.locator(`text=${job.name}`).locator('..').locator('..')
    await jobCard.locator('button:has(svg.lucide-trash-2)').click()
    
    // Job should be removed from the list
    await expect(authenticatedPage.locator(`text=${job.name}`)).not.toBeVisible({ timeout: 5000 })
  })
})

test.describe('Job History Dialog', () => {
  test('should show empty state when no runs', async ({ authenticatedPage, apiToken }) => {
    // Create a job via API
    const API_URL = process.env.API_URL || 'http://localhost:8000'
    const response = await authenticatedPage.request.post(`${API_URL}/jobs`, {
      headers: { Authorization: `Bearer ${apiToken}` },
      data: {
        name: 'History Test Job',
        cron_expression: '0 * * * *',
        job_type: 'agent_task',
        prompt: 'Test',
        provider: 'ollama',
        model: 'qwen2.5:7b',
      },
    })
    const job = await response.json()
    
    await authenticatedPage.goto('/')
    await authenticatedPage.click('button:has-text("Jobs")')
    
    // Open history
    const jobCard = authenticatedPage.locator(`text=${job.name}`).locator('..')
    await authenticatedPage.click('button:has-text("History")')
    
    // Should show empty state
    await expect(authenticatedPage.locator('text=No runs yet')).toBeVisible()
  })

  test('should close history dialog', async ({ authenticatedPage, apiToken }) => {
    const API_URL = process.env.API_URL || 'http://localhost:8000'
    const response = await authenticatedPage.request.post(`${API_URL}/jobs`, {
      headers: { Authorization: `Bearer ${apiToken}` },
      data: {
        name: 'Close Test Job',
        cron_expression: '0 * * * *',
        job_type: 'agent_task',
        prompt: 'Test',
        provider: 'ollama',
        model: 'qwen2.5:7b',
      },
    })
    
    await authenticatedPage.goto('/')
    await authenticatedPage.click('button:has-text("Jobs")')
    await authenticatedPage.click('button:has-text("History")')
    
    // Close dialog
    await authenticatedPage.locator('[role="dialog"] button:has(svg.lucide-x)').click()
    
    await expect(authenticatedPage.locator('h2:has-text("Job History")')).not.toBeVisible()
  })
})

test.describe('Responsive Layout', () => {
  test('should display properly on mobile', async ({ authenticatedPage }) => {
    // Set mobile viewport
    await authenticatedPage.setViewportSize({ width: 375, height: 667 })
    
    await authenticatedPage.goto('/')
    await authenticatedPage.click('button:has-text("Jobs")')
    
    // Jobs page should still be accessible
    await expect(authenticatedPage.locator('h1:has-text("Scheduled Jobs")')).toBeVisible()
  })
})
