import * as THREE from 'three'

const REC_LEN = 8
const EVENT_LEN = 4

const KIND_TANK = 0
const KIND_SHELL = 1
const KIND_BLOCK = 2

const FLAG_PLAYER = 2
const EVENT_EXPLOSION = 1

const VIEW_SIZE = 18

export interface Renderer {
  sync(data: Float32Array): void
  onEvents(data: Float32Array): void
  render(dt: number): void
  resize(width: number, height: number): void
  pickFloor(clientX: number, clientY: number): { x: number; y: number } | null
  dispose(): void
}

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

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
    new THREE.MeshStandardMaterial({ color: '#2c3138', roughness: 0.95 }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)

  const grid = new THREE.GridHelper(20, 20, 0x3d434c, 0x333841)
  grid.position.y = 0.02
  scene.add(grid)

  const tankHullGeo = new THREE.BoxGeometry(1.9, 0.55, 1.4)
  const turretDomeGeo = new THREE.CylinderGeometry(0.4, 0.5, 0.35, 16)
  const barrelGeo = new THREE.BoxGeometry(1.1, 0.12, 0.14)
  const shellGeo = new THREE.SphereGeometry(0.5, 12, 8)
  const blockGeo = new THREE.BoxGeometry(1, 1, 1)
  const explosionGeo = new THREE.IcosahedronGeometry(0.5, 1)

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

  function makeTank(isPlayer: boolean) {
    const root = new THREE.Group()
    const hull = new THREE.Mesh(
      tankHullGeo,
      new THREE.MeshStandardMaterial({
        color: isPlayer ? '#6b7d45' : '#8a4b4b',
        roughness: 0.7,
      }),
    )
    hull.position.y = 0.35
    hull.castShadow = true
    root.add(hull)
    const turret = new THREE.Group()
    const dome = new THREE.Mesh(turretDomeGeo, hull.material)
    dome.position.y = 0.78
    dome.castShadow = true
    turret.add(dome)
    const barrel = new THREE.Mesh(
      barrelGeo,
      new THREE.MeshStandardMaterial({ color: '#3b3f36', roughness: 0.6 }),
    )
    barrel.position.set(0.7, 0.78, 0)
    barrel.castShadow = true
    turret.add(barrel)
    root.add(turret)
    root.userData.turret = turret
    return root
  }

  function makeShell() {
    const root = new THREE.Group()
    const mesh = new THREE.Mesh(
      shellGeo,
      new THREE.MeshStandardMaterial({ color: '#d8d2b8', roughness: 0.4 }),
    )
    mesh.position.y = 0.4
    mesh.castShadow = true
    root.add(mesh)
    return root
  }

  function makeBlock(id: number) {
    const root = new THREE.Group()
    const mesh = new THREE.Mesh(blockGeo, blockMaterials[id % blockMaterials.length])
    mesh.position.y = 0.5
    mesh.castShadow = true
    mesh.receiveShadow = true
    root.add(mesh)
    return root
  }

  const entities = new Map<number, THREE.Object3D>()
  const explosions: { mesh: THREE.Mesh<THREE.IcosahedronGeometry, THREE.MeshBasicMaterial>; age: number }[] = []

  const raycaster = new THREE.Raycaster()
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  const hitPoint = new THREE.Vector3()

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
        const root = ensure(id, kind, flags)
        root.position.set(data[o + 2], 0, -data[o + 3])
        root.rotation.y = hullRot
        root.scale.setScalar(scale)
        const turret = root.userData.turret as THREE.Group | undefined
        if (turret) turret.rotation.y = turretRot - hullRot
      }
      for (const [id, root] of entities) {
        if (!seen.has(id)) {
          scene.remove(root)
          entities.delete(id)
        }
      }
    },

    onEvents(data: Float32Array) {
      const count = data[0]
      for (let i = 0; i < count; i++) {
        const o = 1 + i * EVENT_LEN
        if ((data[o] | 0) === EVENT_EXPLOSION) spawnExplosion(data[o + 1], data[o + 2])
      }
    },

    render(dt: number) {
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
      renderer.dispose()
    },
  }
}
