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
})
