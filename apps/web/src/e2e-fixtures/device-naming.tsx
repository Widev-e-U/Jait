import { createRoot } from 'react-dom/client'
import { DeviceNameDialog } from '@/components/onboarding/DeviceNameDialog'
import { useUICommands } from '@/hooks/useUICommands'
import '@/index.css'

function DeviceNamingFixture() {
  const { deviceNameSetup, submitDeviceName } = useUICommands({ listeners: {}, token: 'fixture-token' })
  return deviceNameSetup ? <DeviceNameDialog {...deviceNameSetup} onSubmit={submitDeviceName} /> : null
}

createRoot(document.getElementById('root')!).render(<DeviceNamingFixture />)
