import { Application, Assets, Circle, Container, Sprite, Texture } from 'pixi.js';

type AnimalColor = 'red' | 'yellow';
type SnailKind = 'nerite' | 'ramshorn';
type ExplorationState = 'GRAZE' | 'CRAWL' | 'PAUSE' | 'TURN' | 'MOVE_TO_SURFACE' | 'FLEE' | 'HIDDEN' | 'RETURNING' | 'CLICKED_STOP';
type SurfaceZone = {
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  neighbors: number[];
};

type ShrimpState = {
  sprite: Sprite;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  zone: number;
  recentZones: number[];
  state: ExplorationState;
  decisionTimer: number;
  pauseTimer: number;
  seed: number;
  speed: number;
  direction: 1 | -1;
  frameClock: number;
  frameIndex: number;
  color: AnimalColor;
  interactionCooldown: number;
  hideTimer: number;
};

type BubbleState = {
  sprite: Sprite;
  x: number;
  y: number;
  speed: number;
  phase: number;
  life: number;
  originX?: number;
  originY?: number;
  hotspotIndex: number;
  burstIndex: number;
};

type SnailState = {
  sprite: Sprite;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  zone: number;
  recentZones: number[];
  state: ExplorationState;
  decisionTimer: number;
  pauseTimer: number;
  seed: number;
  speed: number;
  direction: 1 | -1;
  frameClock: number;
  frameIndex: number;
  kind: SnailKind;
  interactionCooldown: number;
  clickedStopTimer: number;
};

class AquariumCamera {
  currentY = 0;
  targetY = 0;

  setTarget(value: number) {
    this.targetY = value;
  }

  update(dt: number, reducedMotion: boolean) {
    if (reducedMotion) {
      this.currentY = this.targetY;
      return;
    }

    const smoothing = 1 - Math.exp(-8 * dt);
    this.currentY += (this.targetY - this.currentY) * smoothing;
  }
}

