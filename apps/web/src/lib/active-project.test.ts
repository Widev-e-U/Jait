import { describe, expect, it } from 'vitest'

import { activeProjectDuringSwitch } from './active-project'

describe('activeProjectDuringSwitch', () => {
  it('drops the old filesystem surface as soon as another project is selected', () => {
    expect(activeProjectDuringSwitch(
      { surfaceId: 'surface-old', projectRoot: '/gateway/old', nodeId: 'gateway' },
      { rootPath: 'C:\\code\\windows-project', nodeId: 'windows-node' },
    )).toEqual({
      surfaceId: '',
      projectRoot: 'C:\\code\\windows-project',
      nodeId: 'windows-node',
      opening: true,
    })
  })

  it('does not wait for a project open request when there is no session', () => {
    const current = { surfaceId: 'surface', projectRoot: '/project', nodeId: 'gateway' }
    expect(activeProjectDuringSwitch(current, { rootPath: '/project', nodeId: 'gateway' }, false))
      .toEqual({ ...current, opening: false })
    expect(activeProjectDuringSwitch(current, { rootPath: '/other', nodeId: 'gateway' }, false)).toBeNull()
    expect(activeProjectDuringSwitch(current, { rootPath: '/project', nodeId: 'remote' }, false)).toBeNull()
  })
})
