import * as THREE from "three";

export interface Telemetry {
  fps: number;
  heat: number;
  zoom: number;
  wells: number;
}

export interface EngineHooks {
  onBoot: (step: string) => void;
  onReady: () => void;
  onMorph: (index: number, name: string) => void;
  onTelemetry: (t: Telemetry) => void;
  onPinch: (strength: number, anyPinch: boolean) => void;
}

export const SHAPES = [
  { name: "SPHERE" },
  { name: "HEART" },
  { name: "SATURN" },
  { name: "FLOWER" },
  { name: "HELIX" },
  { name: "GALAXY" },
];

const COUNT = 25000;
const SPRING = 30;
const VMAX = 130;
const NONE = 0;
const SWIRL = 1;
const PINCH = 2;
const MAX_WELLS = 5;
const HAND_ROT_GAIN = 42;
const MAX_ROT_V = 9;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const tick = () => new Promise<void>((r) => setTimeout(r, 80));

interface Interactor {
  mode: number;
  gain: number;
  heat: number;
  heatT: number;
  strength: number;
  world: THREE.Vector3;
  local: THREE.Vector3;
  pinchPrev: boolean;
}

interface Ripple {
  sprite: THREE.Sprite;
  life: number;
  base: number;
}

export class NebulaEngine {
  private container: HTMLElement;
  private hooks: EngineHooks;
  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private group = new THREE.Group();
  private geo!: THREE.BufferGeometry;
  private mat!: THREE.ShaderMaterial;
  private stars!: THREE.Points;

  private pos = new Float32Array(COUNT * 3);
  private vel = new Float32Array(COUNT * 3);
  private tgt = new Float32Array(COUNT * 3);
  private seeds = new Float32Array(COUNT);
  private scales = new Float32Array(COUNT);
  private springVar = new Float32Array(COUNT);

  private wells: { pos: THREE.Vector3; strength: number; decay: number }[] = [];
  private ripples: Ripple[] = [];
  private glows: THREE.Sprite[] = [];

  private inter: Interactor[] = [];
  private handPresent = [false, false];
  private rot = { vx: 0, vy: 0 };

  private camDist = 27;
  private camDistT = 27;
  private viewHalfH = 1;
  private viewHalfW = 1;

  private curShape = 0;
  private userInteracted = false;
  private lastMorphT = performance.now();
  private lastInputAt = performance.now();
  private lastPX = 0;
  private lastPY = 0;
  private pointerSeeded = false;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchDistPrev = 0;

  private audio = { bass: 0, mid: 0, treble: 0, beat: 0 };
  private rafId = 0;
  private last = performance.now();
  private fpsFrames = 0;
  private fpsTime = performance.now();
  private disposed = false;

  private shapeFns: (() => void)[];
  private boundKeyDown: (e: KeyboardEvent) => void;
  private boundResize: () => void;

  constructor(container: HTMLElement, hooks: EngineHooks) {
    this.container = container;
    this.hooks = hooks;
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 400);
    this.camera.position.z = this.camDist;

    for (let h = 0; h < 2; h++) {
      this.inter.push({
        mode: NONE, gain: 1, heat: 0, heatT: 0, strength: 0,
        world: new THREE.Vector3(), local: new THREE.Vector3(), pinchPrev: false,
      });
    }

