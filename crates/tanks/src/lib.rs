mod sim;

use js_sys::Float32Array;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct Game {
    sim: sim::Sim,
}

#[wasm_bindgen]
impl Game {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Game {
        console_error_panic_hook::set_once();
        Game {
            sim: sim::Sim::new(),
        }
    }

    pub fn set_input(&mut self, move_x: f32, move_y: f32, aim_x: f32, aim_y: f32) {
        self.sim.set_input(move_x, move_y, aim_x, aim_y);
    }

    pub fn request_fire(&mut self) {
        self.sim.request_fire();
    }

    pub fn tick(&mut self, dt: f32) -> Float32Array {
        self.sim.tick(dt);
        Float32Array::from(self.sim.snapshot().as_slice())
    }

    pub fn take_events(&mut self) -> Float32Array {
        Float32Array::from(self.sim.take_events().as_slice())
    }
}

impl Default for Game {
    fn default() -> Self {
        Self::new()
    }
}
