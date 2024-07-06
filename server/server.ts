import express from 'express'
import http from 'http'
import { WebSocketServer } from 'ws'
import { Connection, Server } from '.'

const server = new Server()

const app = express()
const wss = new WebSocketServer({ server: http.createServer(app) })

app.use(express.static('.'))

wss.on('connection', ws => {
  const connection: Connection = {
    send (message) {
      ws.send(JSON.stringify(message))
    }
  }
  server.handleOpen(connection)
  ws.on('message', data => {
    server.handleMessage(
      connection,
      JSON.parse(Array.isArray(data) ? data.join('') : String(data))
    )
  })
  ws.on('close', () => {
    server.handleClose(connection)
  })
})