    this.shapeFns = [
      () => this.shapeSphere(), () => this.shapeHeart(), () => this.shapeSaturn(),
      () => this.shapeFlower(), () => this.shapeHelix(), () => this.shapeGalaxy(),
    ];
    this.boundKeyDown = (e) => this.onKeyDown(e);
    this.boundResize = () => this.onResize();
  }

  /* ══════════ boot ══════════ */
  async init() {
    this.hooks.onBoot("igniting webgl core");
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true,
    });
    this.renderer.setClearColor(0x03040c, 1);
    this.renderer.setPixelRatio(this.dpr());
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.domElement.style.touchAction = "none";
    this.container.appendChild(this.renderer.domElement);
    this.scene.add(this.group);
    await tick();

    this.hooks.onBoot("seeding 25,000 particles");
    for (let i = 0; i < COUNT; i++) {
      this.seeds[i] = Math.random();
      this.scales[i] = (0.6 + Math.random() * 0.9) * (Math.random() < 0.04 ? 2.1 : 1);
      this.springVar[i] = 0.72 + Math.random() * 0.56;
      const r = 14 + Math.random() * 22;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      this.pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      this.pos[i * 3 + 1] = r * Math.cos(ph);
      this.pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute("aSeed", new THREE.BufferAttribute(this.seeds, 1));
    this.geo.setAttribute("aScale", new THREE.BufferAttribute(this.scales, 1));
    await tick();

    this.hooks.onBoot("compiling shaders");
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: this.makeGlowTexture() },
        uTime: { value: 0 }, uHeat: { value: 0 }, uSize: { value: 2.9 },
        uPixelRatio: { value: this.dpr() }, uBass: { value: 0 }, uTreble: { value: 0 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.group.add(new THREE.Points(this.geo, this.mat));
    this.buildStars();
    this.buildRipples();
    this.buildGlows();
    await tick();

    this.hooks.onBoot("calibrating force fields");
    this.bindEvents();
    this.onResize();
    this.setShape(0, true);
    await tick();

    this.hooks.onBoot("universe online");
    this.renderer.render(this.scene, this.camera);
    this.hooks.onReady();
    this.last = performance.now();
    this.rafId = requestAnimationFrame((n) => this.loop(n));
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    window.removeEventListener("keydown", this.boundKeyDown);
    window.removeEventListener("resize", this.boundResize);
    window.removeEventListener("pointerup", this.onPointerUp);
    const cv = this.renderer?.domElement;
    if (cv) {
      cv.removeEventListener("pointermove", this.onPointerMove);
      cv.removeEventListener("pointerdown", this.onPointerDown);
      cv.removeEventListener("pointerleave", this.onPointerLeave);
      cv.removeEventListener("dblclick", this.onDblClick);
      cv.removeEventListener("wheel", this.onWheel);
    }
  }

  private dpr() { return Math.min(window.devicePixelRatio || 1, 2); }

  /* ══════════ textures / helpers ══════════ */
  private makeGlowTexture() {
    const s = 128;
    const c = document.createElement("canvas");
    c.width = c.height = s;
    const g = c.getContext("2d")!;
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0.0, "rgba(255,255,255,1)");
    grd.addColorStop(0.16, "rgba(255,255,255,.92)");
    grd.addColorStop(0.38, "rgba(175,215,255,.42)");
    grd.addColorStop(0.7, "rgba(95,125,255,.10)");
    grd.addColorStop(1.0, "rgba(0,0,0,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
    return new THREE.CanvasTexture(c);
  }

  private makeRingTexture() {
    const s = 128;
    const c = document.createElement("canvas");
    c.width = c.height = s;
    const g = c.getContext("2d")!;
    g.strokeStyle = "rgba(255,255,255,0.95)";
    g.lineWidth = 7;
    g.shadowColor = "rgba(255,255,255,0.9)";
    g.shadowBlur = 14;
    g.beginPath();
    g.arc(s / 2, s / 2, 44, 0, Math.PI * 2);
    g.stroke();
    g.globalAlpha = 0.45;
    g.lineWidth = 2;
    g.beginPath();
    g.arc(s / 2, s / 2, 30, 0, Math.PI * 2);
    g.stroke();
    return new THREE.CanvasTexture(c);
  }

  private buildStars() {
    const N = 900;
    const sp = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const r = 48 + Math.random() * 90;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      sp[i * 3] = r * Math.sin(ph) * Math.cos(th);
      sp[i * 3 + 1] = r * Math.cos(ph);
      sp[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({
      size: 1.5, color: 0x8fb4ff, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.scene.add(this.stars);
  }

  private buildRipples() {
    const tex = this.makeRingTexture();
    for (let i = 0; i < 14; i++) {
      const m = new THREE.SpriteMaterial({
        map: tex, transparent: true, opacity: 0, depthWrite: false,
        blending: THREE.AdditiveBlending, color: 0xffffff,
      });
      const s = new THREE.Sprite(m);
      s.visible = false;
      this.scene.add(s);
      this.ripples.push({ sprite: s, life: 0, base: 1 });
    }
  }

  private buildGlows() {
    const tex = this.makeGlowTexture();
    for (let h = 0; h < 2; h++) {
      const m = new THREE.SpriteMaterial({
        map: tex, transparent: true, opacity: 0, depthWrite: false,
        blending: THREE.AdditiveBlending, color: h === 0 ? 0x6ee7ff : 0xff5cf0,
      });
      const s = new THREE.Sprite(m);
      s.visible = false;
      this.scene.add(s);
      this.glows.push(s);
    }
  }

  private spawnRipple(pos: THREE.Vector3, color: number, base = 1) {
    const r = this.ripples.find((x) => x.life <= 0) ?? this.ripples[0];
    r.life = 1;
    r.base = base;
    r.sprite.visible = true;
    r.sprite.position.copy(pos);
    (r.sprite.material as THREE.SpriteMaterial).color.setHex(color);
  }

  /* ══════════ shapes ══════════ */
  private shapeSphere() {
    const R = 9.2, GA = Math.PI * (3 - Math.sqrt(5)), tgt = this.tgt;
    for (let i = 0; i < COUNT; i++) {
      const y = 1 - (i / (COUNT - 1)) * 2;
      const rad = Math.sqrt(Math.max(0, 1 - y * y));
      const th = GA * i;
      const rr = R * (0.97 + 0.06 * Math.random());
      tgt[i * 3] = Math.cos(th) * rad * rr;
      tgt[i * 3 + 1] = y * rr;
      tgt[i * 3 + 2] = Math.sin(th) * rad * rr;
    }
  }
  private shapeHeart() {
    const tgt = this.tgt;
    for (let i = 0; i < COUNT; i++) {
      const t = Math.random() * Math.PI * 2;
      const x = 16 * Math.pow(Math.sin(t), 3);
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      const f = Math.pow(Math.random(), 0.32), sc = 0.6 * f;
      tgt[i * 3] = x * sc;
      tgt[i * 3 + 1] = y * sc + 1.4;
      tgt[i * 3 + 2] = (Math.random() * 2 - 1) * 3.1 * (0.2 + 0.8 * f);
    }
  }
  private shapeSaturn() {
    const T = 0.45, cT = Math.cos(T), sT = Math.sin(T), tgt = this.tgt;
    for (let i = 0; i < COUNT; i++) {
      let x: number, y: number, z: number;
      if (i < COUNT * 0.55) {
        const ph = Math.acos(2 * Math.random() - 1);
        const th = Math.random() * Math.PI * 2;
        const r = 5 * (0.97 + 0.05 * Math.random());
        x = r * Math.sin(ph) * Math.cos(th); y = r * Math.cos(ph); z = r * Math.sin(ph) * Math.sin(th);
      } else {
        const b = Math.random();
        const r = b < 0.5 ? 6.6 + Math.random() * 1.5 : b < 0.86 ? 8.5 + Math.random() * 1.9 : 10.6 + Math.random() * 0.5;
        const a = Math.random() * Math.PI * 2;
        x = Math.cos(a) * r; z = Math.sin(a) * r; y = (Math.random() - 0.5) * 0.16;
      }
      tgt[i * 3] = x;
      tgt[i * 3 + 1] = y * cT - z * sT;
      tgt[i * 3 + 2] = y * sT + z * cT;
    }
  }
  private shapeFlower() {
    const K = 4, R = 10.2, tgt = this.tgt;
    for (let i = 0; i < COUNT; i++) {
      const t = Math.random() * Math.PI * 2;
      const petal = Math.pow(Math.abs(Math.cos(K * t)), 0.8);
      const rho = R * petal * Math.pow(Math.random(), 0.55);
      tgt[i * 3] = rho * Math.cos(t);
      tgt[i * 3 + 1] = rho * Math.sin(t);
      tgt[i * 3 + 2] = 3.2 * Math.pow(rho / R, 1.4) + 0.35 * Math.cos(t * 8) * (rho / R) + (Math.random() - 0.5) * 0.5;
    }
  }
  private shapeHelix() {
    const H = 18, R = 3.5, TURN = 2.8, TAU = Math.PI * 2, tgt = this.tgt;
    for (let i = 0; i < COUNT; i++) {
      const tt = Math.random(), ang = tt * TURN * TAU, y = (tt - 0.5) * H;
      if (Math.random() < 0.78) {
        const s = Math.random() < 0.5 ? 0 : Math.PI, j = 0.22;
        tgt[i * 3] = Math.cos(ang + s) * R + (Math.random() - 0.5) * j;
        tgt[i * 3 + 1] = y + (Math.random() - 0.5) * j;
        tgt[i * 3 + 2] = Math.sin(ang + s) * R + (Math.random() - 0.5) * j;
      } else {
        const m = 0.08 + Math.random() * 0.84, j = 0.06;
        const xA = Math.cos(ang) * R, zA = Math.sin(ang) * R;
        tgt[i * 3] = xA * (1 - 2 * m) + (Math.random() - 0.5) * j;
        tgt[i * 3 + 1] = y + (Math.random() - 0.5) * j;
        tgt[i * 3 + 2] = zA * (1 - 2 * m) + (Math.random() - 0.5) * j;
      }
    }
  }
  private shapeGalaxy() {
    const R = 12, ARMS = 5, tgt = this.tgt;
    for (let i = 0; i < COUNT; i++) {
      const arm = Math.floor(Math.random() * ARMS);
      const t = Math.pow(Math.random(), 0.6);
      const angle = t * Math.PI * 2.5 + (arm / ARMS) * Math.PI * 2;
      const r = t * R + (Math.random() - 0.5) * 1.2;
      const h = (Math.random() - 0.5) * 0.8 * (1 - t);
      tgt[i * 3] = Math.cos(angle) * r;
      tgt[i * 3 + 1] = h;
      tgt[i * 3 + 2] = Math.sin(angle) * r;
    }
  }

  setShape(i: number, silent = false) {
    this.curShape = ((i % SHAPES.length) + SHAPES.length) % SHAPES.length;
    this.shapeFns[this.curShape]();
    for (let j = 0; j < COUNT; j++) {
      this.vel[j * 3] += (Math.random() - 0.5) * 3.4;
      this.vel[j * 3 + 1] += (Math.random() - 0.5) * 3.4;
      this.vel[j * 3 + 2] += (Math.random() - 0.5) * 3.4;
    }
    this.lastMorphT = performance.now();
    if (!silent) this.hooks.onMorph(this.curShape, SHAPES[this.curShape].name);
    else this.hooks.onMorph(this.curShape, "");
  }

  /* ══════════ input ══════════ */
  private bindEvents() {
    const cv = this.renderer.domElement;
    cv.addEventListener("pointermove", this.onPointerMove);
    cv.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointerup", this.onPointerUp);
    cv.addEventListener("pointerleave", this.onPointerLeave);
    cv.addEventListener("dblclick", this.onDblClick);
    cv.addEventListener("wheel", this.onWheel, { passive: false });
    window.addEventListener("keydown", this.boundKeyDown);
    window.addEventListener("resize", this.boundResize);
  }

  private anyHand() { return this.handPresent[0] || this.handPresent[1]; }

  private screenToWorld(cx: number, cy: number, out: THREE.Vector3) {
    const nx = (cx / innerWidth) * 2 - 1;
    const ny = (cy / innerHeight) * 2 - 1;
    out.set(nx * this.viewHalfW, -ny * this.viewHalfH, 0);
  }

  private onPointerMove = (e: PointerEvent) => {
    const it = this.inter[0];
    this.screenToWorld(e.clientX, e.clientY, it.world);
    this.lastInputAt = performance.now();

    const dx = this.pointerSeeded ? e.clientX - this.lastPX : 0;
    const dy = this.pointerSeeded ? e.clientY - this.lastPY : 0;
    this.pointerSeeded = true;
    this.lastPX = e.clientX;
    this.lastPY = e.clientY;
    const dragging = e.buttons > 0;
    if (!(e.pointerType === "touch" && !dragging)) {
      this.rot.vy = clamp(this.rot.vy + dx * 0.02, -MAX_ROT_V, MAX_ROT_V);
      this.rot.vx = clamp(this.rot.vx + dy * 0.02, -MAX_ROT_V, MAX_ROT_V);
    }

    if (this.anyHand()) return;
    const isTouch = e.pointerType === "touch";
    it.gain = dragging || isTouch ? 0.7 : 0.55;
    it.mode = dragging || isTouch ? PINCH : SWIRL;
    it.heatT = dragging || isTouch ? 1 : 0.15;
    it.strength = dragging || isTouch ? 1 : 0.12;
  };

  private onPointerDown = (e: PointerEvent) => {
    this.userInteracted = true;
    this.lastPX = e.clientX;
    this.lastPY = e.clientY;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      const pts = [...this.pointers.values()];
      this.pinchDistPrev = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    }
    this.screenToWorld(e.clientX, e.clientY, this.inter[0].world);
    this.lastInputAt = performance.now();
    this.spawnRipple(this.inter[0].world, 0xffc24b, 0.7);
    if (this.anyHand()) return;
    const it = this.inter[0];
    it.mode = PINCH; it.gain = 0.7; it.heatT = 1; it.strength = 1;
  };

  private onPointerUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (!this.anyHand() && this.inter[0].mode === PINCH && this.pointers.size === 0) {
      this.inter[0].mode = NONE;
      this.inter[0].heatT = 0;
    }
  };

  private onPointerLeave = () => {
    if (!this.anyHand() && this.inter[0].mode !== NONE && this.pointers.size === 0) {
      this.inter[0].mode = NONE;
      this.inter[0].heatT = 0;
    }
  };

  private onDblClick = (e: MouseEvent) => {
    this.userInteracted = true;
    const p = new THREE.Vector3();
    this.screenToWorld(e.clientX, e.clientY, p);
    this.addWell(p);
    this.spawnRipple(p, 0xff5cf0, 1.25);
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.camDistT = clamp(this.camDistT + e.deltaY * 0.02, 16, 44);
    this.lastInputAt = performance.now();
  };

  private onKeyDown(e: KeyboardEvent) {
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= SHAPES.length) {
      this.userInteracted = true;
      this.setShape(n - 1);
    } else if (e.key === "ArrowRight") {
      this.userInteracted = true;
      this.setShape(this.curShape + 1);
    } else if (e.key === "ArrowLeft") {
      this.userInteracted = true;
      this.setShape(this.curShape - 1);
    }
  }

  /* ══════════ external control (vision / audio) ══════════ */
  setHand(h: number, nx: number, ny: number, pinch: boolean, strength: number) {
    const it = this.inter[h];
    this.handPresent[h] = true;
    it.world.set(nx * this.viewHalfW * 0.94, ny * this.viewHalfH * 0.94, 0);
    it.strength = strength;
    it.gain = 1;
    if (pinch) { it.mode = PINCH; it.heatT = 1; }
    else { it.mode = SWIRL; it.heatT = 0.3; }
    if (pinch && !it.pinchPrev) this.spawnRipple(it.world, 0xffc24b, 1);
    it.pinchPrev = pinch;
    this.userInteracted = true;
    this.lastInputAt = performance.now();
  }

  clearHand(h: number) {
    this.handPresent[h] = false;
    const it = this.inter[h];
    it.mode = NONE;
    it.heatT = 0;
    it.pinchPrev = false;
  }

  nudgeRot(dpx: number, dpy: number) {
    this.rot.vy = clamp(this.rot.vy + dpx * HAND_ROT_GAIN * 0.5, -MAX_ROT_V, MAX_ROT_V);
    this.rot.vx = clamp(this.rot.vx - dpy * HAND_ROT_GAIN * 0.42, -MAX_ROT_V, MAX_ROT_V);
    this.lastInputAt = performance.now();
  }

  setAudio(l: { bass: number; mid: number; treble: number; beat: number }) {
    this.audio = l;
  }

  addWell(worldPos: THREE.Vector3) {
    if (this.wells.length >= MAX_WELLS) this.wells.shift();
    this.group.updateMatrixWorld();
    this.wells.push({
      pos: this.group.worldToLocal(worldPos.clone()),
      strength: 1,
      decay: 0.4,
    });
  }

  capture() {
    try {
      const a = document.createElement("a");
      a.download = `nebula-hands-${Date.now()}.png`;
      a.href = this.renderer.domElement.toDataURL("image/png");
      a.click();
    } catch {
      /* capture unavailable */
    }
  }

  private onResize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(this.dpr());
    this.mat.uniforms.uPixelRatio.value = this.dpr();
  }

  /* ══════════ main loop ══════════ */
  private loop(now: number) {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame((n) => this.loop(n));
    const dt = clamp((now - this.last) / 1000, 0.001, 0.033);
    this.last = now;
    const t = now * 0.001;
    const { pos, vel, tgt } = this;

    /* camera */
    this.camDist += (this.camDistT - this.camDist) * (1 - Math.exp(-6 * dt));
    const idle = clamp((now - this.lastInputAt) / 1800, 0, 1);
    this.camera.position.z = this.camDist + idle * Math.sin(t * 0.32) * 1.4;
    this.viewHalfH = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.position.z;
    this.viewHalfW = this.viewHalfH * this.camera.aspect;

    /* wells */
    for (let i = this.wells.length - 1; i >= 0; i--) {
      this.wells[i].strength *= Math.exp(-this.wells[i].decay * dt);
      if (this.wells[i].strength < 0.05) this.wells.splice(i, 1);
    }

    /* interaction heat */
    let maxHeat = 0, maxStrength = 0, anyPinch = false;
    for (let h = 0; h < 2; h++) {
      const it = this.inter[h];
      const rate = it.heatT > it.heat ? 5.5 : 1.7;
      it.heat += (it.heatT - it.heat) * (1 - Math.exp(-rate * dt));
      if (!this.handPresent[h] && it.mode === NONE) it.strength *= Math.exp(-4 * dt);
      if (it.heat > maxHeat) maxHeat = it.heat;
      if (it.strength > maxStrength) maxStrength = it.strength;
      if (it.mode === PINCH) anyPinch = true;
    }

    const audioHeat = this.audio.bass * 0.5 + this.audio.beat * 0.3;
    this.mat.uniforms.uTime.value = t;
    this.mat.uniforms.uHeat.value = Math.min(1, maxHeat + audioHeat);
    this.mat.uniforms.uSize.value = 2.9 * (1 + maxHeat * 0.35);
    this.mat.uniforms.uBass.value = this.audio.bass;
    this.mat.uniforms.uTreble.value = this.audio.treble;

    /* rotation */
    const decay = Math.exp(-3.2 * dt);
    this.rot.vx *= decay;
    this.rot.vy *= decay;
    this.group.rotation.y += this.rot.vy * dt + 0.1 * idle * dt;
    this.group.rotation.x = clamp(this.group.rotation.x + this.rot.vx * dt, -1.15, 1.15);
    this.group.rotation.x += (0 - this.group.rotation.x) * idle * dt * 0.15;
    this.group.updateMatrixWorld();
    this.stars.rotation.y += dt * 0.008;

    /* attractor glows */
    for (let h = 0; h < 2; h++) {
      const it = this.inter[h];
      const g = this.glows[h];
      const gm = g.material as THREE.SpriteMaterial;
      const active = it.mode !== NONE;
      const targetOp = active ? 0.5 + it.strength * 0.45 + this.audio.bass * 0.2 : 0;
      gm.opacity += (Math.min(1, targetOp) - gm.opacity) * (1 - Math.exp(-10 * dt));
      g.visible = gm.opacity > 0.02;
      g.position.copy(it.world);
      const sc = 2.4 + it.strength * 3 + this.audio.bass * 1.8 + it.heat * 1.2;
      g.scale.setScalar(sc);
      gm.color.setHex(it.mode === PINCH ? 0xffc24b : h === 0 ? 0x6ee7ff : 0xff5cf0);
    }

    /* ripples */
    for (const r of this.ripples) {
      if (r.life <= 0) { r.sprite.visible = false; continue; }
      r.life -= dt * 1.5;
      const m = r.sprite.material as THREE.SpriteMaterial;
      const s = r.base * (1.2 + (1 - r.life) * 15);
      r.sprite.scale.setScalar(s);
      m.opacity = Math.pow(Math.max(0, r.life), 1.6) * 0.85;
      if (r.life <= 0) r.sprite.visible = false;
    }

    /* forces */
    const hasForce = [this.inter[0].mode !== NONE, this.inter[1].mode !== NONE];
    const localPos = [this.inter[0].local, this.inter[1].local];
    if (hasForce[0]) this.group.worldToLocal(localPos[0].copy(this.inter[0].world));
    if (hasForce[1]) this.group.worldToLocal(localPos[1].copy(this.inter[1].world));

    const mode = [this.inter[0].mode, this.inter[1].mode];
    const gain = [this.inter[0].gain, this.inter[1].gain];
    const strength = [this.inter[0].strength, this.inter[1].strength];
    const hasAnyForce = hasForce[0] || hasForce[1] || this.wells.length > 0;
    const springK = SPRING * (anyPinch ? 0.1 : hasAnyForce ? 0.55 : 1);
    const dampF = Math.exp(-(anyPinch ? 6.2 : 4.0) * dt);
    const wells = this.wells;
    const audioOn = this.audio.bass > 0.001 || this.audio.beat > 0.001;
    const turb = audioOn ? this.audio.bass * 8 + this.audio.beat * 20 : 0;

    for (let i = 0; i < COUNT; i++) {
      const j = i * 3, sv = this.springVar[i];
      let ax = (tgt[j] - pos[j]) * springK * sv;
      let ay = (tgt[j + 1] - pos[j + 1]) * springK * sv;
      let az = (tgt[j + 2] - pos[j + 2]) * springK * sv;

      if (turb > 0) {
        ax += (Math.random() - 0.5) * turb * sv;
        ay += (Math.random() - 0.5) * turb * sv;
        az += (Math.random() - 0.5) * turb * sv;
      }

      for (let h = 0; h < 2; h++) {
        if (!hasForce[h]) continue;
        const lx = localPos[h].x, ly = localPos[h].y, lz = localPos[h].z;
        if (mode[h] === PINCH) {
          const dx = lx - pos[j], dy = ly - pos[j + 1], dz = lz - pos[j + 2];
          const d2 = dx * dx + dy * dy + dz * dz + 0.35;
          let f = (300 * gain[h]) / d2;
          if (f > 170) f = 170;
          ax += dx * f; ay += dy * f; az += dz * f;
          const w = (26 * gain[h]) / (d2 + 1.6);
          ax += dz * w; az -= dx * w;
        } else {
          const dx = pos[j] - lx, dy = pos[j + 1] - ly, dz = pos[j + 2] - lz;
          const d2 = dx * dx + dy * dy + dz * dz + 0.6;
          const f = (70 * gain[h]) / d2;
          ax += dx * f; ay += dy * f; az += dz * f;
          const c = (42 * gain[h]) / (d2 + 2.0);
          ax += dz * c; az -= dx * c;
        }
      }

      for (let wi = 0; wi < wells.length; wi++) {
        const well = wells[wi];
        const dx = well.pos.x - pos[j], dy = well.pos.y - pos[j + 1], dz = well.pos.z - pos[j + 2];
        const d2 = dx * dx + dy * dy + dz * dz + 0.5;
        const f = (180 * well.strength) / d2;
        ax += dx * f; ay += dy * f; az += dz * f;
      }

      let vx = (vel[j] + ax * dt) * dampF;
      let vy = (vel[j + 1] + ay * dt) * dampF;
      let vz = (vel[j + 2] + az * dt) * dampF;
      const v2 = vx * vx + vy * vy + vz * vz;
      if (v2 > VMAX * VMAX) {
        const s = VMAX / Math.sqrt(v2);
        vx *= s; vy *= s; vz *= s;
      }
      vel[j] = vx; vel[j + 1] = vy; vel[j + 2] = vz;
      pos[j] += vx * dt;
      pos[j + 1] += vy * dt;
      pos[j + 2] += vz * dt;
    }
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;

    this.hooks.onPinch(maxStrength, anyPinch);

    /* autopilot */
    if (!this.userInteracted && now - this.lastMorphT > 9000) {
      this.setShape(this.curShape + 1);
    }

    this.renderer.render(this.scene, this.camera);

    /* telemetry */
    this.fpsFrames++;
    if (now - this.fpsTime >= 500) {
      const fps = Math.round((this.fpsFrames * 1000) / (now - this.fpsTime));
      this.fpsFrames = 0;
      this.fpsTime = now;
      this.hooks.onTelemetry({
        fps,
        heat: this.mat.uniforms.uHeat.value as number,
        zoom: this.camDist,
        wells: this.wells.length,
      });
    }
  }
}

