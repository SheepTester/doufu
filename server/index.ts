import { ClientMessage, ServerMessage } from '../common/message'

export interface Connection {
  id: number
  send(message: ServerMessage): void
}

export class Server {
  handleOpen (conn: Connection): void {
    conn.send({ type: 'pong' })
  }

  handleMessage (conn: Connection, message: ClientMessage): void {
    console.log('message', message)
  }

  handleClose (connId: number): void {
    //
  }
}
