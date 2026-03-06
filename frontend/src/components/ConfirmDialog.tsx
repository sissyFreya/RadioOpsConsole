import * as React from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText,
  confirmVariant,
  onConfirm,
  busy,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  description?: string
  confirmText: string
  confirmVariant?: 'secondary' | 'default' | 'destructive'
  onConfirm: () => void
  busy?: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={confirmVariant || 'default'}
            onClick={() => onConfirm()}
            disabled={busy}
          >
            {busy ? 'Working…' : confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}