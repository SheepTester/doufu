import express from 'express'
import http from 'http'
import { WebSocketServer } from 'ws'
import { Connection, Server } from '.'

const gameServer = new Server()

const app = express()
const server = http.createServer(app)
const wss = new WebSocketServer({ server })

console.log(__dirname)
app.use(express.static(__dirname))

wss.on('connection', ws => {
  const connection: Connection = {
    send (message) {
      ws.send(JSON.stringify(message))
    }
  }
  gameServer.handleOpen(connection)
  ws.on('message', data => {
    gameServer.handleMessage(
      connection,
      JSON.parse(Array.isArray(data) ? data.join('') : String(data))
    )
  })
  ws.on('close', () => {
    gameServer.handleClose(connection)
  })
})

server.listen(10069)
console.log('http://localhost:10069/')
