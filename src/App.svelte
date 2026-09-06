<script lang="ts">
  import { onMount } from 'svelte'
  import { startGame, type GameController } from './lib/game'

  let canvas = $state<HTMLCanvasElement>()
  let error = $state<string>()
  let controller: GameController | undefined
  let disposed = false

  onMount(() => {
    if (!canvas) return
    startGame(canvas)
      .then((c) => {
        if (disposed) c.dispose()
        else controller = c
      })
      .catch((e: unknown) => {
        console.error(e)
        error = e instanceof Error ? e.message : String(e)
      })
    return () => {
      disposed = true
      controller?.dispose()
    }
  })
</script>

{#if error}
  <div class="error">{error}</div>
{:else}
  <canvas bind:this={canvas}></canvas>
{/if}

<style>
  :global(html, body) {
    margin: 0;
    height: 100%;
    background: #15181c;
  }
  canvas {
    display: block;
    width: 100vw;
    height: 100vh;
    touch-action: none;
    cursor: crosshair;
  }
  .error {
    color: #ff6b6b;
    font-family: monospace;
    padding: 2rem;
    white-space: pre-wrap;
  }
</style>
