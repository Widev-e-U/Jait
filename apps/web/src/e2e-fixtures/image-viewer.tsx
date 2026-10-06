import { createRoot } from 'react-dom/client'
import { AttachmentList } from '@/components/chat/attachment-list'

const mount = document.createElement('div')
document.body.replaceChildren(mount)
const data = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200"><rect width="1600" height="1200" fill="#ddd"/><text x="600" y="600" font-size="36">Screenshot details</text></svg>')}`
createRoot(mount).render(<AttachmentList attachments={[{ name: 'capture.svg', mimeType: 'image/svg+xml', data }]} />)
