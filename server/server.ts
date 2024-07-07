import express from 'express'
import http from 'http'
import { WebSocketServer } from 'ws'
import { Connection, Server } from '.'
import { decodeClient, encode } from '../common/message'

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
  gameServer.handleOpen(connection)
  ws.on('message', (data, isBinary) => {
    if (data instanceof Buffer) {
      gameServer.handleMessage(
        connection,
        // Unfortunate copying but this is because `byteOffset` isn't
        // necessarily divisible by 4. Also makes making the decoder less error
        // prone
        decodeClient(
          data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
        )
      )
    }
  })
  ws.on('close', () => {
    gameServer.handleClose(connection)
  })
})

server.listen(10069)
console.log('http://localhost:10069/')
