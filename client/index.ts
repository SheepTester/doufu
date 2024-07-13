import { init } from './Game'
import './index.css'

const game = await init({
  loadRange: 6
})
game.start()

// So I can do `game.stop()` while debugging
;(window as any)['game'] = game
