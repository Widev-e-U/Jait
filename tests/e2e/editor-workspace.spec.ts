import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
const ROOT = path.resolve(__dirname, '../..')
const webRequire = createRequire(path.join(ROOT, 'apps/web/package.json'))
const monacoRequire = createRequire(webRequire.resolve('@monaco-editor/react/package.json'))
const monacoRoot = path.dirname(monacoRequire.resolve('monaco-editor/min/vs/loader.js'))
import { registerTestUser } from './helpers/agent-user'
const API_URL = process.env.API_URL || 'http://localhost:8000'
if (process.env.EDITOR_BUNDLE_ROOT) test.use({ launchOptions: { args: ['--disable-features=LocalNetworkAccessChecks,LocalNetworkAccessChecksWebSockets'] } })
for (const diffOnly of [false, true]) {
test(diffOnly ? 'hide editor opened by edit tool arrow' : 'hide editor with restored open files', async ({page,request}) => {
 test.setTimeout(45000)
 const errors: string[] = []
 page.on('console', msg => { if (msg.type() === 'error' && /Maximum update depth|React error|ErrorBoundary/.test(msg.text())) console.log(msg.text()) })
 page.on('pageerror', error => { errors.push(error.message); console.log(error.stack) })
 const response = await registerTestUser(request, API_URL, {data:{username:`editor-${Date.now()}`,password:'supersecret123'}})
 expect(response.ok()).toBeTruthy()
 const {access_token:token} = await response.json()
 const headers = {Authorization:`Bearer ${token}`}
 const rootPath = ROOT.replace(/\/$/, '')
 const p = await request.post(`${API_URL}/api/projects`,{headers,data:{rootPath,nodeId:'gateway',title:'Editor regression'}})
 const project = await p.json()
 const s = await request.post(`${API_URL}/api/projects/${project.id}/sessions`,{headers,data:{name:'Editor test'}})
 const session = await s.json()
 if (diffOnly) {
   // Replay a completed edit without modifying a project file or running a model.
   await page.route(`**/api/sessions/${session.id}/messages?*`, async route => {
     const response = await route.fetch()
     const data = await response.json()
     await route.fulfill({ json: { ...data, total: 1, messages: [{
       id: 'edit-message', role: 'assistant', content: 'Edited the file.',
       toolCalls: [{ callId: 'edit-test', tool: 'edit',
         args: { file_path: rootPath+'/package.json', old_string: 'jait', new_string: 'jait' },
         ok: true, message: 'Edited file', startedAt: 1, completedAt: 2 }],
     }] } })
   })
 }
 await request.patch(`${API_URL}/api/projects/${project.id}/state`,{headers,data:{'project.ui':{
 panel:{open:true,remotePath:rootPath,nodeId:'gateway'},
 tabs:{remoteRoot:rootPath,tabs:diffOnly ? [] : [{path:rootPath+'/package.json'}, {path:rootPath+'/apps/web/public/icon.svg'}],activePath:rootPath+'/package.json'},
 layout:{tree:!diffOnly,editor:!diffOnly,panelSize:800,treeSize:300},terminal:null,preview:null}}})
 await request.post(`${API_URL}/api/projects/select`,{headers,data:{projectId:project.id,sessionId:session.id}})
 await page.context().addCookies([{name:'jait_token',value:token,url:API_URL,httpOnly:true,sameSite:'Lax'}])
 await page.addInitScript(([url,t])=>{localStorage.setItem('jait-gateway-url',url);localStorage.setItem('jait-auth-token',t);localStorage.setItem('developerSidebarView','files');localStorage.setItem('jait.navigationSidebarCollapsed','true');localStorage.setItem('showSessionsSidebar','true');sessionStorage.setItem('jait:loop-error-auto-reloaded','1')},[API_URL,token])
 await page.setViewportSize({width:1280,height:1000})
 await page.route('https://cdn.jsdelivr.net/npm/monaco-editor@*/min/vs/**', async route => {
   const suffix = new URL(route.request().url()).pathname.split('/min/vs/')[1]
   const body = await readFile(path.resolve(monacoRoot, suffix))
   await route.fulfill({body, contentType:suffix.endsWith('.css')?'text/css':'application/javascript'})
 })
 if (process.env.EDITOR_BUNDLE_ROOT) {
   await page.addInitScript(([frontend, gateway]) => {
     const NativeWebSocket = window.WebSocket
     window.WebSocket = class extends NativeWebSocket {
       constructor(url: string | URL, protocols?: string | string[]) {
         const target = new URL(String(url), location.href)
         if (target.host === new URL(frontend).host) target.host = new URL(gateway).host
         super(target.href, protocols)
       }
     }
   }, [process.env.FRONTEND_URL!, API_URL])
   await page.route(`${process.env.FRONTEND_URL}/**`, async route => {
     const pathname = new URL(route.request().url()).pathname
     if (pathname === '/' || pathname.startsWith('/assets/')) {
       const file = path.join(process.env.EDITOR_BUNDLE_ROOT!, pathname === '/' ? 'index.html' : pathname)
       await route.fulfill({body:await readFile(file),contentType:pathname === '/' ? 'text/html' : pathname.endsWith('.css') ? 'text/css' : 'application/javascript'})
     } else await route.fallback()
   })
 }
 await page.goto('/', {waitUntil:'domcontentloaded'})
 if (process.env.EDITOR_BUNDLE_ROOT) {
   await page.getByRole('button',{name:'Projects & Chats',exact:true}).click()
   if (!diffOnly) await page.getByRole('button',{name:'Files',exact:true}).click()
   if (!diffOnly) await page.getByText('package.json',{exact:true}).first().click({timeout:20000})
 }
 if (!diffOnly) await expect(page.locator(`[data-tab-id="file:${rootPath}/package.json"]`)).toBeVisible({timeout:30000})
 if (!diffOnly) await expect(page.locator('.monaco-editor').first()).toBeVisible({timeout:30000})
 if (!process.env.EDITOR_BUNDLE_ROOT && !diffOnly) {
   await page.locator(`[data-tab-id="file:${rootPath}/apps/web/public/icon.svg"]`).click()
   await expect(page.getByTestId('project-image-viewer').getByRole('img')).toBeVisible()
   await page.getByRole('button', {name:'Fullscreen image',exact:true}).click()
   await expect(page.getByRole('dialog').getByRole('img')).toBeVisible()
   await page.keyboard.press('Escape')
   await page.locator(`[data-tab-id="file:${rootPath}/package.json"]`).click()
 }
 if (diffOnly) {
   // Let initial project hydration and its persisted layout settle before the action.
   await page.waitForTimeout(2500)
   await page.locator('button').filter({has:page.locator('svg.lucide-external-link')}).first().click()
   await expect(page.locator('.monaco-diff-editor')).toBeVisible()
 }
 if (!diffOnly) await page.locator('button').filter({has:page.locator('svg.lucide-eye-off')}).first().click()
 const hideButtons = page.locator('button').filter({has:page.locator('svg.lucide-eye-off')})
 await hideButtons.last().click()
 await expect(page.locator('.monaco-editor')).toHaveCount(0)
 await expect(page.getByText(/React error|Maximum update depth/)).toHaveCount(0)
 await page.getByRole('button', {name:'Files',exact:true}).click()
 await page.getByText('package.json', {exact:true}).first().click()
 await expect(page.locator(`[data-tab-id="file:${rootPath}/package.json"]`)).toBeVisible()
 expect(errors).toEqual([])
})
}
