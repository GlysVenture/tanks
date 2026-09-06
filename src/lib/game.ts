import { createRenderer } from './renderer'

export interface GameController {
  dispose(): void
}

export async function startGame(canvas: HTMLCanvasElement): Promise<GameController> {
  const wasm = await import('../wasm/tanks.js')
  await wasm.default()
  const game = new wasm.Game()
  const renderer = createRenderer(canvas)

  const keys = new Set<string>()
  let aim = { x: 4, y: 0 }

  const onKeyDown = (event: KeyboardEvent) => keys.add(event.code)
  const onKeyUp = (event: KeyboardEvent) => keys.delete(event.code)
  const onPointerMove = (event: PointerEvent) => {
    const hit = renderer.pickFloor(event.clientX, event.clientY)
    if (hit) aim = hit
  }
  const onPointerDown = (event: PointerEvent) => {
    if (event.button === 0) game.request_fire()
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerdown', onPointerDown)

  const resize = () => {
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    if (width > 0 && height > 0) renderer.resize(width, height)
  }
  const observer = new ResizeObserver(resize)
  observer.observe(canvas)

  let running = true
  let raf = 0
  let last = performance.now()

  const frame = (now: number) => {
    if (!running) return
    const dt = Math.min((now - last) / 1000, 0.1)
    last = now

    let moveX = 0
    let moveY = 0
    if (keys.has('KeyW') || keys.has('ArrowUp')) moveY += 1
    if (keys.has('KeyS') || keys.has('ArrowDown')) moveY -= 1
    if (keys.has('KeyA') || keys.has('ArrowLeft')) moveX -= 1
    if (keys.has('KeyD') || keys.has('ArrowRight')) moveX += 1
    game.set_input(moveX, moveY, aim.x, aim.y)

    renderer.sync(game.tick(dt))
    renderer.onEvents(game.take_events())
    renderer.render(dt)

    raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)

  return {
    dispose() {
      running = false
      cancelAnimationFrame(raf)
      observer.disconnect()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerdown', onPointerDown)
      renderer.dispose()
    },
  }
}
