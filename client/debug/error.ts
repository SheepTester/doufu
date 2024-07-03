const errorMessages = document.getElementById('error')
export function handleError (error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  // Unsure what the error looks like in other browsers, but also, only Chrome
  // supports WebGPU rn
  if (message.includes('exited the lock')) {
    return
  }
  errorMessages?.append(
    Object.assign(document.createElement('span'), {
      textContent: message
    })
  )
  errorMessages?.classList.remove('no-error')
}
window.addEventListener('error', e => {
  handleError(e.error)
})
window.addEventListener('unhandledrejection', e => {
  handleError(e.reason)
})
