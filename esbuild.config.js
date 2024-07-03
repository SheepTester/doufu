// @ts-check

// https://github.com/evanw/esbuild/issues/69#issuecomment-1302521672

import esbuild from 'esbuild'
import fs from 'node:fs/promises'
import http from 'node:http'

const args = process.argv.slice(2)
const serve = args.includes('--serve')

const clientContext = await esbuild.context({
  entryPoints: ['client/index.ts'],
  loader: {
    '.wgsl': 'text',
    '.png': 'file'
  },
  outdir: serve ? 'static/' : 'dist/',
  format: 'esm',
  bundle: true,
  sourcemap: 'linked',
  minify: !serve
})
const workerContext = await esbuild.context({
  entryPoints: ['client/mesh/index.ts', 'server/index.ts'],
  outdir: serve ? 'static/' : 'dist/',
  format: 'iife',
  bundle: true,
  sourcemap: 'linked',
  minify: !serve
})

/**
 * @param {esbuild.ServeResult} server
 * @param {http.IncomingMessage} req
 * @param {boolean} check404
 * @returns {Promise<http.IncomingMessage>}
 */
function request ({ host, port }, req, check404) {
  return new Promise((resolve, reject) => {
    const proxyReq = http.request(
      {
        hostname: host,
        port: port,
        path: req.url,
        method: req.method,
        headers: req.headers
      },
      proxyRes => {
        if (proxyRes.statusCode === 404 && check404) {
          reject(new Error('HTTP 404 error'))
        } else {
          resolve(proxyRes)
        }
      }
    )

    req.pipe(proxyReq, { end: true })
  })
}

if (serve) {
  const headers = {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp'
  }
  const clientServer = await clientContext.serve({ servedir: 'static/' })
  const workerServer = await workerContext.serve({ servedir: 'static/' })
  // Forward requests to client server then worker server
  http
    .createServer((req, res) => {
      if (req.url === '/sheep3.css') {
        res.writeHead(200, { 'Content-Type': 'text/css' })
        res.end()
        return
      }
      if (req.url === '/sheep3.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript' })
        res.end()
        return
      }
      request(
        req.url?.startsWith('/client/') || req.url?.startsWith('/server/')
          ? workerServer
          : clientServer,
        req,
        false
      ).then(proxyRes => {
        res.writeHead(proxyRes.statusCode ?? 500, {
          ...proxyRes.headers,
          ...headers
        })
        proxyRes.pipe(res, { end: true })
      })
    })
    .listen(3000, () => {
      console.log('http://localhost:3000/')
    })
} else {
  await clientContext.rebuild()
  await clientContext.dispose()
  await workerContext.rebuild()
  await workerContext.dispose()
  await fs.copyFile('static/index.html', 'dist/index.html')
}
