use glam::Vec2;
use std::f32::consts::{PI, TAU};

pub const KIND_TANK: f32 = 0.0;
pub const KIND_SHELL: f32 = 1.0;
pub const KIND_BLOCK: f32 = 2.0;

pub const FLAG_ALIVE: f32 = 1.0;
pub const FLAG_PLAYER: f32 = 2.0;

pub const EV_SHELL_FIRED: f32 = 0.0;
pub const EV_EXPLOSION: f32 = 1.0;

pub const REC_LEN: usize = 8;
pub const EVENT_LEN: usize = 4;

const ARENA_HALF: f32 = 10.0;
const TANK_SPEED: f32 = 4.0;
const TANK_TURN_RATE: f32 = 8.0;
const SHELL_SPEED: f32 = 6.0;
const SHELL_TTL: f32 = 6.0;
const SHELL_RADIUS: f32 = 0.15;
const SHELL_SUBSTEP: f32 = 0.3;
const FIRE_COOLDOWN: f32 = 0.15;
const TANK_RADIUS: f32 = 0.7;
const BLOCK_SIZE: f32 = 1.25;
const BLOCK_ID_BASE: u32 = 100_000;

pub struct Sim {
    player: Tank,
    shells: Vec<Shell>,
    blocks: Vec<Block>,
    events: Vec<f32>,
    next_id: u32,
    move_dir: Vec2,
    aim: Vec2,
    want_fire: u32,
    fire_cooldown: f32,
}

struct Tank {
    pos: Vec2,
    hull_rot: f32,
    turret_rot: f32,
}

struct Shell {
    id: u32,
    pos: Vec2,
    vel: Vec2,
    ttl: f32,
    bounces: u32,
    dead: bool,
}

struct Block {
    pos: Vec2,
}

impl Sim {
    pub fn new() -> Sim {
        let mut blocks = Vec::new();
        let step = 1.25;
        let mut i = -ARENA_HALF;
        while i <= ARENA_HALF + 1e-6 {
            blocks.push(Block {
                pos: Vec2::new(i, -ARENA_HALF),
            });
            blocks.push(Block {
                pos: Vec2::new(i, ARENA_HALF),
            });
            if i.abs() < ARENA_HALF - 1e-6 {
                blocks.push(Block {
                    pos: Vec2::new(-ARENA_HALF, i),
                });
                blocks.push(Block {
                    pos: Vec2::new(ARENA_HALF, i),
                });
            }
            i += step;
        }
        for (x, y) in [
            (3.5, 2.5),
            (3.5, 3.75),
            (-4.5, -3.5),
            (-4.5, -2.25),
            (5.5, -5.5),
            (0.5, 6.0),
            (1.75, 6.0),
            (-2.0, 1.0),
        ] {
            blocks.push(Block {
                pos: Vec2::new(x, y),
            });
        }
        Sim {
            player: Tank {
                pos: Vec2::ZERO,
                hull_rot: 0.0,
                turret_rot: 0.0,
            },
            shells: Vec::new(),
            blocks,
            events: Vec::new(),
            next_id: 10_000,
            move_dir: Vec2::ZERO,
            aim: Vec2::new(4.0, 0.0),
            want_fire: 0,
            fire_cooldown: 0.0,
        }
    }

    pub fn set_input(&mut self, move_x: f32, move_y: f32, aim_x: f32, aim_y: f32) {
        let v = Vec2::new(move_x, move_y);
        self.move_dir = if v.length_squared() > 1.0 {
            v.normalize_or_zero()
        } else {
            v
        };
        self.aim = Vec2::new(aim_x, aim_y);
    }

    pub fn request_fire(&mut self) {
        self.want_fire = (self.want_fire + 1).min(8);
    }

