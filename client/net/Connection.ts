const MAX_ATTEMPTS = 3

type ConnectionState =
  | { type: 'ws'; ws: WebSocket; error: boolean; attemptsLeft: number }
  | { type: 'worker'; worker: Worker | Window }
  | null

export class Connection<ReceiveType, SendType = never> {
  handleMessage: (message: ReceiveType) => void

  #state: ConnectionState = null
  #queue: SendType[] = []

  constructor (handleMessage: (message: ReceiveType) => void) {
    this.handleMessage = handleMessage
  }

  connect (url: string, attemptsLeft = MAX_ATTEMPTS): void {
    this.disconnect()
    const ws = new WebSocket(url)
    ws.addEventListener('open', () => {
      for (const message of this.#queue) {
        ws.send(JSON.stringify(message))
      }
    })
    ws.addEventListener('message', e => {
      this.handleMessage(JSON.parse(e.data))
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

  connectWorker (path?: string): void {
    const worker = path ? new Worker(path) : self
    for (const message of this.#queue) {
      worker.postMessage(message)
    }
    // TypeScript hack; for some reason these cases can't merge
    if (worker instanceof Worker) {
      worker.addEventListener('message', e => {
        this.handleMessage(e.data)
      })
    } else {
      worker.addEventListener('message', e => {
        this.handleMessage(e.data)
      })
    }
    this.#state = { type: 'worker', worker }
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
      if (this.#state.worker instanceof Worker) {
        this.#state.worker.terminate()
      }
    }
    this.#state = null
  }

  send (message: SendType, transfer: Transferable[] = []): void {
    if (
      this.#state?.type === 'ws' &&
      this.#state.ws.readyState === WebSocket.OPEN
    ) {
      // TODO: Binary data isn't JSON-serializable this way
      this.#state.ws.send(JSON.stringify(message))
    } else if (this.#state?.type === 'worker') {
      this.#state.worker.postMessage(message, { transfer })
    } else {
      this.#queue.push(message)
    }
  }
}
