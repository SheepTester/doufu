import { allowDomExceptions } from '../lib/allowDomExceptions'

export type KeyInput = {
  forward: boolean
  backward: boolean
  left: boolean
  right: boolean
  jump: boolean
  sneak: boolean
  toggleCollisions: boolean
  toggleFlight: boolean
  mine: boolean
  place: boolean
}

const defaultKeys = (): KeyInput => ({
  forward: false,
  backward: false,
  left: false,
  right: false,
  jump: false,
  sneak: false,
  toggleCollisions: false,
  toggleFlight: false,
  mine: false,
  place: false
})

/**
 * The number of radians to rotate the camera by.
 *
 * Confusingly, the mouse axes and rotation axes are flipped, i.e. moving your
 * mouse along the X axis rotates your camera along the Y axis. To avoid this
 * ambiguity, they're called yaw and pitch here.
 */
export type CameraInput = {
  yaw: number
  pitch: number
  roll: number
}

const defaultCamera = (): CameraInput => ({ yaw: 0, pitch: 0, roll: 0 })

export interface InputProvider {
  keys: KeyInput
  camera: CameraInput
  resetCamera(): void
}

type DragState = {
  pointerId: number
  lastX: number
  lastY: number
}

export class UserInput implements InputProvider {
  keys = defaultKeys()
  /** Cumulative camera motion. */
  camera = defaultCamera()

  /** In radians/px */
  sensitivity = 1 / 400
  keymap: Record<string, keyof KeyInput>

  constructor (keymap: Record<string, keyof KeyInput>) {
    this.keymap = keymap
  }

  #handleMouseMove ({
    movementX,
    movementY
  }: {
    movementX: number
    movementY: number
  }) {
    this.camera.yaw -= movementX * this.sensitivity
    this.camera.pitch -= movementY * this.sensitivity
  }

  listen (element: HTMLElement): void {
    element.addEventListener('mousemove', e => {
      if (document.pointerLockElement === element) {
        this.#handleMouseMove(e)
      }
    })

    let dragState: DragState | null = null
    let lastPointerType = 'mouse'
    element.addEventListener('pointerdown', e => {
      lastPointerType = e.pointerType
      if (e.pointerType === 'touch' && !dragState) {
        dragState = {
          pointerId: e.pointerId,
          lastX: e.clientX,
          lastY: e.clientY
        }
        try {
          element.setPointerCapture(e.pointerId)
        } catch (error) {
          allowDomExceptions(error, ['InvalidStateError'])
        }
      }
    })
    element.addEventListener('pointermove', e => {
      if (e.pointerId === dragState?.pointerId) {
        const movementX = e.clientX - dragState.lastX
        const movementY = e.clientY - dragState.lastY
        this.#handleMouseMove({ movementX, movementY })
        dragState.lastX = e.clientX
        dragState.lastY = e.clientY
      }
    })
    const handlePointerEnd = (e: PointerEvent) => {
      if (e.pointerId === dragState?.pointerId) {
        dragState = null
      }
    }
    element.addEventListener('pointerup', handlePointerEnd)
    element.addEventListener('pointercancel', handlePointerEnd)

    element.addEventListener('click', async () => {
      if (lastPointerType === 'mouse') {
        try {
          element.requestPointerLock({ unadjustedMovement: true })
        } catch (error) {
          allowDomExceptions(error, ['SecurityError', 'UnknownError'])
        }
      }

      // Enter landscape mode (Android only)
      // https://developer.mozilla.org/en-US/docs/Web/API/ScreenOrientation/lock
      if (
        'lock' in screen.orientation &&
        screen.orientation.type.startsWith('portrait')
      ) {
        try {
          await document.documentElement.requestFullscreen()
          await screen.orientation.lock('landscape')
        } catch (error) {
          allowDomExceptions(error, ['NotSupportedError'])
        }
      }
    })

    document.addEventListener('keydown', e => {
      if (e.target !== document && e.target !== document.body) {
        return
      }
      this.keys[this.keymap[e.key.toLowerCase()]] = true
      if (document.pointerLockElement === element) {
        e.preventDefault()
      }
    })
    document.addEventListener('keyup', e => {
      this.keys[this.keymap[e.key.toLowerCase()]] = false
    })
    element.addEventListener('pointerdown', e => {
      this.keys[
        this.keymap[
          e.pointerType === 'mouse' ? `mouse${e.button}` : e.pointerType
        ]
      ] = true
    })
    element.addEventListener('pointerup', e => {
      this.keys[
        this.keymap[
          e.pointerType === 'mouse' ? `mouse${e.button}` : e.pointerType
        ]
      ] = false
    })
    // Prevent sticky keys when doing ctrl+shift+tab
    window.addEventListener('blur', () => {
      this.keys = defaultKeys()
    })
  }

  resetCamera (): void {
    this.camera = defaultCamera()
  }
}
