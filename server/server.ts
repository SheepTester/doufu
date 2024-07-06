import express from 'express'
import http from 'http'
import { WebSocketServer } from 'ws'
import { Connection, Server } from '.'
import { decodeClient, encode } from '../common/message'

const gameServer = new Server()

const app = express()
const server = http.createServer(app)
const wss = new WebSocketServer({ server })

app.use(express.static(__dirname))

wss.on('connection', ws => {
  const connection: Connection = {
    send (message) {
      ws.send(encode(message))
    }
  }
  gameServer.handleOpen(connection)
  ws.on('message', data => {
    gameServer.handleMessage(
      connection,
      decodeClient(
        data instanceof ArrayBuffer
          ? data
          : (Array.isArray(data) ? Buffer.concat(data) : data).buffer
      )
    )
  })
  ws.on('close', () => {
    gameServer.handleClose(connection)
  })
})

server.listen(10069)
console.log('http://localhost:10069/')
