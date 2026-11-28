import { createRoot } from 'react-dom/client'
import { DeviceNameDialog } from '@/components/onboarding/DeviceNameDialog'
import { useUICommands } from '@/hooks/useUICommands'
import { setStoredGatewayUrl } from '@/lib/gateway-url'
import '@/index.css'

function DeviceNamingFixture() {
  const { deviceNameSetup, submitDeviceName } = useUICommands({ listeners: {}, token: 'fixture-token' })
  return deviceNameSetup ? <DeviceNameDialog {...deviceNameSetup} onSubmit={submitDeviceName} /> : null
}

const gatewayUrl = new URLSearchParams(location.search).get('gatewayUrl')
if (gatewayUrl) setStoredGatewayUrl(gatewayUrl)

createRoot(document.getElementById('root')!).render(<DeviceNamingFixture />)