    pub fn tick(&mut self, dt: f32) {
        if self.move_dir != Vec2::ZERO {
            let target = self.move_dir.y.atan2(self.move_dir.x);
            self.player.hull_rot = turn_toward(self.player.hull_rot, target, TANK_TURN_RATE * dt);
            self.player.pos += self.move_dir * (TANK_SPEED * dt);
            collide_blocks(&mut self.player.pos, TANK_RADIUS, &self.blocks);
            self.player.pos = self.player.pos.clamp(
                Vec2::splat(-ARENA_HALF + TANK_RADIUS),
                Vec2::splat(ARENA_HALF - TANK_RADIUS),
            );
        }
        let to_aim = self.aim - self.player.pos;
        self.player.turret_rot = to_aim.y.atan2(to_aim.x);

        self.fire_cooldown -= dt;
        if self.want_fire > 0 && self.fire_cooldown <= 0.0 {
            self.want_fire -= 1;
            self.fire_cooldown = FIRE_COOLDOWN;
            let dir = Vec2::new(self.player.turret_rot.cos(), self.player.turret_rot.sin());
            let muzzle = self.player.pos + dir * 0.85;
            self.shells.push(Shell {
                id: self.next_id,
                pos: muzzle,
                vel: dir * SHELL_SPEED,
                ttl: SHELL_TTL,
                bounces: 0,
                dead: false,
            });
            self.next_id += 1;
            self.push_event(EV_SHELL_FIRED, muzzle, self.player.turret_rot);
        }

        let Sim { shells, blocks, .. } = self;
        for s in shells.iter_mut() {
            s.ttl -= dt;
            if s.ttl <= 0.0 {
                continue;
            }
            let steps = ((s.vel.length() * dt / SHELL_SUBSTEP).ceil() as usize).clamp(1, 16);
            let step_dt = dt / steps as f32;
            for _ in 0..steps {
                s.pos += s.vel * step_dt;
                if let Some((closest, normal)) = shell_hit(s.pos, SHELL_RADIUS, blocks) {
                    s.pos = closest + normal * (SHELL_RADIUS + 0.001);
                    if s.bounces >= 1 {
                        s.dead = true;
                        break;
                    }
                    if s.vel.dot(normal) < 0.0 {
                        s.vel -= 2.0 * s.vel.dot(normal) * normal;
                    }
                    s.bounces += 1;
                }
            }
        }
        let exploded: Vec<Vec2> = shells
            .iter()
            .filter(|s| {
                s.dead || s.ttl <= 0.0 || s.pos.x.abs() > ARENA_HALF || s.pos.y.abs() > ARENA_HALF
            })
            .map(|s| s.pos)
            .collect();
        shells.retain(|s| {
            !s.dead && s.ttl > 0.0 && s.pos.x.abs() <= ARENA_HALF && s.pos.y.abs() <= ARENA_HALF
        });
        for pos in exploded {
            self.push_event(EV_EXPLOSION, pos, 0.0);
        }
    }

    pub fn snapshot(&self) -> Vec<f32> {
        let mut out = Vec::with_capacity(1 + REC_LEN * (2 + self.shells.len() + self.blocks.len()));
        out.push(0.0);
        let mut n = 0;
        Rec {
            kind: KIND_TANK,
            id: 0.0,
            pos: self.player.pos,
            hull_rot: self.player.hull_rot,
            turret_rot: self.player.turret_rot,
            scale: 1.0,
            flags: FLAG_ALIVE + FLAG_PLAYER,
        }
        .push(&mut out, &mut n);
        for s in &self.shells {
            Rec {
                kind: KIND_SHELL,
                id: s.id as f32,
                pos: s.pos,
                hull_rot: s.vel.y.atan2(s.vel.x),
                turret_rot: 0.0,
                scale: 1.0,
                flags: FLAG_ALIVE,
            }
            .push(&mut out, &mut n);
        }
        for (i, b) in self.blocks.iter().enumerate() {
            Rec {
                kind: KIND_BLOCK,
                id: (BLOCK_ID_BASE + i as u32) as f32,
                pos: b.pos,
                hull_rot: 0.0,
                turret_rot: 0.0,
                scale: BLOCK_SIZE,
                flags: FLAG_ALIVE,
            }
            .push(&mut out, &mut n);
        }
        out[0] = n as f32;
        out
    }

    pub fn take_events(&mut self) -> Vec<f32> {
        if self.events.is_empty() {
            return Vec::new();
        }
        let mut out = Vec::with_capacity(1 + self.events.len());
        out.push((self.events.len() / EVENT_LEN) as f32);
        out.append(&mut self.events);
        out
    }

    fn push_event(&mut self, code: f32, pos: Vec2, arg: f32) {
        self.events.extend_from_slice(&[code, pos.x, pos.y, arg]);
    }
}

impl Default for Sim {
    fn default() -> Self {
        Self::new()
    }
}

struct Rec {
    kind: f32,
    id: f32,
    pos: Vec2,
    hull_rot: f32,
    turret_rot: f32,
    scale: f32,
    flags: f32,
}

