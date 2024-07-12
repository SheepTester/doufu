import { init } from './Game'
import './index.css'

const game = await init({
  loadRange: 6
})
game.start()
