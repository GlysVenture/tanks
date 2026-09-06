Tanks is a remake of the classic Wii Play minigame, Wii Tanks.

It is a completely static website written in Svelte 5 and Webassembly (Rust).
It will be hosted on free infra (Github pages, Vercel, ...)

The goal is to get as close as possible to the original.

## Toolchain

- Bun is the package manager and script runner (not npm).
- TypeScript is pinned to 6.x; svelte-check 4 rejects TypeScript 7.
- Rust crate lives in `crates/tanks`. Its wasm output goes to `src/wasm` (gitignored, generated). wasm-pack's `--out-dir` resolves relative to the crate dir, hence `../../src/wasm`.
- `src/wasm` must exist before `bun run check` or vite dev work. On a fresh clone run `bun run build` once (the dev script's watcher also builds it).

## Commands

- `bun run dev` — vite + wasm rebuild watcher (`scripts/watch-wasm.ts`)
- `bun run build` — wasm-pack release build + vite build
- `bun run check` — svelte-check (JS/TS/Svelte)
- `cargo test` and `cargo clippy --all-targets -- -D warnings` (in `crates/tanks`) — both must pass before finishing any Rust change

## Architecture

- Rust owns the simulation; JS owns rendering and the frame loop.
- `crates/tanks/src/sim.rs` is pure Rust with no wasm-bindgen types so it is unit-testable on the host. `lib.rs` only holds the `#[wasm_bindgen]` surface (`Game::new/set_input/request_fire/tick/take_events`).
- wasm-bindgen exports keep snake_case (`set_input`, `request_fire`, `take_events`) — there is no automatic camelCase conversion.
- Snapshot contract (`tick(dt) -> Float32Array`): `[count, (kind, id, x, y, hull_rot, turret_rot, scale, flags) x 8]`. kinds: 0 tank, 1 shell, 2 block. flags: bit 0 alive, bit 1 player.
- Event contract (`take_events()`): `[count, (code, x, y, arg) x 4]`. codes: 0 shell fired, 1 explosion. JS drains events every frame.
- Coordinate mapping: sim `(x, y)` -> three `(x, 0, -y)`; hull `rotation.y = hull_rot`; turret is a child group with `rotation.y = turret_rot - hull_rot`.
- Rendering is Three.js in `src/lib/renderer.ts`: orthographic camera at 45 degrees (`(0, 21, 21)`), `VIEW_SIZE` 18, primitives only (GLTF tank models can slot in later without Rust changes). Wood block textures are procedural canvas textures (3 variants, chosen by block id).
- `src/lib/game.ts` owns the rAF loop, keyboard/pointer input, and calls Rust each frame.

## Gameplay conventions (Wii Tanks fidelity)

- Arena is 20x20 (`ARENA_HALF = 10`) with a contiguous wooden border wall: `BLOCK_SIZE` equals wall spacing (1.25). Keep them equal or gaps appear.
- Shells bounce off blocks/walls exactly once, then explode on the second contact (or on TTL expiry).
- Shell movement is substepped (max 0.3 units per step, capped) to prevent tunneling — keep this if shell speed or block size changes.

## Deploy

- Fully static output in `dist/` (wasm + JS + HTML). `base: './'` in `vite.config.ts` makes it host-agnostic (GitHub Pages subpath or Vercel root). `public/.nojekyll` is required for GitHub Pages.
- CI is `.github/workflows/deploy.yml`: bun install, `bun run build`, upload to GitHub Pages. Repo Settings -> Pages -> Source: GitHub Actions.
- The Firefox WebGL "depth texture comparison" warning is known-benign; ignore it.

