import { useState } from 'react'
import { DEVICE_NAME_MAX_LENGTH, isAllowedDeviceName, normalizeDeviceName } from '@jait/shared'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

interface DeviceNameDialogProps {
  pending?: boolean
  error?: string
  onSubmit: (name: string) => void
}

export function DeviceNameDialog({ pending, error, onSubmit }: DeviceNameDialogProps) {
  const [draft, setDraft] = useState('')
  const [invalid, setInvalid] = useState(false)
  const [edited, setEdited] = useState(false)
  const name = normalizeDeviceName(draft)
  const errorMessage = invalid ? 'Choose a distinctive name for this device.' : !edited ? error : undefined

  return (
    <Dialog open>
      <DialogContent
        className="w-[calc(100%-2rem)] max-w-sm rounded-lg"
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Name this device</DialogTitle>
          <DialogDescription>This name appears in Jait’s device picker.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={(event) => {
          event.preventDefault()
          if (pending) return
          if (!isAllowedDeviceName(name)) {
            setInvalid(true)
            return
          }
          setEdited(false)
          onSubmit(name)
        }}>
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="setup-device-name">Device name</label>
            <Input
              id="setup-device-name"
              value={draft}
              placeholder="e.g. Office PC"
              maxLength={DEVICE_NAME_MAX_LENGTH}
              autoComplete="off"
              readOnly={pending}
              required
              aria-invalid={!!errorMessage}
              aria-describedby={errorMessage ? 'setup-device-name-error' : undefined}
              onChange={(event) => {
                setDraft(event.target.value)
                setInvalid(false)
                setEdited(true)
              }}
            />
            {errorMessage && <p id="setup-device-name-error" className="text-sm text-red-600 dark:text-red-400" role="alert">{errorMessage}</p>}
          </div>
          <Button className="justify-self-end" type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Save device name'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