impl Rec {
    fn push(self, out: &mut Vec<f32>, n: &mut usize) {
        out.extend_from_slice(&[
            self.kind,
            self.id,
            self.pos.x,
            self.pos.y,
            self.hull_rot,
            self.turret_rot,
            self.scale,
            self.flags,
        ]);
        *n += 1;
    }
}

fn turn_toward(cur: f32, target: f32, max_step: f32) -> f32 {
    let mut d = (target - cur).rem_euclid(TAU);
    if d > PI {
        d -= TAU;
    }
    cur + d.clamp(-max_step, max_step)
}

fn collide_blocks(pos: &mut Vec2, radius: f32, blocks: &[Block]) {
    let h = BLOCK_SIZE * 0.5;
    for b in blocks {
        let cx = b.pos.x + (pos.x - b.pos.x).clamp(-h, h);
        let cy = b.pos.y + (pos.y - b.pos.y).clamp(-h, h);
        let d = *pos - Vec2::new(cx, cy);
        let dist2 = d.length_squared();
        if dist2 < radius * radius {
            if dist2 > 1e-9 {
                *pos = Vec2::new(cx, cy) + d * (radius / dist2.sqrt());
            } else {
                pos.x = b.pos.x + h + radius;
            }
        }
    }
}

fn shell_hit(pos: Vec2, radius: f32, blocks: &[Block]) -> Option<(Vec2, Vec2)> {
    let h = BLOCK_SIZE * 0.5;
    for b in blocks {
        let closest = b.pos + (pos - b.pos).clamp(Vec2::splat(-h), Vec2::splat(h));
        let d = pos - closest;
        let dist2 = d.length_squared();
        if dist2 < radius * radius {
            let normal = if dist2 > 1e-9 {
                d / dist2.sqrt()
            } else {
                let local = pos - b.pos;
                let px = h - local.x.abs();
                let py = h - local.y.abs();
                if px < py {
                    Vec2::new(local.x.signum(), 0.0)
                } else {
                    Vec2::new(0.0, local.y.signum())
                }
            };
            return Some((closest, normal));
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn player_moves_with_input() {
        let mut sim = Sim::new();
        sim.set_input(1.0, 0.0, 5.0, 0.0);
        sim.tick(0.5);
        assert!((sim.player.pos.x - 2.0).abs() < 1e-4);
    }

    #[test]
    fn fire_spawns_shell_then_expires() {
        let mut sim = Sim::new();
        sim.set_input(0.0, 0.0, 5.0, 0.0);
        sim.request_fire();
        sim.tick(0.1);
        assert_eq!(sim.shells.len(), 1);
        sim.tick(SHELL_TTL);
        assert_eq!(sim.shells.len(), 0);
        let events = sim.take_events();
        assert_eq!(events[0], 2.0);
        assert_eq!(events[1], EV_SHELL_FIRED);
        assert_eq!(events[5], EV_EXPLOSION);
    }

    #[test]
    fn queued_fire_fires_each_press() {
        let mut sim = Sim::new();
        sim.set_input(0.0, 0.0, 5.0, 0.0);
        sim.request_fire();
        sim.request_fire();
        sim.request_fire();
        sim.tick(0.1);
        assert_eq!(sim.shells.len(), 1);
        sim.tick(0.1);
        assert_eq!(sim.shells.len(), 1);
        sim.tick(0.2);
        assert_eq!(sim.shells.len(), 2);
        sim.tick(0.2);
        assert_eq!(sim.shells.len(), 3);
    }

    #[test]
    fn shell_bounces_once_then_expires() {
        let mut sim = Sim::new();
        sim.set_input(0.0, 0.0, 0.0, 10.0);
        sim.request_fire();
        sim.tick(0.1);
        assert_eq!(sim.shells.len(), 1);
        for _ in 0..150 {
            sim.tick(0.016);
        }
        assert_eq!(sim.shells.len(), 1);
        assert_eq!(sim.shells[0].bounces, 1);
        for _ in 0..200 {
            sim.tick(0.016);
        }
        assert_eq!(sim.shells.len(), 0);
        let events = sim.take_events();
        assert_eq!(events[0], 2.0);
        assert_eq!(events[1], EV_SHELL_FIRED);
        assert_eq!(events[5], EV_EXPLOSION);
    }

    #[test]
    fn snapshot_lists_tank_and_blocks() {
        let sim = Sim::new();
        let snap = sim.snapshot();
        assert_eq!(snap[0] as usize, 1 + sim.blocks.len());
        assert_eq!(snap[1], KIND_TANK);
    }
}
