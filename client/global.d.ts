declare module '*.wgsl' {
  const shader: string
  export default shader
}

declare module '*.png' {
  const path: string
  export default path
}

interface Element {
  // lib.dom.d.ts is missing options parameter and Promise return type
  requestPointerLock(options?: { unadjustedMovement?: boolean }): Promise<void>
}

// https://github.com/microsoft/TypeScript-DOM-lib-generator/issues/1615#issuecomment-1898849841
type OrientationLockType =
  | 'any'
  | 'landscape'
  | 'landscape-primary'
  | 'landscape-secondary'
  | 'natural'
  | 'portrait'
  | 'portrait-primary'
  | 'portrait-secondary'
interface ScreenOrientation extends EventTarget {
  lock(orientation: OrientationLockType): Promise<void>
}
