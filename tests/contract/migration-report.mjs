// An omitted/ignored test must not silently lower migration acceptance.
export function completeCases(required, observed) {
  if (!required.length || new Set(required).size !== required.length) throw new Error('Invalid required-case inventory')
  const indexed = new Map()
  for (const result of observed) {
    if (!required.includes(result.id) || indexed.has(result.id)) throw new Error(`Unexpected or duplicate case: ${result.id}`)
    indexed.set(result.id, result)
  }
  return required.map(id => indexed.get(id) ?? { id, status: 'blocked', reason: 'Required scenario was not executed' })
}

// Embedded fixture tests affect target success but are not migration scenarios.
export function targetCases(target, run) {
  const observed = [...run.output.matchAll(/^test ([\w:]+) \.\.\. (ok|FAILED)$/gm)]
  const scenarios = observed.filter(([, id]) => !id.includes('::backend::tests::')
    && !id.startsWith('provider_fixture::tests::') && !id.startsWith('stream_oracle_'))
  const results = scenarios.map(([, id, status]) => {
    const missing = status === 'FAILED' && new RegExp(`---- ${id} stdout ----[\\s\\S]*?(?=\\n---- |\\nfailures:|$)`).exec(run.output)?.[0].includes('missing backend implementation:')
    return { id: `${target}/${id}`, status: status === 'ok' ? 'passed' : missing ? 'blocked' : 'failed' }
  })
  if (!observed.length || (run.exit !== 0 && scenarios.every(([, , status]) => status === 'ok'))) {
    results.push({ id: `${target}/setup`, status: 'failed', reason: 'target did not complete successfully' })
  }
  return results
}