/* ══════════ shaders ══════════ */
const VERT = /* glsl */ `
attribute float aScale;
attribute float aSeed;
uniform float uTime, uSize, uPixelRatio, uBass, uTreble;
varying float vSeed;
varying float vAudio;
void main(){
  vSeed = aSeed;
  vAudio = 0.5 + uBass * 0.6 + uTreble * 0.4;
  vec4 mv = modelViewMatrix * vec4(position,1.0);
  float tw = 0.82 + 0.36*sin(uTime*(1.2+fract(aSeed*13.7)*2.4)+aSeed*44.0);
  float audioBoost = 1.0 + uBass * 0.5;
  gl_PointSize = uSize * aScale * tw * audioBoost * uPixelRatio * (150.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uTime, uHeat, uBass, uTreble;
varying float vSeed;
varying float vAudio;
vec3 hsl2rgb(vec3 c){
  vec3 rgb = clamp(abs(mod(c.x*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0);
  return c.z + c.y*(rgb-0.5)*(1.0-abs(2.0*c.z-1.0));
}
void main(){
  vec4 tex = texture2D(uMap, gl_PointCoord);
  if(tex.a < 0.02) discard;
  float s1 = fract(vSeed*7.31);
  float s2 = fract(vSeed*3.17);
  float hC = fract(0.52 + 0.31*s1 + 0.04*sin(uTime*0.5 + vSeed*6.2831));
  vec3 cool = hsl2rgb(vec3(hC, 0.92, 0.5 + 0.24*s2));
  vec3 hot  = hsl2rgb(vec3(0.015 + 0.115*s1, 0.95, 0.55 + 0.22*s2));
  float h = clamp(uHeat*(0.6 + 0.8*s2), 0.0, 1.0);
  vec3 col = mix(cool, hot, h);
  col += vec3(uTreble * 0.3, uBass * 0.2, uTreble * 0.25) * vAudio;
  col += vec3(1.0,0.97,0.9) * pow(h,3.0) * 0.55 * tex.a;
  gl_FragColor = vec4(col*tex.a, tex.a);
}`;
