// @ts-check

// https://github.com/evanw/esbuild/issues/69#issuecomment-1302521672

import esbuild from 'esbuild'
import esbuildServe from '@es-exec/esbuild-plugin-serve'
import fs from 'node:fs/promises'
import http from 'node:http'

const args = process.argv.slice(2)
const serve = args.includes('serve')
const server = args.includes('server')

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
  minify: !serve,
  define: {
    IS_BROWSER: 'true',
    USE_WS: JSON.stringify(serve && server ? 'ws://localhost:10069/ws' : server)
  },
  external: ['worker_threads', 'path']
})
const workerContext = await esbuild.context({
  entryPoints: server
    ? ['client/mesh/index.ts']
    : ['client/mesh/index.ts', 'server/worker.ts', 'server/generate/index.ts'],
  outdir: server
    ? serve
      ? 'static/client/mesh'
      : 'dist/client/mesh'
    : serve
    ? 'static/'
    : 'dist/',
  format: 'iife',
  bundle: true,
  sourcemap: 'linked',
  minify: !serve,
  define: { IS_BROWSER: 'true' },
  external: ['worker_threads', 'path']
})
const serverContext = await esbuild.context({
  entryPoints: ['server/server.ts', 'server/generate/index.ts'],
  outdir: 'dist/',
  outExtension: { '.js': '.cjs' },
  platform: 'node',
  format: 'cjs',
  bundle: true,
  define: { IS_BROWSER: 'false' },
  plugins: serve
    ? [
        esbuildServe({
          main: 'dist/server.cjs',
          env: { ESBUILD_SILENT: 'true' }
        })
      ]
    : []
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

/**
 * https://gist.github.com/kethinov/6658166
 * @param {string} dir
 * @param {string[]} files
 * @returns {Promise<string[]>}
 */
async function walk (dir, files = []) {
  for (const file of await fs.readdir(dir)) {
    if ((await fs.stat(dir + file)).isDirectory()) {
      await walk(dir + file + '/', files)
    } else {
      files.push(dir + file)
    }
  }
  return files
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

  if (server) {
    await serverContext.watch()
  }
} else {
  await clientContext.rebuild()
  await workerContext.rebuild()
  await fs.copyFile('static/index.html', 'dist/index.html')
  if (server) {
    await serverContext.rebuild()
  } else {
    await fs.writeFile(
      'dist/sitemap.txt',
      (await walk('dist/'))
        .map(
          path =>
            path.replace('dist/', 'https://sheeptester.github.io/doufu/') + '\n'
        )
        .join('')
    )
  }
  await clientContext.dispose()
  await workerContext.dispose()
  await serverContext.dispose()
}
