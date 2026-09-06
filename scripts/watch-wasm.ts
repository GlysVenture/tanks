import { spawn } from 'node:child_process'
import { watch } from 'node:fs'

const crateSrc = new URL('../crates/tanks/src', import.meta.url).pathname
const args = [
  'wasm-pack',
  'build',
  'crates/tanks',
  '--target',
  'web',
  '--dev',
  '--out-dir',
  '../../src/wasm',
]

let building = false
let pending = false
let timer: ReturnType<typeof setTimeout> | undefined

function run() {
  building = true
  const child = spawn(args[0], args.slice(1), { stdio: 'inherit' })
  child.on('exit', () => {
    building = false
    if (pending) {
      pending = false
      run()
    }
  })
}

watch(crateSrc, { recursive: true }, () => {
  clearTimeout(timer)
  timer = setTimeout(() => {
    if (building) pending = true
    else run()
  }, 150)
})

console.log('[wasm] building...')
run()