const LOGICAL_W = 1672;
const LOGICAL_BG_H = 941;
const LOGICAL_SCENE_H = 1236;
const BETTA_FRAME_SECONDS = 0.2;
const BETTA_AGGRESSIVE_FRAME_SECONDS = 0.1;
const BETTA_AGGRESSIVE_DURATION = 4;
const BETTA_WORLD_SCALE = 0.5;
const BETTA_BOUNDS = { minX: 90, maxX: 1580, minY: 105, maxY: 800 };
const SHRIMP_FRAME_SECONDS = 0.32;
const SNAIL_FRAME_SECONDS = 0.6;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export class AquariumScene {
  private readonly app: Application;
  private readonly root: Container;
  private readonly world = new Container();
  private readonly camera = new AquariumCamera();
  private reducedMotion: boolean;

  private bg!: Sprite;
  private fish!: Sprite;
  private shrimp: ShrimpState[] = [];
  private snails: SnailState[] = [];
  private pearlingBubbles: BubbleState[] = [];
  private waterHighlights: Sprite[] = [];

  private darkMode = false;

  private readonly pearlingRateMultiplier = 1.15;

  private readonly pearlingStreamPoolSize = 48;
  private readonly pearlingMinBurstCount = 2;
  private readonly pearlingMaxBurstCount = 3;

  private readonly pearlingMinInterval = 3.4;
  private readonly pearlingMaxInterval = 6.2;

  private readonly pearlingBubbleSpeed = 2.8;
  private pearlingTimers = [2.7, 4.8, 3.6, 5.4].map((value) => value / this.pearlingRateMultiplier);
  private bettaTargetX = 1060;
  private bettaTargetY = 420;
  private bettaVelocityX = 0;
  private bettaVelocityY = 0;
  private bettaHoverTimer = 0;
  private bettaInteractionCooldown = 0;
  private bettaStartleTimer = 0;
  private bettaAggressiveTimer = 0;
  private bettaTravelTimer = 0;
  private bettaStuckTimer = 0;
  private bettaCruiseSpeed = 46;
  private bettaTargetSeed = 0x51f15e;
  private bettaAtDestination = false;

  private bettaFrames: Texture[] = [];
  private redShrimpFrames: Texture[] = [];
  private yellowShrimpFrames: Texture[] = [];
  private neriteFrames: Texture[] = [];
  private ramshornFrames: Texture[] = [];

  private progress = 0;
  private time = 0;
  private fishFrameClock = 0;
  private fishFrameIndex = 0;
  private maxScrollPx = 0;
  private readonly surfaceZones: SurfaceZone[] = [
    { x: 240, y: 420, radiusX: 120, radiusY: 48, neighbors: [1, 4, 6] },
    { x: 500, y: 570, radiusX: 135, radiusY: 52, neighbors: [0, 2, 4, 9] },
    { x: 780, y: 720, radiusX: 145, radiusY: 55, neighbors: [1, 3, 7, 9] },
    { x: 1050, y: 590, radiusX: 150, radiusY: 55, neighbors: [2, 4, 5, 7] },
    { x: 1320, y: 470, radiusX: 135, radiusY: 48, neighbors: [1, 3, 5] },
    { x: 1460, y: 730, radiusX: 120, radiusY: 50, neighbors: [3, 4, 8] },
    { x: 300, y: 820, radiusX: 145, radiusY: 42, neighbors: [0, 7, 9] },
    { x: 720, y: 930, radiusX: 170, radiusY: 42, neighbors: [2, 6, 8] },
    { x: 1220, y: 900, radiusX: 170, radiusY: 45, neighbors: [3, 5, 7] },
    { x: 620, y: 360, radiusX: 120, radiusY: 42, neighbors: [0, 1, 2, 6] },
  ];

  constructor(app: Application, root: Container, reducedMotion: boolean) {
    this.app = app;
    this.root = root;
    this.reducedMotion = reducedMotion;

    this.root.addChild(this.world);
    this.world.sortableChildren = true;
    this.app.stage.eventMode = 'static';
    this.world.eventMode = 'static';
    this.app.canvas.style.touchAction = 'pan-y pinch-zoom';
    this.app.canvas.addEventListener('pointerdown', (event) => this.handlePointer(event, true));
    this.app.ticker.add((ticker) => {
      const dt = Math.min(ticker.deltaMS / 1000, 0.05);
      this.update(dt);
    });
  }

  async load() {
    const bgTexture = await Assets.load('/assets/world-environment.webp') as Texture;

    this.bg = new Sprite(bgTexture);
    this.bg.label = 'aquarium-background';
    this.bg.roundPixels = true;
    this.bg.texture.source.style.scaleMode = 'nearest';
    this.bg.zIndex = 0;
    this.world.addChild(this.bg);

    this.createWaterMotion();

    const bettaUrls = [
      '/assets/betta/1.png',
      '/assets/betta/2.png',
      '/assets/betta/3.png',
      '/assets/betta/4.png',
      '/assets/betta/5.png',
      '/assets/betta/6.png',
      '/assets/betta/7.png',
      '/assets/betta/8.png',
    ];
    const loadFrames = async (urls: string[], label: string) => {
      const frames = await Promise.all(
        urls.map(async (url, index) => {
          const frame = await Assets.load(url) as Texture;
          frame.source.style.scaleMode = 'nearest';
          frame.label = `${label}-${index + 1}`;
          return frame;
        }),
      );
      return frames;
    };

    // The background + Betta are the critical first-paint assets. Start the page
    // as soon as those are ready and stream the rest of the fauna in afterwards.
    this.bettaFrames = await loadFrames(bettaUrls, 'Betta');

    this.fish = new Sprite(this.bettaFrames[0]);
    this.fish.anchor.set(0.5);
    this.fish.zIndex = 40;
    this.fish.scale.set(BETTA_WORLD_SCALE);
    this.fish.eventMode = 'static';
    this.fish.cursor = 'pointer';
    this.fish.hitArea = new Circle(0, 0, 110);
    this.world.addChild(this.fish);

    this.fish.on('pointerdown', (event) => {
      event.stopPropagation();
      this.reactToBetta(this.fish.x, this.fish.y);
    });

    this.fish.position.set(1270, 390);
    this.bettaTargetX = 1370;
    this.bettaTargetY = 430;

    void (async () => {
      const [red, yellow, nerite, ramshorn] = await Promise.all([
        loadFrames(Array.from({ length: 8 }, (_, i) => `/assets/fauna/red-idle-${String(i + 1).padStart(2, '0')}.webp`), 'red shrimp'),
        loadFrames(Array.from({ length: 8 }, (_, i) => `/assets/fauna/yellow-idle-${String(i + 1).padStart(2, '0')}.webp`), 'yellow shrimp'),
        loadFrames(Array.from({ length: 8 }, (_, i) => `/assets/fauna/nerite-crawl-${String(i + 1).padStart(2, '0')}.webp`), 'Nerite snail'),
        loadFrames(Array.from({ length: 8 }, (_, i) => `/assets/fauna/ramshorn-crawl-${String(i + 1).padStart(2, '0')}.webp`), 'Ramshorn snail'),
      ]);

      this.redShrimpFrames = red;
      this.yellowShrimpFrames = yellow;
      this.neriteFrames = nerite;
      this.ramshornFrames = ramshorn;
      this.createFauna();
    })().catch((error) => {
      console.error('Aquarium fauna failed to load', error);
    });
  }

  private createFauna() {
    const shrimpSpec: Array<{ zone: number; speed: number; color: AnimalColor; seed: number }> = [
      { zone: 0, speed: 12, color: 'red', seed: 17 },
      { zone: 2, speed: 9, color: 'red', seed: 31 },
      { zone: 4, speed: 15, color: 'red', seed: 47 },
      { zone: 6, speed: 10, color: 'yellow', seed: 61 },
      { zone: 8, speed: 13, color: 'red', seed: 79 },
    ];

    for (const [index, spec] of shrimpSpec.entries()) {
      const frames = spec.color === 'red' ? this.redShrimpFrames : this.yellowShrimpFrames;
      const sprite = new Sprite(frames[0]);
      sprite.anchor.set(0.5);
      sprite.zIndex = 50;
      sprite.scale.set(0.72);
      sprite.eventMode = 'static';
      sprite.cursor = 'pointer';
      sprite.hitArea = new Circle(0, 0, 30);
      this.world.addChild(sprite);

      const point = this.randomSurfacePoint(spec.zone, spec.seed);
      const shrimpState: ShrimpState = { sprite, ...point, targetX: point.x, targetY: point.y, zone: spec.zone, recentZones: [spec.zone], state: 'GRAZE', decisionTimer: 2 + index * 0.8, pauseTimer: 2 + index * 0.6, seed: spec.seed, speed: spec.speed, direction: 1, frameClock: index * 0.09, frameIndex: index % frames.length, color: spec.color, interactionCooldown: 0, hideTimer: 0 };
      this.shrimp.push(shrimpState);
      sprite.on('pointerdown', (event) => {
        event.stopPropagation();
        this.reactToShrimp(shrimpState);
      });
      sprite.position.set(point.x, point.y);
    }

    const snailSpec: Array<{ kind: SnailKind; zone: number; seed: number }> = [
      { kind: 'ramshorn', zone: 2, seed: 101 },
      { kind: 'nerite', zone: 6, seed: 131 },
      { kind: 'ramshorn', zone: 7, seed: 167 },
      { kind: 'nerite', zone: 8, seed: 197 },
    ];

    for (const [index, spec] of snailSpec.entries()) {
      const frames = spec.kind === 'nerite' ? this.neriteFrames : this.ramshornFrames;
      const sprite = new Sprite(frames[0]);
      sprite.anchor.set(0.5);
      sprite.zIndex = 55;
      sprite.scale.set(spec.kind === 'nerite' ? 0.82 : 0.76);
      sprite.eventMode = 'static';
      sprite.cursor = 'pointer';
      sprite.hitArea = new Circle(0, 0, 30);
      const point = this.randomSurfacePoint(spec.zone, spec.seed);
      sprite.position.set(point.x, point.y);
      this.world.addChild(sprite);
      const snailState: SnailState = { sprite, ...point, targetX: point.x, targetY: point.y, zone: spec.zone, recentZones: [spec.zone], state: 'GRAZE', decisionTimer: 5 + index * 2.1, pauseTimer: 4 + index * 1.5, seed: spec.seed, speed: 1.8 + index * 0.45, direction: 1, frameClock: index * 0.2, frameIndex: 0, kind: spec.kind, interactionCooldown: 0, clickedStopTimer: 0 };
      this.snails.push(snailState);
      sprite.on('pointerdown', (event) => {
        event.stopPropagation();
        this.reactToSnail(snailState);
      });
    }
  }

  layout() {
    if (!this.bg || !this.fish) return;

    const w = this.app.screen.width;
    const h = this.app.screen.height;

    const scale = Math.max(w / LOGICAL_W, h / LOGICAL_BG_H);
    const sceneW = LOGICAL_W * scale;
    const sceneH = LOGICAL_SCENE_H * scale;

    this.root.scale.set(scale);
    this.root.x = w < 820 ? w * 0.62 - 1000 * scale : (w - sceneW) / 2;
    this.root.y = 0;

    this.bg.position.set(0, 0);
    this.bg.scale.set(1, 1);
    this.maxScrollPx = Math.max(0, sceneH - h);
    this.camera.targetY = (this.maxScrollPx / scale) * this.progress;
    this.update(0);
  }

  getMaxScrollPx() {
    return this.maxScrollPx;
  }

  setScrollProgress(progress: number) {
    this.progress = clamp(progress, 0, 1);
    this.camera.setTarget((this.maxScrollPx / Math.max(this.root.scale.x, 1)) * this.progress);
  }

  setReducedMotion(reduced: boolean) {
    this.reducedMotion = reduced;
  }

  setDarkMode(enabled: boolean) {
    this.darkMode = enabled;
    if (enabled) {

      this.bettaHoverTimer = 0;
      this.bettaAtDestination = false;
    }
  }

  private applyCamera() {
    if (!this.root) return;
    this.world.y = -this.camera.currentY;
  }

  private update(dt: number) {
    if (!this.bg || !this.fish) return;

    if (!this.reducedMotion) this.time += dt;
    this.camera.update(dt, this.reducedMotion);
    this.updateBetta(dt);
    this.updateShrimp(dt);
    this.updateSnails(dt);
    this.updateEnvironment(dt);
    this.updatePearling(dt);
    this.applyCamera();
  }

  private updateBetta(dt: number) {
    if (!this.reducedMotion) {
      this.fishFrameClock += dt;
      const bettaFrameSeconds = this.bettaAggressiveTimer > 0 ? BETTA_AGGRESSIVE_FRAME_SECONDS : BETTA_FRAME_SECONDS;
      if (this.fishFrameClock >= bettaFrameSeconds) {
        this.fishFrameClock %= bettaFrameSeconds;
        this.fishFrameIndex = (this.fishFrameIndex + 1) % this.bettaFrames.length;
        this.fish.texture = this.bettaFrames[this.fishFrameIndex];
      }
    }

    const wasAggressive = this.bettaAggressiveTimer > 0;
    this.bettaInteractionCooldown = Math.max(0, this.bettaInteractionCooldown - dt);
    this.bettaStartleTimer = Math.max(0, this.bettaStartleTimer - dt);
    this.bettaAggressiveTimer = Math.max(0, this.bettaAggressiveTimer - dt);
    this.bettaHoverTimer = Math.max(0, this.bettaHoverTimer - dt);
    this.bettaTravelTimer = Math.max(0, this.bettaTravelTimer - dt);

    if (wasAggressive && this.bettaAggressiveTimer <= 0) {
      this.bettaAtDestination = false;
      this.bettaHoverTimer = 0;
      this.bettaVelocityX *= 0.35;
      this.bettaVelocityY *= 0.35;
    }

    if (this.bettaAggressiveTimer <= 0) {
      if (this.bettaAtDestination) {

        if (this.bettaHoverTimer > 0) {
          const damping = Math.exp(-10 * dt);
          this.bettaVelocityX *= damping;
          this.bettaVelocityY *= damping;
          this.applyBettaBounds();
          this.fish.scale.x = BETTA_WORLD_SCALE * (this.bettaVelocityX >= 0 ? 1 : -1);
          this.fish.scale.y = BETTA_WORLD_SCALE;
          return;
        }

        this.chooseBettaTarget(true);
      } else {
        const targetDistanceBefore = Math.hypot(this.bettaTargetX - this.fish.x, this.bettaTargetY - this.fish.y);
        if (targetDistanceBefore <= 34) {

          this.bettaAtDestination = true;
          this.bettaHoverTimer = 2.2 + this.nextBettaRandom() * 2.2;
          this.bettaStuckTimer = 0;
          this.bettaVelocityX *= 0.35;
          this.bettaVelocityY *= 0.35;
          this.applyBettaBounds();
          this.fish.scale.x = BETTA_WORLD_SCALE * (this.bettaVelocityX >= 0 ? 1 : -1);
          this.fish.scale.y = BETTA_WORLD_SCALE;
          return;
        } else if (this.bettaStuckTimer > 1.75 || this.bettaTravelTimer <= 0) {

          this.bettaStuckTimer = 0;
          this.chooseBettaTarget(true);
        }
      }
    }

    const dx = this.bettaTargetX - this.fish.x;
    const dy = this.bettaTargetY - this.fish.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const desiredSpeed = this.bettaAggressiveTimer > 0
      ? 88
      : this.bettaStartleTimer > 0
        ? 95
        : this.bettaCruiseSpeed;
    const response = Math.min(1, dt * (this.bettaAggressiveTimer > 0 ? 3.0 : this.bettaStartleTimer > 0 ? 3.0 : 0.9));
    const desiredVX = (dx / distance) * desiredSpeed;
    const desiredVY = (dy / distance) * desiredSpeed;
    this.bettaVelocityX += (desiredVX - this.bettaVelocityX) * response;
    this.bettaVelocityY += (desiredVY - this.bettaVelocityY) * response;

    this.fish.x += this.bettaVelocityX * dt;
    this.fish.y += this.bettaVelocityY * dt;

    const targetDistanceAfterStep = Math.hypot(this.bettaTargetX - this.fish.x, this.bettaTargetY - this.fish.y);
    const currentSpeed = Math.hypot(this.bettaVelocityX, this.bettaVelocityY);
    if (this.bettaAggressiveTimer <= 0 && targetDistanceAfterStep > 45 && currentSpeed < 6) {
      this.bettaStuckTimer += dt;
    } else {
      this.bettaStuckTimer = Math.max(0, this.bettaStuckTimer - dt * 2);
    }

    this.applyBettaBounds();
    this.fish.scale.x = BETTA_WORLD_SCALE * (Math.abs(this.bettaVelocityX) < 1.5 || this.bettaVelocityX >= 0 ? 1 : -1);
    this.fish.scale.y = BETTA_WORLD_SCALE;
  }

  private applyBettaBounds() {
    if (this.fish.x < BETTA_BOUNDS.minX) {
      this.fish.x = BETTA_BOUNDS.minX;
      this.bettaVelocityX = Math.abs(this.bettaVelocityX);
    } else if (this.fish.x > BETTA_BOUNDS.maxX) {
      this.fish.x = BETTA_BOUNDS.maxX;
      this.bettaVelocityX = -Math.abs(this.bettaVelocityX);
    }
    if (this.fish.y < BETTA_BOUNDS.minY) {
      this.fish.y = BETTA_BOUNDS.minY;
      this.bettaVelocityY = Math.abs(this.bettaVelocityY);
    } else if (this.fish.y > BETTA_BOUNDS.maxY) {
      this.fish.y = BETTA_BOUNDS.maxY;
      this.bettaVelocityY = -Math.abs(this.bettaVelocityY);
    }
  }

  private updateShrimp(dt: number) {
    for (const shrimp of this.shrimp) {
      shrimp.interactionCooldown = Math.max(0, shrimp.interactionCooldown - dt);

      if (shrimp.state === 'HIDDEN') {
        shrimp.hideTimer = Math.max(0, shrimp.hideTimer - dt);
        shrimp.sprite.visible = false;
        if (shrimp.hideTimer <= 0) {
          const returnPoint = this.randomSurfacePoint(shrimp.zone, shrimp.seed + this.time * 17);
          shrimp.x = returnPoint.x;
          shrimp.y = returnPoint.y;
          shrimp.targetX = returnPoint.x;
          shrimp.targetY = returnPoint.y;
          shrimp.state = 'RETURNING';
          shrimp.sprite.visible = true;
          shrimp.pauseTimer = 0.5;
          shrimp.decisionTimer = 0.5;
        }
      } else {
        if (!this.reducedMotion) {
          shrimp.frameClock += dt;
          if (shrimp.frameClock >= SHRIMP_FRAME_SECONDS) {
            shrimp.frameClock %= SHRIMP_FRAME_SECONDS;
            const frames = shrimp.color === 'red' ? this.redShrimpFrames : this.yellowShrimpFrames;
            shrimp.frameIndex = (shrimp.frameIndex + 1) % frames.length;
            shrimp.sprite.texture = frames[shrimp.frameIndex];
          }

          if (shrimp.state === 'FLEE' || shrimp.state === 'RETURNING') {
            this.updateFleeingShrimp(shrimp, dt);
          } else {
            this.updateExplorer(shrimp, dt, false);
          }
        }
      }

      shrimp.sprite.x = shrimp.x;
      shrimp.sprite.y = shrimp.y;
      shrimp.sprite.visible = shrimp.state !== 'HIDDEN';
      shrimp.sprite.scale.x = Math.abs(shrimp.sprite.scale.y) * shrimp.direction;
    }
  }

  private updateFleeingShrimp(shrimp: ShrimpState, dt: number) {
    const dx = shrimp.targetX - shrimp.x;
    const dy = shrimp.targetY - shrimp.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    if (distance <= 4) {
      if (shrimp.state === 'FLEE') {
        shrimp.x = shrimp.targetX;
        shrimp.y = shrimp.targetY;
        shrimp.state = 'HIDDEN';
        shrimp.hideTimer = 8;
        shrimp.sprite.visible = false;
      } else {
        shrimp.state = 'GRAZE';
        shrimp.pauseTimer = 1.5 + this.randomUnit(shrimp.seed + this.time) * 2;
        shrimp.decisionTimer = shrimp.pauseTimer;
      }
      return;
    }

    const fleeSpeed = shrimp.state === 'FLEE' ? 85 : 24;
    const step = Math.min(distance, fleeSpeed * dt);
    shrimp.x += (dx / distance) * step;
    shrimp.y += (dy / distance) * step;
    shrimp.direction = dx >= 0 ? 1 : -1;
  }

  private updateEnvironment(dt: number) {
    if (this.reducedMotion) return;

    for (const [index, highlight] of this.waterHighlights.entries()) {
      highlight.x += dt * (4 + index);
      highlight.alpha = this.darkMode ? 0 : 0.15 + Math.sin(this.time * 0.25 + index) * 0.08;
      if (highlight.x > LOGICAL_W + 40) highlight.x = -40;
    }
  }

  private updateSnails(dt: number) {
    for (const snail of this.snails) {
      snail.interactionCooldown = Math.max(0, snail.interactionCooldown - dt);
      if (snail.state === 'CLICKED_STOP') {
        snail.clickedStopTimer = Math.max(0, snail.clickedStopTimer - dt);
        snail.targetX = snail.x;
        snail.targetY = snail.y;
        snail.decisionTimer = 0;
        snail.pauseTimer = 0;
        if (snail.clickedStopTimer <= 0) {
          snail.state = 'GRAZE';
          snail.pauseTimer = 2.5 + this.randomUnit(snail.seed + this.time) * 2.5;
          snail.decisionTimer = snail.pauseTimer;
        }
      } else if (!this.reducedMotion) {
        snail.frameClock += dt;
        if (snail.frameClock >= SNAIL_FRAME_SECONDS) {
          snail.frameClock %= SNAIL_FRAME_SECONDS;
          const frames = snail.kind === 'nerite' ? this.neriteFrames : this.ramshornFrames;
          snail.frameIndex = (snail.frameIndex + 1) % frames.length;
          snail.sprite.texture = frames[snail.frameIndex];
        }
        this.updateExplorer(snail, dt, true);
      }
      snail.sprite.x = snail.x;
      snail.sprite.y = snail.y;
      snail.sprite.scale.x = Math.abs(snail.sprite.scale.y) * snail.direction;
    }
  }

  private randomUnit(seed: number) {
    const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return value - Math.floor(value);
  }

  private nextBettaRandom() {

    this.bettaTargetSeed = (this.bettaTargetSeed * 1664525 + 1013904223) >>> 0;
    return this.bettaTargetSeed / 4294967296;
  }

  private chooseBettaTarget(forceNew = false) {
    if (this.darkMode) {
      this.chooseBettaNightTarget();
      return;
    }

    const currentX = this.fish.x;
    const currentY = this.fish.y;

    const columns = [
      { minX: 120, maxX: 500 },
      { minX: 525, maxX: 1120 },
      { minX: 1145, maxX: 1550 },
    ];
    const rows = [
      { minY: 125, maxY: 315 },
      { minY: 335, maxY: 545 },
      { minY: 565, maxY: 780 },
    ];

    const currentColumn = currentX < columns[0].maxX ? 0 : currentX < columns[2].minX ? 1 : 2;
    const currentRow = currentY < rows[0].maxY ? 0 : currentY < rows[2].minY ? 1 : 2;
    const farCandidates: Array<[number, number]> = [];
    const allCandidates: Array<[number, number]> = [];

    for (let column = 0; column < columns.length; column += 1) {
      for (let row = 0; row < rows.length; row += 1) {
        if (column === currentColumn && row === currentRow) continue;
        allCandidates.push([column, row]);
        if (Math.abs(column - currentColumn) + Math.abs(row - currentRow) >= 2) {
          farCandidates.push([column, row]);
        }
      }
    }

    const candidatePool = farCandidates.length ? farCandidates : allCandidates;
    const [columnIndex, rowIndex] = candidatePool[Math.floor(this.nextBettaRandom() * candidatePool.length)];
    const column = columns[columnIndex];
    const row = rows[rowIndex];

    const targetX = column.minX + 35 + this.nextBettaRandom() * Math.max(1, column.maxX - column.minX - 70);
    const targetY = row.minY + 25 + this.nextBettaRandom() * Math.max(1, row.maxY - row.minY - 50);

    const distance = Math.hypot(targetX - currentX, targetY - currentY);
    if (forceNew && distance < 420) {

      const farthest = allCandidates
        .map(([c, r]) => ({ c, r, d: Math.hypot((columns[c].minX + columns[c].maxX) * 0.5 - currentX, (rows[r].minY + rows[r].maxY) * 0.5 - currentY) }))
        .sort((a, b) => b.d - a.d)[0];
      const farColumn = columns[farthest.c];
      const farRow = rows[farthest.r];
      this.bettaTargetX = farColumn.minX + 40 + this.nextBettaRandom() * Math.max(1, farColumn.maxX - farColumn.minX - 80);
      this.bettaTargetY = farRow.minY + 30 + this.nextBettaRandom() * Math.max(1, farRow.maxY - farRow.minY - 60);
    } else {
      this.bettaTargetX = targetX;
      this.bettaTargetY = targetY;
    }

    this.bettaCruiseSpeed = 42 + this.nextBettaRandom() * 10;
    this.bettaTravelTimer = 25 + this.nextBettaRandom() * 13;
    this.bettaHoverTimer = 0;
    this.bettaStuckTimer = 0;
    this.bettaAtDestination = false;
  }

  private chooseBettaNightTarget() {
    const currentX = this.fish.x;
    const currentY = this.fish.y;
    const angle = this.nextBettaRandom() * Math.PI * 2;
    const radius = 45 + this.nextBettaRandom() * 65;

    this.bettaTargetX = clamp(currentX + Math.cos(angle) * radius, BETTA_BOUNDS.minX, BETTA_BOUNDS.maxX);
    this.bettaTargetY = clamp(currentY + Math.sin(angle) * radius, BETTA_BOUNDS.minY, BETTA_BOUNDS.maxY);
    this.bettaCruiseSpeed = 10 + this.nextBettaRandom() * 6;
    this.bettaTravelTimer = 22 + this.nextBettaRandom() * 12;
    this.bettaHoverTimer = 0;
    this.bettaStuckTimer = 0;
    this.bettaAtDestination = false;
  }

  private readonly pearlingHotspots = [
    { x: 280, y: 760 }, { x: 940, y: 800 }, { x: 1360, y: 730 }, { x: 1600, y: 840 },
  ];

  private updatePearling(dt: number) {
    if (this.darkMode || this.reducedMotion) {
      for (const bubble of this.pearlingBubbles) bubble.sprite.visible = false;
      return;
    }

    for (let hotspotIndex = 0; hotspotIndex < this.pearlingHotspots.length; hotspotIndex += 1) {
      const group = this.pearlingBubbles.filter((bubble) => bubble.hotspotIndex === hotspotIndex);
      this.pearlingTimers[hotspotIndex] -= dt;

      if (this.pearlingTimers[hotspotIndex] <= 0) {
        const hotspot = this.pearlingHotspots[hotspotIndex];
        const seed = this.time * 17 + hotspotIndex * 97;
        const burstCount = this.pearlingMinBurstCount + (this.randomUnit(seed) > 0.62 ? 1 : 0);

        const patterns = [
          [
            { x: -13, y: 0 },
            { x: 9, y: -19 },
            { x: -2, y: -39 },
          ],
          [
            { x: 12, y: -4 },
            { x: -8, y: -24 },
            { x: 4, y: -45 },
          ],
          [
            { x: -9, y: -2 },
            { x: 15, y: -27 },
            { x: 1, y: -51 },
          ],
        ];
        const pattern = patterns[Math.floor(this.randomUnit(seed + 11) * patterns.length)];

        let spawned = 0;
        for (let burstIndex = 0; burstIndex < burstCount; burstIndex += 1) {
          const bubble = group.find((candidate) => !candidate.sprite.visible);
          if (!bubble) break;

          const offset = pattern[burstIndex];
          const jitterSeed = seed + burstIndex * 19.7;
          const horizontalJitter = (this.randomUnit(jitterSeed) - 0.5) * 6;
          const verticalJitter = (this.randomUnit(jitterSeed + 7) - 0.5) * 7;

          bubble.sprite.visible = true;
          bubble.x = hotspot.x + offset.x + horizontalJitter;
          bubble.y = hotspot.y + offset.y + verticalJitter;
          bubble.originX = bubble.x;
          bubble.originY = bubble.y;
          bubble.speed = this.pearlingBubbleSpeed * (0.82 + this.randomUnit(jitterSeed + 13) * 0.28);
          bubble.phase = hotspotIndex * 23 + bubble.burstIndex * 0.8 + burstIndex * 2.7 + this.randomUnit(jitterSeed + 3) * 2;

          const surfaceY = 120;
          const travelDistance = Math.max(0, bubble.y - surfaceY) * 0.75;
          bubble.life = travelDistance / Math.max(bubble.speed, 0.001) + 0.35;
          bubble.sprite.width = 2 + Math.round(this.randomUnit(jitterSeed + 5) * 2);
          bubble.sprite.height = bubble.sprite.width;
          bubble.sprite.alpha = 0.18 + this.randomUnit(jitterSeed + 9) * 0.18;

          bubble.burstIndex = (bubble.burstIndex + 1) % this.pearlingStreamPoolSize;
          spawned += 1;
        }

        if (spawned > 0) {

          const nextInterval = this.pearlingMinInterval
            + this.randomUnit(seed + 29) * (this.pearlingMaxInterval - this.pearlingMinInterval);
          this.pearlingTimers[hotspotIndex] = nextInterval / this.pearlingRateMultiplier;
        } else {
          this.pearlingTimers[hotspotIndex] = 0.8;
        }
      }

      for (const bubble of group) {
        if (!bubble.sprite.visible) continue;

        bubble.y -= bubble.speed * dt;
        bubble.life -= dt;
        const sway = Math.sin(this.time * 0.42 + bubble.phase) * 2.4
          + Math.sin(this.time * 0.19 + bubble.phase * 1.7) * 0.8;
        bubble.sprite.position.set(bubble.x + sway, bubble.y);

        const fade = clamp(bubble.life / 0.8, 0, 1);
        bubble.sprite.alpha = fade * 0.36;

        const disappearanceY = bubble.originY! - (bubble.originY! - 120) * 0.75;
        if (bubble.y <= disappearanceY || bubble.life <= 0) {
          bubble.sprite.visible = false;
          bubble.sprite.alpha = 0;
        }
      }
    }
  }

  private reactToBetta(clickX: number, clickY: number) {
    if (this.bettaInteractionCooldown > 0) return;

    const angle = Math.atan2(clickY - this.fish.y, clickX - this.fish.x);
    const escapeAngle = angle + Math.PI;
    const escapeDistance = 180 + this.nextBettaRandom() * 110;

    this.bettaTargetX = clamp(
      this.fish.x + Math.cos(escapeAngle) * escapeDistance,
      BETTA_BOUNDS.minX,
      BETTA_BOUNDS.maxX,
    );
    this.bettaTargetY = clamp(
      this.fish.y + Math.sin(escapeAngle) * escapeDistance,
      BETTA_BOUNDS.minY,
      BETTA_BOUNDS.maxY,
    );
    this.bettaAggressiveTimer = BETTA_AGGRESSIVE_DURATION;
    this.bettaStartleTimer = 0;
    this.bettaAtDestination = false;
    this.bettaHoverTimer = 0;
    this.bettaStuckTimer = 0;
    this.bettaTravelTimer = 0;
    this.bettaInteractionCooldown = BETTA_AGGRESSIVE_DURATION + 0.5;
  }

  private handlePointer(event: PointerEvent, pressed = false) {
    const bounds = this.app.canvas.getBoundingClientRect();
    const scale = Math.max(this.root.scale.x, 0.0001);
    const canvasX = event.clientX - bounds.left;
    const canvasY = event.clientY - bounds.top;
    const worldX = (canvasX - this.root.x) / scale;
    const worldY = (canvasY - this.root.y + this.camera.currentY * scale) / scale;
    if (!pressed) return;

    const faunaHit = this.isNearSurfaceFauna(worldX, worldY);
    const fishDistance = Math.hypot(worldX - this.fish.x, worldY - this.fish.y);

    if (fishDistance < 130) {
      this.reactToBetta(worldX, worldY);
    } else if (!faunaHit) {
      this.bettaTargetX = clamp(worldX, BETTA_BOUNDS.minX, BETTA_BOUNDS.maxX);
      this.bettaTargetY = clamp(worldY, BETTA_BOUNDS.minY, BETTA_BOUNDS.maxY);
      this.bettaHoverTimer = 0;
      this.bettaAtDestination = false;
      this.bettaStuckTimer = 0;
      this.bettaTravelTimer = 25 + this.nextBettaRandom() * 13;
    }
  }

  private isNearSurfaceFauna(x: number, y: number) {
    for (const shrimp of this.shrimp) {
      if (!shrimp.sprite.visible) continue;
      const hitRadius = Math.max(32, 40 * Math.abs(shrimp.sprite.scale.x));
      if (Math.hypot(x - shrimp.x, y - shrimp.y) <= hitRadius) return true;
    }
    for (const snail of this.snails) {
      const hitRadius = Math.max(32, 44 * Math.abs(snail.sprite.scale.x));
      if (Math.hypot(x - snail.x, y - snail.y) <= hitRadius) return true;
    }
    return false;
  }

  private reactToShrimp(shrimp: ShrimpState) {
    if (shrimp.interactionCooldown > 0 || shrimp.state === 'HIDDEN' || shrimp.state === 'FLEE') return;
    const preferredZone = this.surfaceZones[shrimp.zone];
    const neighbors = preferredZone.neighbors.length ? preferredZone.neighbors : [shrimp.zone];
    const nextZone = neighbors[Math.floor(this.randomUnit(shrimp.seed + this.time * 3.7) * neighbors.length)];
    const cover = this.randomSurfacePoint(nextZone, shrimp.seed + this.time * 11);
    shrimp.zone = nextZone;
    shrimp.recentZones = [...shrimp.recentZones.slice(-2), nextZone];
    shrimp.targetX = cover.x;
    shrimp.targetY = cover.y;
    shrimp.state = 'FLEE';
    shrimp.pauseTimer = 0;
    shrimp.decisionTimer = 0;
    shrimp.interactionCooldown = 8.5;
    shrimp.sprite.visible = true;
  }

  private reactToSnail(snail: SnailState) {
    if (snail.interactionCooldown > 0 || snail.state === 'CLICKED_STOP') return;
    snail.state = 'CLICKED_STOP';
    snail.targetX = snail.x;
    snail.targetY = snail.y;
    snail.clickedStopTimer = 4;
    snail.pauseTimer = 0;
    snail.decisionTimer = 0;
    snail.interactionCooldown = 4.5;

  }

  private randomSurfacePoint(zoneIndex: number, seed: number) {
    const zone = this.surfaceZones[zoneIndex];
    const x = zone.x + (this.randomUnit(seed) * 2 - 1) * zone.radiusX;
    const y = zone.y + (this.randomUnit(seed + 11) * 2 - 1) * zone.radiusY;
    return { x, y };
  }

  private chooseSurface(entity: ShrimpState | SnailState, snail: boolean) {
    if (!snail && this.darkMode) {

      const seed = entity.seed + entity.decisionTimer * 3;
      const angle = this.randomUnit(seed) * Math.PI * 2;
      const radius = 8 + this.randomUnit(seed + 4) * 16;
      entity.targetX = clamp(entity.x + Math.cos(angle) * radius, 60, LOGICAL_W - 60);
      entity.targetY = clamp(entity.y + Math.sin(angle) * radius, 150, 1050);
      entity.state = 'MOVE_TO_SURFACE';
      entity.decisionTimer = 6 + this.randomUnit(seed + 7) * 9;
      return;
    }

    const zone = this.surfaceZones[entity.zone];
    const candidates = zone.neighbors.filter((candidate) => !entity.recentZones.includes(candidate) || this.randomUnit(entity.seed + candidate) > 0.72);
    const pool = candidates.length > 0 ? candidates : zone.neighbors;
    const nextZone = pool[Math.floor(this.randomUnit(entity.seed + entity.decisionTimer * 3) * pool.length)];
    entity.recentZones = [...entity.recentZones.slice(-2), nextZone];
    entity.zone = nextZone;
    const point = this.randomSurfacePoint(nextZone, entity.seed + entity.recentZones.length * 19);
    entity.targetX = point.x;
    entity.targetY = point.y;
    entity.state = 'MOVE_TO_SURFACE';
    entity.decisionTimer = 4 + this.randomUnit(entity.seed + this.time) * 7;
  }

  private updateExplorer(entity: ShrimpState | SnailState, dt: number, snail: boolean) {
    entity.decisionTimer -= dt;
    entity.pauseTimer -= dt;

    const nightShrimp = !snail && this.darkMode;

    if (entity.state === 'GRAZE' || entity.state === 'PAUSE') {
      if (entity.pauseTimer <= 0 || entity.decisionTimer <= 0) this.chooseSurface(entity, snail);
    } else {
      const dx = entity.targetX - entity.x;
      const dy = entity.targetY - entity.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 3) {
        entity.x = entity.targetX;
        entity.y = entity.targetY;
        entity.state = this.randomUnit(entity.seed + this.time) > 0.45 ? 'GRAZE' : 'PAUSE';
        entity.pauseTimer = (snail ? 3.5 : nightShrimp ? 3 : 1.2) + this.randomUnit(entity.seed + 9) * (snail ? 7 : nightShrimp ? 6 : 4);
        entity.decisionTimer = entity.pauseTimer;
      } else {
        const speedScale = nightShrimp ? 0.3 : 1;
        const step = Math.min(distance, entity.speed * speedScale * (0.65 + this.randomUnit(entity.seed + 5) * 0.35) * dt);
        entity.x += (dx / distance) * step;
        entity.y += (dy / distance) * step;
        entity.direction = dx >= 0 ? 1 : -1;
        entity.state = 'CRAWL';
      }
    }
  }

  private createWaterMotion() {
    const pixel = Texture.WHITE;
    for (let index = 0; index < 22; index += 1) {
      const highlight = new Sprite(pixel);
      highlight.position.set((index * 89) % LOGICAL_W, 74 + (index % 4) * 9);
      highlight.width = 18 + (index % 3) * 8;
      highlight.height = 2;
      highlight.tint = 0xb8f4c1;
      highlight.alpha = 0.18;
      highlight.zIndex = 5;
      this.world.addChild(highlight);
      this.waterHighlights.push(highlight);
    }

    for (let hotspotIndex = 0; hotspotIndex < this.pearlingHotspots.length; hotspotIndex += 1) {
      const hotspot = this.pearlingHotspots[hotspotIndex];
      for (let streamIndex = 0; streamIndex < this.pearlingStreamPoolSize; streamIndex += 1) {
        const sprite = new Sprite(pixel);
        sprite.width = 3;
        sprite.height = 3;
        sprite.tint = 0xd9f5dd;
        sprite.zIndex = 36;
        sprite.visible = false;
        sprite.alpha = 0;
        this.world.addChild(sprite);
        this.pearlingBubbles.push({
          sprite,
          x: hotspot.x,
          y: hotspot.y,
          speed: this.pearlingBubbleSpeed,
          phase: hotspotIndex * 23 + streamIndex * 0.8,
          life: 0,
          originX: hotspot.x,
          originY: hotspot.y,
          hotspotIndex,
          burstIndex: streamIndex,
        });
      }
    }
  }
}
