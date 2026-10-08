import { expect, test } from '@playwright/test'
for (const width of [1280, 390]) {
  test(`Go backend and isolated OpenCode account setup work at ${width}px`, async ({ page }) => {
    await page.setViewportSize({width,height:900})
    let connected = false
    let probes = 0
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname
      if (path === '/api/provider-accounts/go-account/opencode-go') {
        expect(route.request().postDataJSON()).toEqual({apiKey:'test-go-key'})
        connected = true
        return route.fulfill({json:{ok:true}})
      }
      if (path === '/api/provider-accounts') return route.fulfill({json:{accounts:[{id:'go-account',providerType:'opencode',nodeId:'gateway',label:'Personal',userId:'tester',createdAt:'',updatedAt:''}],providerTypes:[{providerType:'opencode',name:'OpenCode',description:'Coding agent'}]}})
      if (path === '/api/providers') return route.fulfill({json:{providers:[{id:'go-account',name:'OpenCode · Personal',available:true,models:connected ? [{id:'opencode-go/glm-5.2',name:'GLM 5.2'}] : [],auth:{login:true,logout:connected,deviceCode:false,authenticated:connected,detail:connected ? 'OpenCode Go API key configured.' : 'Not authenticated'}}],remoteProviders:[]}})
      if (path === '/api/providers/backend/test') {
        probes++
        expect(route.request().postDataJSON()).toMatchObject({backend:'opencode-go',base_url:'https://opencode.ai/zen/go/v1',api_key:'backend-go-key'})
        return route.fulfill({json:{ok:true,authenticated:true,modelCount:31,latencyMs:10,sampleModels:['glm-5.2']}})
      }
      return route.fulfill({json:{env_set:{},sources:{},effective:{},nodes:[],devices:[],policies:[],accounts:[],providers:[],remoteProviders:[]}})
    })
    await page.goto('/opencode-go-settings.html', {waitUntil:'domcontentloaded'})
    await page.getByRole('combobox', {name:'Backend type',exact:true}).click()
    await page.getByRole('option',{name:/OpenCode Go$/}).click()
    await expect(page.getByLabel('Backend base URL',{exact:true})).toHaveValue('https://opencode.ai/zen/go/v1')
    await page.getByLabel('Backend API key',{exact:true}).fill('backend-go-key')
    await page.getByRole('button',{name:'Test connection',exact:true}).click()
    await expect.poll(() => probes).toBe(1)
    await expect(page.getByText(/31 models, with API key/)).toBeVisible()
    await page.getByRole('button',{name:'Save API settings',exact:true}).click()
    await expect(page.getByTestId('saved-settings')).toContainText('opencode-go')
    await expect(page.getByTestId('saved-settings')).toContainText('https://opencode.ai/zen/go/v1')
    const key = page.getByLabel('OpenCode Go API key',{exact:true})
    await expect(key).toHaveAttribute('type','password')
    await key.fill('  test-go-key  ')
    await page.getByRole('button',{name:'Connect Go',exact:true}).click()
    await expect(key).toHaveValue('')
    await expect(page.getByText('OpenCode Go API key configured.',{exact:true})).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}
