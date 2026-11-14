// The audio port the game depends on, doing nothing. Used headless (tests).
export class NullAudio {
  constructor() {
    this.on = false
    this.stepDur = 0.15
  }
  resume() {}
  suspend() {}
  toggle() {
    return this.on
  }
  setBoss() {}
  update() {}
}
