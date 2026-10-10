import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

test.setTimeout(90_000)

test('guided scope, evidence, remediation, inconclusive and successful verification, monitoring and export', async ({ page }, testInfo) => {
  const now = new Date().toISOString()
  const scope = { id:'scope', targets:['192.0.2.10'], exclusions:[], ports:[80], methods:['http'], authorized:true, expiresAt:new Date(Date.now()+3_600_000).toISOString(), createdAt:now, operatorId:'owner', nodeId:'gateway', vantagePoint:'fixture-gateway', profile:'tcp-connect-v1' }
  let finding = { id:'finding', scopeId:scope.id, runId:'run', ruleId:'http.nosniff', target:'192.0.2.10', port:80, title:'Content type protection missing', severity:'low', confidence:'high', status:'observed', disposition:'open', evidenceIds:['evidence'], firstSeen:now, lastSeen:now, remediation:'Add X-Content-Type-Options: nosniff to this response.', rollback:'Restore the original configuration.' }
  let run = { id:'run', scopeId:scope.id, scope, operatorId:'owner', input:{scopeId:scope.id,profile:'http',target:'192.0.2.10',port:80}, profileRevision:'security-profiles-v1', status:'completed', startedAt:now, completedAt:now, engine:'node-http', engineVersion:'test', evidence:[{id:'evidence',target:'192.0.2.10',port:80,observedAt:now,summary:'HTTP response policy',facts:{statusCode:200,nosniff:false}}], findings:[finding], findingIds:['finding'], coverageGaps:['GET / only; no WAN reachability established.'] }
  const baseline={...run,id:"baseline",startedAt:new Date(Date.now()-60_000).toISOString()}
  let started=false, verification=0, monitored=false
  await page.route('**/api/security/**', async route => {
    expect(route.request().headers().authorization).toBe('Bearer assessment-test-token')
    const path=new URL(route.request().url()).pathname
    const method=route.request().method()
    let body:unknown
    if(path.endsWith('/workbench')) body={runs:started?[run,baseline]:[],findings:started?[finding]:[]}
    else if(path.endsWith('/engines')) body=[{name:'nmap',available:false,version:null},{name:'nuclei',available:true,version:'fixture'},{name:'trivy',available:true,version:'fixture'}]
    else if(path.endsWith('/scopes')) {
      const input=route.request().postDataJSON()
      expect(input.targets).toEqual(['192.0.2.10']);expect(input.methods).toEqual(['http']);expect(input.authorized).toBe(true)
      body=scope
    } else if(path.endsWith('/checks')&&method==='POST') {
      expect(route.request().postDataJSON()).toEqual(run.input)
      started=true;body=run
    } else if(path.endsWith('/plan')) body={findingId:finding.id,target:finding.target,recommendation:finding.remediation,steps:['Back up the current configuration.','Add nosniff and validate syntax.'],rollback:['Restore the original configuration.'],verificationInput:run.input,requiresApproval:true}
    else if(path.endsWith('/verify')) {
      verification++
      if(verification===2) { finding={...finding,disposition:'verified-absent'};run={...run,findings:[],findingIds:[]} }
      body={findingId:finding.id,runId:run.id,status:verification===1?'inconclusive':'verified-absent',reason:verification===1?'Response coverage is incomplete.':'Same check completed and the rule was absent.'}
    } else if(path.endsWith('/comparisons')) { expect(route.request().postDataJSON()).toEqual({beforeRunId:'baseline',afterRunId:'run'});body={beforeRunId:'baseline',afterRunId:'run',comparable:true,addedRules:[],noLongerObservedRules:['http.nosniff'],coverageGaps:[]} }
    else if(path.endsWith('/report')) body={run:{id:run.id,status:'completed'},evidence:[{target:'asset-1'}]}
    else if(path.endsWith('/monitors')) { monitored=true;expect(route.request().postDataJSON().minutes).toBe(15);body={jobId:'monitor',expiresAt:scope.expiresAt} }
    else body=run
    await route.fulfill({contentType:'application/json',body:JSON.stringify(body)})
  })
  await page.goto('/security-workbench.html',{waitUntil:'domcontentloaded'})
  await selectWorkbenchOption(page, 'Security check profile', 'http')
  const start=page.getByRole('button',{name:'Run selected check'})
  await expect(start).toBeDisabled()
  await page.getByRole('textbox',{name:'Security target IP'}).fill('192.0.2.10')
  await page.getByRole('textbox',{name:'Security target port'}).fill('80')
  const consent=page.getByRole('checkbox',{name:'I own or am authorized'})
  await consent.check()
  await page.getByRole('textbox',{name:'Security target port'}).fill('443')
  await expect(consent).not.toBeChecked()
  await page.getByRole('textbox',{name:'Security target port'}).fill('80')
  await consent.check();await start.click()
  await expect(page.getByRole('heading',{name:'http · completed'})).toBeVisible()
  await page.getByText('HTTP response policy',{exact:false}).click()
  await expect(page.getByText('"nosniff": false',{exact:false})).toBeVisible()
  await page.getByRole('button',{name:'Monitor this check every 15 minutes'}).click()
  await expect(page.getByRole('status')).toContainText('disables itself')
  expect(monitored).toBe(true)
  const download=page.waitForEvent('download')
  await page.getByRole('button',{name:'Export redacted report'}).click()
  expect((await download).suggestedFilename()).toBe('jait-security-report.json')
  await page.getByRole('tab',{name:'Findings'}).click()
  await page.getByRole('button',{name:'Prepare fix and rollback'}).click()
  await expect(page.getByRole('region',{name:'Remediation plan'})).toContainText('Restore the original configuration.')
  await page.getByRole('button',{name:'Verify same check'}).click()
  await expect(page.getByRole('status')).toContainText('inconclusive')
  await expect(page.getByText('low · observed · high confidence · open')).toBeVisible()
  await page.getByRole('button',{name:'Verify same check'}).click()
  await expect(page.getByRole('status')).toContainText('verified-absent')
  await expect(page.getByText('low · observed · high confidence · verified-absent')).toBeVisible()
  await page.screenshot({path: testInfo.outputPath('security-workbench-preview.png'),fullPage:true})
  await page.getByRole('tab',{name:'Security checks',exact:true}).click()
  await page.getByRole('button',{name:'Compare previous check'}).click()
  await expect(page.getByText('No longer observed rules: http.nosniff.')).toBeVisible()
  await selectWorkbenchOption(page, 'Security check profile', 'nmap')
  await expect(page.getByText('Install nmap on the gateway',{exact:false})).toBeVisible()
  await consent.check();await expect(start).toBeDisabled()
})

