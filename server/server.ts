import express from 'express'
import http from 'http'
import { WebSocketServer } from 'ws'
import { Connection, Server } from '.'
import { decodeClient, encode } from '../common/message'

const args = process.argv.slice(2)

const gameServer = new Server()

const app = express()
const server = http.createServer(app)
const wss = new WebSocketServer({ server })

app.use((_req, res, next) => {
  res.append('Cross-Origin-Opener-Policy', 'same-origin')
  res.append('Cross-Origin-Embedder-Policy', 'require-corp')
  next()
})
app.use(express.static(__dirname))

wss.on('connection', ws => {
  const connection: Connection = {
    send (message) {
      ws.send(encode(message))
    }
  }
  ws.binaryType = 'arraybuffer'
  gameServer.handleOpen(connection)
  ws.on('message', data => {
    if (data instanceof ArrayBuffer) {
      gameServer.handleMessage(connection, decodeClient(data))
    } else {
      console.error(data)
      throw new TypeError(`Unexpected message type ${data.constructor.name}`)
    }
  })
  ws.on('close', () => {
    gameServer.handleClose(connection)
  })
})

server.listen(10069)
if (!process.env.ESBUILD_SILENT) {
  console.log('http://localhost:10069/')
}
