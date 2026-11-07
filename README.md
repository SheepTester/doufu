# doufu

Doufu is a WebGPU voxel engine. It's written in TypeScript so its performance is weak and soft, but it'll be easier to play around with changes. Some day, I might rewrite the slowest parts in Rust/WebAssembly.

Based on [Kaaba](https://sheeptester.github.io/words-go-here/misc/kaaba/).

## Development

```shell
# Install dependencies
$ npm install

# Builds to dist/
$ npm run build

# Start development server
$ npm run dev
http://localhost:3000/

# Also builds to dist/
$ npm run build server

# Starts WebSocket server
$ node dist/server.cjs
http://localhost:10069/
```