test('failed scope creation stays visible and never runs the scanner',async({page})=>{
 let scan=false
 await page.route('**/api/security/**',async route=>{
  const path=new URL(route.request().url()).pathname
  if(path.endsWith('/scopes')) await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'Target is excluded from authorization'})})
  else { if(path.endsWith('/checks')&&route.request().method()==='POST') scan=true;await route.fulfill({contentType:'application/json',body:path.endsWith('/engines')?'[]':'{"runs":[],"findings":[]}'}) }
 })
 await page.goto('/security-workbench.html',{waitUntil:'domcontentloaded'})
 await page.getByRole('textbox',{name:'Security target IP'}).fill('192.0.2.10')
 await page.getByRole('checkbox',{name:'I own or am authorized'}).check()
 await page.getByRole('button',{name:'Run selected check'}).click()
 await expect(page.getByRole('alert')).toContainText('excluded')
 expect(scan).toBe(false)
})

test('all profiles send only the selected authorized method and preserve their specific settings',async({page})=>{
 let selected='tls', scopeCount=0, lastRun:unknown=null
 const expiresAt=new Date(Date.now()+3_600_000).toISOString()
 await page.route('**/api/security/**',async route=>{
  const path=new URL(route.request().url()).pathname
  let body:unknown
  if(path.endsWith('/engines'))body=['nmap','nuclei','trivy'].map(name=>({name,available:true,version:'fixture'}))
  else if(path.endsWith('/workbench'))body={runs:lastRun?[lastRun]:[],findings:[]}
  else if(path.endsWith('/scopes')){
   const input=route.request().postDataJSON();expect(input.methods).toEqual([selected]);expect(input.authorized).toBe(true)
   if(['trivy','telemetry'].includes(selected)){expect(input.sessionId).toBe('fixture-chat');expect(input.paths).toHaveLength(1)}
   body={...input,id:'scope-'+(++scopeCount),expiresAt,createdAt:new Date().toISOString(),operatorId:'owner',nodeId:'gateway',vantagePoint:'fixture',profile:'tcp-connect-v1'}
  }else{
   const input=route.request().postDataJSON();expect(input.profile).toBe(selected)
   if(selected==='tls')expect(input.serverName).toBe('fixture.example')
   if(selected==='host-audit')expect(input.username).toBe('fixture-user')
   if(selected==='nuclei')expect(input.scheme).toBe('https')
   if(selected==='trivy')expect(input.includePackages).toBe(true)
   if(selected==='telemetry')expect(input.source).toBe('wazuh')
   lastRun={id:'run-'+scopeCount,scopeId:input.scopeId,input,scope:{expiresAt,vantagePoint:'fixture'},status:'completed',startedAt:new Date().toISOString(),completedAt:new Date().toISOString(),engine:selected,engineVersion:'fixture',profileRevision:'security-profiles-v1',evidence:[],findings:[],findingIds:[],coverageGaps:['Fixture coverage only']}
   body=lastRun
  }
  await route.fulfill({contentType:'application/json',body:JSON.stringify(body)})
 })
 await page.goto('/security-workbench.html',{waitUntil:'domcontentloaded'})
 await page.getByRole('textbox',{name:'Security target IP'}).fill('192.0.2.10')
 await page.getByRole('textbox',{name:'Security target port'}).fill('443')
 for(const profile of ['tls','http','https','ssh','host-audit','nmap','nuclei','trivy','telemetry']){
  selected=profile
  await selectWorkbenchOption(page, 'Security check profile', profile)
  const consent=page.getByRole('checkbox',{name:'I own or am authorized'})
  await expect(consent).not.toBeChecked()
  if(profile==='tls')await page.getByRole('textbox',{name:'Expected TLS server name'}).fill('fixture.example')
  if(profile==='host-audit')await page.getByRole('textbox',{name:'Authorized SSH username'}).fill('fixture-user')
  if(profile==='nuclei')await selectWorkbenchOption(page, 'Web transport', 'https')
  if(profile==='trivy'){
   await page.getByRole('textbox',{name:'Authorized project path'}).fill('Dockerfile')
   await page.getByRole('checkbox',{name:'Include package CVE correlation'}).check()
  }
  if(profile==='telemetry'){
   await page.getByRole('textbox',{name:'Authorized project path'}).fill('alerts.jsonl')
   await selectWorkbenchOption(page, 'Sensor format', 'wazuh')
  }
  await consent.check();await page.getByRole('button',{name:'Run selected check'}).click()
  await expect(page.getByRole('heading',{name:profile+' · completed'})).toBeVisible()
 }
 expect(scopeCount).toBe(9)
})

async function selectWorkbenchOption(page: Page, name: string, value: string) {
  await page.getByRole('combobox', { name }).click()
  const labels: Record<string, string> = { http: 'HTTP headers', nmap: 'Nmap TCP inventory', tls: 'TLS certificate', https: 'HTTPS headers', ssh: 'SSH identification', 'host-audit': 'Read-only host audit', nuclei: 'Reviewed web check', trivy: 'Software configuration', telemetry: 'Import sensor alerts', wazuh: 'Wazuh alert JSONL', suricata: 'Suricata EVE JSONL' }
  await page.getByRole('option', { name: name === 'Web transport' ? value.toUpperCase() : labels[value] || value, exact: true }).click()
}
