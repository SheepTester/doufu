import { Connection, Server } from '.'

const server = new Server()

const conn: Connection = {
  id: 0,
  send (message) {
    self.postMessage(message)
  }
}
server.handleOpen(conn)
self.addEventListener('message', e => {
  server.handleMessage(conn, e.data)
})
