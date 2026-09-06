import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

const REC_LEN = 8
const EVENT_LEN = 4

const KIND_TANK = 0
const KIND_SHELL = 1
const KIND_BLOCK = 2

const FLAG_PLAYER = 2
const EVENT_SHELL_FIRED = 0
const EVENT_EXPLOSION = 1

const VIEW_SIZE = 18

export interface Renderer {
  sync(data: Float32Array): void
  setAim(x: number, y: number): void
  onEvents(data: Float32Array): void
  render(dt: number): void
  resize(width: number, height: number): void
  pickFloor(clientX: number, clientY: number): { x: number; y: number } | null
  dispose(): void
}

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  canvas.style.cursor = 'none'
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

  const pmrem = new THREE.PMREMGenerator(renderer)
  const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  pmrem.dispose()

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#15181c')

  const camera = new THREE.OrthographicCamera(-16, 16, 11, -11, 0.1, 100)
  camera.position.set(0, 21, 21)
  camera.lookAt(0, 0, 0)

  const ambient = new THREE.AmbientLight('#ffffff', 0.6)
  const sun = new THREE.DirectionalLight('#fff2d0', 1.8)
  sun.position.set(6, 12, 4)
  sun.castShadow = true
  sun.shadow.camera.left = -15
  sun.shadow.camera.right = 15
  sun.shadow.camera.top = 15
  sun.shadow.camera.bottom = -15
  sun.shadow.mapSize.set(2048, 2048)
  scene.add(ambient, sun)

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshStandardMaterial({ map: plankTexture(), roughness: 0.9 }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)

  const tankHullGeo = new RoundedBoxGeometry(1.08, 0.36, 0.55, 2, 0.08)
  const treadGeo = new RoundedBoxGeometry(1.08, 0.39, 0.195, 2, 0.06)
  const turretGeo = new RoundedBoxGeometry(0.4408, 0.3206, 0.418, 2, 0.0532)
  const barrelGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.56, 12)
  const muzzleGeo = new THREE.CylinderGeometry(0.105, 0.105, 0.2, 12)
  const shellGeo = new THREE.CapsuleGeometry(0.06, 0.16, 4, 10)
  const trailGeo = new THREE.SphereGeometry(0.05, 6, 5)
  const blockGeo = new RoundedBoxGeometry(1, 1, 1, 2, 0.08)
  const explosionGeo = new THREE.IcosahedronGeometry(0.5, 1)
  const trackGeo = new THREE.PlaneGeometry(0.32, 0.19)
  trackGeo.rotateX(-Math.PI / 2)

  function glowTexture() {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const ctx = canvas.getContext('2d')!
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)')
    grad.addColorStop(0.35, 'rgba(255, 255, 255, 0.55)')
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 64, 64)
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }

  function plankTexture() {
    const size = 1024
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!
    let s = 987654
    const rand = () => {
      s = (s * 16807) % 2147483647
      return s / 2147483647
    }
    const cells = 16
    const cs = size / cells
    for (let cy = 0; cy < cells; cy++) {
      let cx = 0
      while (cx < cells) {
        const len = Math.min(2 + Math.floor(rand() * 3), cells - cx)
        const w = len * cs
        const v = 0.75 + rand() * 0.45
        ctx.fillStyle = `rgb(${Math.round(170 * v)}, ${Math.round(140 * v)}, ${Math.round(96 * v)})`
        ctx.fillRect(cx * cs, cy * cs, w, cs)
        for (let i = 0; i < 6; i++) {
          ctx.fillStyle = `rgba(66, 44, 22, ${0.05 + rand() * 0.13})`
          ctx.fillRect(cx * cs + rand() * (w - 16), cy * cs + 2 + rand() * (cs - 6), 4 + rand() * 12, 1 + rand() * 1.5)
        }
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = `rgba(214, 180, 130, ${0.04 + rand() * 0.08})`
          ctx.fillRect(cx * cs + rand() * (w - 16), cy * cs + 2 + rand() * (cs - 6), 3 + rand() * 10, 1 + rand())
        }
        ctx.fillStyle = 'rgba(30, 18, 8, 0.85)'
        ctx.fillRect(cx * cs - 1.5, cy * cs, 3, cs)
        cx += len
      }
      ctx.fillRect(0, cy * cs - 1.5, size, 3)
    }
    ctx.fillStyle = 'rgba(30, 18, 8, 0.85)'
    ctx.fillRect(size - 1.5, 0, 1.5, size)
    ctx.fillRect(0, size - 1.5, size, 1.5)
    const tex = new THREE.CanvasTexture(canvas)
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(3, 3)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy()
    return tex
  }

  function woodTexture(seed: number) {
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 128
    const ctx = canvas.getContext('2d')!
    let s = seed % 2147483647
    const rand = () => {
      s = (s * 16807) % 2147483647
      return s / 2147483647
    }
    ctx.fillStyle = '#9c7a4f'
    ctx.fillRect(0, 0, 128, 128)
    for (let i = 0; i < 30; i++) {
      const x = rand() * 128
      ctx.fillStyle = `rgba(74, 50, 24, ${0.08 + rand() * 0.2})`
      ctx.fillRect(x, 0, 0.5 + rand() * 2.5, 128)
    }
    for (let i = 0; i < 14; i++) {
      const x = rand() * 128
      ctx.fillStyle = `rgba(214, 178, 128, ${0.05 + rand() * 0.12})`
      ctx.fillRect(x, 0, 0.5 + rand() * 1.5, 128)
    }
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }

  const blockMaterials = [11, 22, 33].map(
    (seed) => new THREE.MeshStandardMaterial({ map: woodTexture(seed), roughness: 0.85 }),
  )

  function shadeRand(id: number) {
    let s = (id % 2147483647) || 1
    s = (s * 16807) % 2147483647
    return s / 2147483647
  }

  function tankMaterial(color: string, roughness: number, metalness: number) {
    return new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
      envMap,
      envMapIntensity: 0.55,
    })
  }

  function makeTank(isPlayer: boolean) {
    const palette = isPlayer
      ? { hull: '#3a72ad', dark: '#1c3560', muzzle: '#132745' }
      : { hull: '#9c4f4f', dark: '#471f1f', muzzle: '#2d1515' }
    const hullMat = tankMaterial(palette.hull, 0.35, 0.4)
    const darkMat = tankMaterial(palette.dark, 0.35, 0.4)
    const muzzleMat = tankMaterial(palette.muzzle, 0.3, 0.5)

    const root = new THREE.Group()
    const hull = new THREE.Mesh(tankHullGeo, hullMat)
    hull.position.y = 0.23
    hull.castShadow = true
    root.add(hull)
    for (const side of [-1, 1]) {
      const tread = new THREE.Mesh(treadGeo, darkMat)
      tread.position.set(0, 0.225, side * 0.35)
      tread.castShadow = true
      root.add(tread)
    }
    const turret = new THREE.Group()
    const body = new THREE.Mesh(turretGeo, darkMat)
    body.position.y = 0.5703
    body.castShadow = true
    turret.add(body)
    const barrel = new THREE.Mesh(barrelGeo, darkMat)
    barrel.rotation.z = -Math.PI / 2
    barrel.position.set(0.49, 0.5703, 0)
    barrel.castShadow = true
    turret.add(barrel)
    const muzzle = new THREE.Mesh(muzzleGeo, muzzleMat)
    muzzle.rotation.z = -Math.PI / 2
    muzzle.position.set(0.72, 0.5703, 0)
    muzzle.castShadow = true
    turret.add(muzzle)
    root.add(turret)
    root.userData.turret = turret
    root.userData.tank = true
    return root
  }

  function makeShell() {
    const root = new THREE.Group()
    const mesh = new THREE.Mesh(shellGeo, tankMaterial('#d8d2b8', 0.35, 0.6))
    mesh.rotation.z = -Math.PI / 2
    mesh.position.y = 0.5703
    mesh.castShadow = true
    root.add(mesh)
    root.userData.shell = true
    return root
  }

  function makeBlock(id: number) {
    const root = new THREE.Group()
    const mat = blockMaterials[id % blockMaterials.length].clone()
    mat.color.setScalar(0.7 + shadeRand(id) * 0.6)
    const mesh = new THREE.Mesh(blockGeo, mat)
    mesh.position.y = 0.5
    mesh.castShadow = true
    mesh.receiveShadow = true
    root.add(mesh)
    return root
  }

  const tracks: {
    mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
    age: number
    ttl: number
  }[] = []

  function stampTracks(x: number, z: number, rot: number) {
    const sin = Math.sin(rot)
    const cos = Math.cos(rot)
    for (const side of [-1, 1]) {
      const mesh = new THREE.Mesh(
        trackGeo,
        new THREE.MeshBasicMaterial({
          color: '#241708',
          transparent: true,
          opacity: 0.4,
          depthWrite: false,
        }),
      )
      mesh.position.set(x + side * 0.35 * sin, 0.015, z + side * 0.35 * cos)
      mesh.rotation.y = rot
      scene.add(mesh)
      tracks.push({ mesh, age: 0, ttl: 5 })
    }
  }

  const entities = new Map<number, THREE.Object3D>()
  const explosions: { mesh: THREE.Mesh<THREE.IcosahedronGeometry, THREE.MeshBasicMaterial>; age: number }[] = []
  const particles: {
    mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>
    age: number
    ttl: number
    base: number
    opacity: number
    vx: number
    vy: number
    vz: number
  }[] = []

  const raycaster = new THREE.Raycaster()
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  const hitPoint = new THREE.Vector3()

  const aimGlowTex = glowTexture()
  const aimMat = new THREE.MeshBasicMaterial({
    color: '#3d8bff',
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  })
  const aimGlowMat = new THREE.MeshBasicMaterial({
    map: aimGlowTex,
    color: '#3d8bff',
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  })
  const aimDotMat = new THREE.MeshBasicMaterial({
    map: aimGlowTex,
    color: '#4d9fff',
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  })
  const crossGeo = new THREE.PlaneGeometry(0.1, 0.032)
  crossGeo.rotateX(-Math.PI / 2)
  const crossGlowGeo = new THREE.PlaneGeometry(0.22, 0.09)
  crossGlowGeo.rotateX(-Math.PI / 2)
  const cross = new THREE.Group()
  cross.scale.setScalar(2)
  const tickSpecs: [number, number, number][] = [
    [0.11, 0.11, -Math.PI / 4],
    [-0.11, -0.11, -Math.PI / 4],
    [0.11, -0.11, Math.PI / 4],
    [-0.11, 0.11, Math.PI / 4],
  ]
  for (const [ox, oz, rot] of tickSpecs) {
    const glow = new THREE.Mesh(crossGlowGeo, aimGlowMat)
    glow.position.set(ox, 0, oz)
    glow.rotation.y = rot
    glow.renderOrder = 1
    cross.add(glow)
    const tick = new THREE.Mesh(crossGeo, aimMat)
    tick.position.set(ox, 0, oz)
    tick.rotation.y = rot
    tick.renderOrder = 2
    cross.add(tick)
  }
  const centerGlowGeo = new THREE.PlaneGeometry(0.16, 0.16)
  centerGlowGeo.rotateX(-Math.PI / 2)
  const centerGlow = new THREE.Mesh(centerGlowGeo, aimDotMat)
  centerGlow.renderOrder = 1
  cross.add(centerGlow)
  const centerDotGeo = new THREE.CircleGeometry(0.035, 12)
  centerDotGeo.rotateX(-Math.PI / 2)
  const centerDot = new THREE.Mesh(centerDotGeo, aimMat)
  centerDot.renderOrder = 2
  cross.add(centerDot)
  scene.add(cross)
  const dotGeo = new THREE.PlaneGeometry(0.22, 0.22)
  dotGeo.rotateX(-Math.PI / 2)
  const dots: THREE.Mesh[] = []
  for (let i = 0; i < 40; i++) {
    const dot = new THREE.Mesh(dotGeo, aimDotMat)
    dot.visible = false
    dot.renderOrder = 1
    scene.add(dot)
    dots.push(dot)
  }
  const aimPoint = { x: 4, y: 0 }
  const playerPos = { x: 0, y: 0 }

  function updateAim() {
    cross.position.set(aimPoint.x, 0.03, -aimPoint.y)
    const dx = aimPoint.x - playerPos.x
    const dy = aimPoint.y - playerPos.y
    const dist = Math.hypot(dx, dy)
    const count =
      dist < 0.001 ? 0 : Math.max(0, Math.min(dots.length, Math.floor((dist - 0.6) / 0.7)))
    for (let i = 0; i < dots.length; i++) {
      const dot = dots[i]
      if (i >= count) {
        dot.visible = false
        continue
      }
      const t = 0.9 + i * 0.7
      dot.visible = true
      dot.position.set(playerPos.x + (dx / dist) * t, 0.03, -(playerPos.y + (dy / dist) * t))
    }
  }

  function ensure(id: number, kind: number, flags: number): THREE.Object3D {
    let root = entities.get(id)
    if (!root) {
      if (kind === KIND_TANK) root = makeTank((flags & FLAG_PLAYER) !== 0)
      else if (kind === KIND_SHELL) root = makeShell()
      else root = makeBlock(id)
      scene.add(root)
      entities.set(id, root)
    }
    return root
  }

  function spawnExplosion(x: number, y: number) {
    const mesh = new THREE.Mesh(
      explosionGeo,
      new THREE.MeshBasicMaterial({ color: '#ffb35c', transparent: true, opacity: 0.9 }),
    )
    mesh.position.set(x, 0.5, -y)
    scene.add(mesh)
    explosions.push({ mesh, age: 0 })
  }

  function spawnParticle(
    x: number,
    y: number,
    z: number,
    color: string,
    opacity: number,
    base: number,
    ttl: number,
    vx = 0,
    vy = 0,
    vz = 0,
  ) {
    const mesh = new THREE.Mesh(
      trailGeo,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity }),
    )
    mesh.position.set(x, y, z)
    mesh.scale.setScalar(base)
    scene.add(mesh)
    particles.push({ mesh, age: 0, ttl, base, opacity, vx, vy, vz })
  }

  function spawnTrailParticle(x: number, z: number) {
    spawnParticle(
      x + (Math.random() - 0.5) * 0.08,
      0.52 + Math.random() * 0.06,
      z + (Math.random() - 0.5) * 0.08,
      '#ffc27a',
      0.55,
      0.6 + Math.random() * 0.8,
      0.35,
    )
  }

  function spawnMuzzleFlash(x: number, y: number, rot: number) {
    const dirX = Math.cos(rot)
    const dirZ = -Math.sin(rot)
    spawnParticle(x + dirX * 0.15, 0.57, -y + dirZ * 0.15, '#fff3c4', 0.95, 4.5, 0.15)
    spawnParticle(x + dirX * 0.1, 0.57, -y + dirZ * 0.1, '#ffb35c', 0.8, 2.5, 0.25)
    for (let i = 0; i < 12; i++) {
      const a = rot + (Math.random() - 0.5) * 1.4
      const speed = 1.5 + Math.random() * 2.5
      spawnParticle(
        x + dirX * 0.2,
        0.57,
        -y + dirZ * 0.2,
        '#ffc27a',
        0.85,
        0.9 + Math.random() * 1.1,
        0.35 + Math.random() * 0.2,
        Math.cos(a) * speed,
        0.2 + Math.random() * 0.6,
        -Math.sin(a) * speed,
      )
    }
  }

  return {
    sync(data: Float32Array) {
      const count = data[0]
      const seen = new Set<number>()
      for (let i = 0; i < count; i++) {
        const o = 1 + i * REC_LEN
        const kind = data[o] | 0
        const id = data[o + 1] | 0
        const hullRot = data[o + 4]
        const turretRot = data[o + 5]
        const scale = data[o + 6]
        const flags = data[o + 7] | 0
        seen.add(id)
        if (kind === KIND_TANK && (flags & FLAG_PLAYER) !== 0) {
          playerPos.x = data[o + 2]
          playerPos.y = data[o + 3]
        }
        const root = ensure(id, kind, flags)
        root.position.set(data[o + 2], 0, -data[o + 3])
        root.rotation.y = hullRot
        root.scale.setScalar(scale)
        const turret = root.userData.turret as THREE.Group | undefined
        if (turret) turret.rotation.y = turretRot - hullRot
        if (root.userData.tank) {
          const last = root.userData.lastTrack as { x: number; z: number } | undefined
          const tx = data[o + 2]
          const tz = -data[o + 3]
          const dx = tx - (last?.x ?? Infinity)
          const dz = tz - (last?.z ?? Infinity)
          if (dx * dx + dz * dz > 0.09) {
            root.userData.lastTrack = { x: tx, z: tz }
            stampTracks(tx, tz, hullRot)
          }
        }
      }
      for (const [id, root] of entities) {
        if (!seen.has(id)) {
          scene.remove(root)
          entities.delete(id)
        }
      }
    },

    setAim(x: number, y: number) {
      aimPoint.x = x
      aimPoint.y = y
    },

    onEvents(data: Float32Array) {
      const count = data[0]
      for (let i = 0; i < count; i++) {
        const o = 1 + i * EVENT_LEN
        const code = data[o] | 0
        if (code === EVENT_EXPLOSION) spawnExplosion(data[o + 1], data[o + 2])
        else if (code === EVENT_SHELL_FIRED) spawnMuzzleFlash(data[o + 1], data[o + 2], data[o + 3])
      }
    },

    render(dt: number) {
      updateAim()
      for (let i = tracks.length - 1; i >= 0; i--) {
        const t = tracks[i]
        t.age += dt
        const k = t.age / t.ttl
        if (k >= 1) {
          scene.remove(t.mesh)
          t.mesh.material.dispose()
          tracks.splice(i, 1)
        } else {
          t.mesh.material.opacity = 0.4 * (1 - k)
        }
      }
      for (const root of entities.values()) {
        if (!root.userData.shell) continue
        const last = root.userData.lastTrail as { x: number; z: number } | undefined
        const dx = root.position.x - (last?.x ?? Infinity)
        const dz = root.position.z - (last?.z ?? Infinity)
        if (dx * dx + dz * dz < 0.0025) continue
        root.userData.lastTrail = { x: root.position.x, z: root.position.z }
        spawnTrailParticle(root.position.x, root.position.z)
      }
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        p.age += dt
        const t = p.age / p.ttl
        if (t >= 1) {
          scene.remove(p.mesh)
          p.mesh.material.dispose()
          particles.splice(i, 1)
        } else {
          p.mesh.position.x += p.vx * dt
          p.mesh.position.y += p.vy * dt
          p.mesh.position.z += p.vz * dt
          p.mesh.scale.setScalar(p.base * (1 - t))
          p.mesh.material.opacity = p.opacity * (1 - t)
        }
      }
      for (let i = explosions.length - 1; i >= 0; i--) {
        const e = explosions[i]
        e.age += dt
        const t = e.age / 0.45
        if (t >= 1) {
          scene.remove(e.mesh)
          e.mesh.material.dispose()
          explosions.splice(i, 1)
        } else {
          e.mesh.scale.setScalar(0.4 + t * 2.2)
          e.mesh.material.opacity = 0.9 * (1 - t)
        }
      }
      renderer.render(scene, camera)
    },

    resize(width: number, height: number) {
      renderer.setSize(width, height, false)
      const aspect = width / height
      const viewHeight = Math.max(VIEW_SIZE, VIEW_SIZE / aspect)
      camera.top = viewHeight / 2
      camera.bottom = -viewHeight / 2
      camera.left = (-viewHeight * aspect) / 2
      camera.right = (viewHeight * aspect) / 2
      camera.updateProjectionMatrix()
    },

    pickFloor(clientX: number, clientY: number) {
      const rect = canvas.getBoundingClientRect()
      const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(ndc, camera)
      const hit = raycaster.ray.intersectPlane(floorPlane, hitPoint)
      return hit ? { x: hit.x, y: -hit.z } : null
    },

    dispose() {
      for (const root of entities.values()) scene.remove(root)
      entities.clear()
      scene.remove(cross)
      for (const d of dots) scene.remove(d)
      aimMat.dispose()
      aimGlowMat.dispose()
      aimDotMat.dispose()
      aimGlowTex.dispose()
      for (const t of tracks) {
        scene.remove(t.mesh)
        t.mesh.material.dispose()
      }
      tracks.length = 0
      for (const p of particles) {
        scene.remove(p.mesh)
        p.mesh.material.dispose()
      }
      particles.length = 0
      renderer.dispose()
    },
  }
}
