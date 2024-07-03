import './index.css'

console.log('client entry point!', document)

console.log(new Worker('./server/index.js'))
console.log(new Worker('./client/mesh/index.js'))
