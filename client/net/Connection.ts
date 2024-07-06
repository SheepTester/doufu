import type { Worker as NodeWorker, MessagePort } from 'worker_threads'

declare const IS_BROWSER: boolean
declare const __dirname: string

const MAX_ATTEMPTS = 3

type ConnectionState =
  | { type: 'ws'; ws: WebSocket; error: boolean; attemptsLeft: number }
  | { type: 'worker'; worker: Worker | Window | NodeWorker | MessagePort }
  | null

export type ConnectionOptions<ReceiveType, SendType> = {
  onMessage: (message: ReceiveType) => void
  /** Encode a message for WebSocket connections */
  encode?: (
    message: SendType
  ) => string | ArrayBufferLike | Blob | ArrayBufferView
  /** Decode a message from a WebSocket connection */
  decode?: (message: ArrayBuffer) => ReceiveType
}

export class Connection<ReceiveType, SendType = never> {
  options: ConnectionOptions<ReceiveType, SendType>

  #state: ConnectionState = null
  #queue: { message: SendType; transfer: ArrayBuffer[] }[] = []

  constructor (options: ConnectionOptions<ReceiveType, SendType>) {
    this.options = options
  }

  connect (url: string, attemptsLeft = MAX_ATTEMPTS): void {
    this.disconnect()
    const ws = new WebSocket(url)
    ws.binaryType = 'arraybuffer'
    ws.addEventListener('open', () => {
      this.#attemptQueue()
    })
    ws.addEventListener('message', e => {
      if (typeof e.data === 'string') {
        if (this.options.decode) {
          console.log(e.data)
          throw new TypeError(
            'Expected binary message, received string message'
          )
        }
        this.options.onMessage(JSON.parse(e.data))
      } else if (e.data instanceof ArrayBuffer) {
        if (!this.options.decode) {
          console.log(e.data)
          throw new TypeError(
            'Received binary message, but no decoder was given'
          )
        }
        this.options.onMessage(this.options.decode(e.data))
      } else {
        console.log(e.data)
        throw new TypeError(`Unknown message type ${e.data.constructor.name}`)
      }
    })
    ws.addEventListener('error', () => {
      if (this.#state?.type === 'ws' && this.#state.ws === ws) {
        this.#state.error = true
      }
    })
    ws.addEventListener('close', () => {
      if (this.#state?.type === 'ws' && this.#state.ws === ws) {
        if (this.#state.attemptsLeft > 0) {
          this.connect(url, this.#state.attemptsLeft - 1)
        } else {
          this.disconnect()
        }
      }
    })
    this.#state = { type: 'ws', ws, error: false, attemptsLeft }
  }

  async connectWorker (path?: string): Promise<void> {
    let worker: Worker | Window | NodeWorker | MessagePort
    if (IS_BROWSER) {
      worker = path ? new Worker(path) : self
    } else {
      const { Worker, parentPort } = await import('worker_threads')
      const { resolve } = await import('path')
      if (path) {
        worker = new Worker(resolve(__dirname, path.replace('.js', '.cjs')))
      } else {
        if (!parentPort) {
          throw new TypeError(
            'parentPort is null. This is not the main thread. Please pass a `path` to `connectWorker`.'
          )
        }
        worker = parentPort
      }
    }
    // TypeScript hack; for some reason these cases can't merge
    if ('on' in worker) {
      worker.on('message', data => {
        this.options.onMessage(data)
      })
    } else if (worker instanceof Worker) {
      worker.addEventListener('message', e => {
        this.options.onMessage(e.data)
      })
    } else {
      worker.addEventListener('message', e => {
        this.options.onMessage(e.data)
      })
    }
    this.#state = { type: 'worker', worker }
    this.#attemptQueue()
  }

  disconnect (): void {
    if (this.#state?.type === 'ws') {
      if (
        this.#state.ws.readyState === WebSocket.CONNECTING ||
        this.#state.ws.readyState === WebSocket.OPEN
      ) {
        this.#state.ws.close()
      }
    } else if (this.#state?.type === 'worker') {
      if ('terminate' in this.#state.worker) {
        this.#state.worker.terminate()
      }
    }
    this.#state = null
  }

  #attemptQueue () {
    const queue = this.#queue
    this.#queue = []
    for (const { message, transfer } of queue) {
      this.send(message, transfer)
    }
  }

  send (message: SendType, transfer: ArrayBuffer[] = []): void {
    if (
      this.#state?.type === 'ws' &&
      this.#state.ws.readyState === WebSocket.OPEN
    ) {
      if (this.options.encode) {
        this.#state.ws.send(this.options.encode(message))
      } else {
        this.#state.ws.send(JSON.stringify(message))
      }
    } else if (this.#state?.type === 'worker') {
      if ('on' in this.#state.worker) {
        this.#state.worker.postMessage(message, transfer)
      } else {
        this.#state.worker.postMessage(message, { transfer })
      }
    } else {
      this.#queue.push({ message, transfer })
    }
  }
}
