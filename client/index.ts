import { init } from './Game'
import './index.css'

const game = await init({
  loadRange: 10
})
game.start()
