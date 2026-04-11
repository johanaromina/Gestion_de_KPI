import type { MouseEvent, PointerEvent } from 'react'

export const markOverlayPointerDown = (event: PointerEvent<HTMLDivElement>) => {
  event.currentTarget.dataset.overlayPointerDown = event.target === event.currentTarget ? 'true' : 'false'
}

export const closeOnOverlayClick = (event: MouseEvent<HTMLDivElement>, onClose: () => void) => {
  const shouldClose = event.target === event.currentTarget && event.currentTarget.dataset.overlayPointerDown === 'true'
  event.currentTarget.dataset.overlayPointerDown = 'false'

  if (shouldClose) {
    onClose()
  }
}
