import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
const command=fileURLToPath(new URL('../migration.mjs',import.meta.url))
for(const args of [[],['--backend','unknown'],['--backend','bun','--backend','rust'],['--backend','rust','--active-stream-argv','[]'],['--backend','rust','--active-stream-argv','[1]'],['--backend','rust','--active-stream-argv','[" "]'],['--backend','rust','--active-stream-argv','["native","\\u0000"]']]){
  test(`reject invalid selection before launching Cargo: ${JSON.stringify(args)}`,()=>{
    const result=spawnSync(process.execPath,[command,...args],{encoding:'utf8',timeout:2000,env:{...process.env,CARGO:'/__jait_should_never_launch__'}})
    assert.equal(result.status,1)
    assert.match(result.stderr,/Usage:|required|Invalid active-stream/)
    assert.doesNotMatch(result.stderr,/__jait_should_never_launch__/)
  })
}
const { completeCases, targetCases } = await import('../migration-report.mjs')
test('omitted required scenario remains blocked instead of lowering acceptance',()=>{
  assert.deepEqual(completeCases(['storage/retain','stream/cancel'],[{id:'storage/retain',status:'passed'}]),[
    {id:'storage/retain',status:'passed'},
    {id:'stream/cancel',status:'blocked',reason:'Required scenario was not executed'},
  ])
})
test('duplicate and unregistered observations cannot manufacture passing cases',()=>{
  assert.throws(()=>completeCases(['storage/retain'],[{id:'storage/retain',status:'passed'},{id:'storage/retain',status:'passed'}]),/duplicate/)
  assert.throws(()=>completeCases(['storage/retain'],[{id:'other/case',status:'passed'}]),/Unexpected/)
})
test('a duplicate inventory is invalid even if all observations passed',()=>{
  assert.throws(()=>completeCases(['storage/retain','storage/retain'],[{id:'storage/retain',status:'passed'}]),/inventory/)
})

test('embedded provider fixture checks do not enter the application inventory',()=>{
  const output = [
    'test approved_tool_data_survives_history_replay_restart_and_next_turn ... ok',
    'test provider_fixture::tests::active_fixture_still_rejects_malformed_request_framing ... ok',
    'test provider_fixture::tests::requested_shutdown_abandons_an_incomplete_background_request ... ok',
    'test fixture::backend::tests::literal_argv ... ok',
    'test stream_oracle_ordering ... ok',
  ].join('\n')
  const cases=targetCases('chat_flow',{exit:0,output})
  assert.deepEqual(completeCases(['chat_flow/approved_tool_data_survives_history_replay_restart_and_next_turn'],cases),[
    {id:'chat_flow/approved_tool_data_survives_history_replay_restart_and_next_turn',status:'passed'},
  ])
})
test('a failed embedded fixture still fails a target with passing application cases',()=>{
  const cases=targetCases('chat_flow',{exit:101,output:[
    'test approved_tool ... ok',
    'test provider_fixture::tests::malformed_request ... FAILED',
  ].join('\n')})
  assert.deepEqual(cases,[
    {id:'chat_flow/approved_tool',status:'passed'},
    {id:'chat_flow/setup',status:'failed',reason:'target did not complete successfully'},
  ])
})
test('unregistered application cases remain rejected and missing implementations remain blocked',()=>{
  assert.throws(()=>completeCases(['chat_flow/approved_tool'],targetCases('chat_flow',{
    exit:0,output:'test new_unregistered_scenario ... ok',
  })),/Unexpected/)
  assert.deepEqual(targetCases('chat_flow',{exit:101,output:[
    'test approved_tool ... FAILED',
    '---- approved_tool stdout ----',
    'missing backend implementation: consent',
  ].join('\n')}),[{id:'chat_flow/approved_tool',status:'blocked'}])
})
