import type { NebulaEngine } from "./engine";

declare global {
  interface Window {
    Hands: any;
  }
}

export type VisionState = "connecting" | "live" | "dead";

const MP_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/";

const CONN: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10],
  [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18],
  [18, 19], [19, 20], [0, 17],
];

const HAND_COLORS = [
  ["rgba(110,231,255,.92)", "#ff5cf0", "#ffc24b"],
  ["rgba(255,92,240,.92)", "#54ffb0", "#ff6b35"],
];

function loadScript(src: string) {
  return new Promise<void>((res, rej) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => res();
    s.onerror = () => rej(new Error("script failed: " + src));
    document.head.appendChild(s);
  });
}

export class Vision {
  private video: HTMLVideoElement;
  private overlay: HTMLCanvasElement;
  private engine: NebulaEngine;
  private onState: (s: VisionState) => void;
  private onHandActive: (active: boolean) => void;
  private octx: CanvasRenderingContext2D;
  private PW = 232;
  private PH = 168;
  private hands: any = null;
  private stopped = false;
  private prev: { x: number; y: number; has: boolean }[] = [
    { x: 0, y: 0, has: false },
    { x: 0, y: 0, has: false },
  ];
  private pinch: [boolean, boolean] = [false, false];

  constructor(
    video: HTMLVideoElement,
    overlay: HTMLCanvasElement,
    engine: NebulaEngine,
    onState: (s: VisionState) => void,
    onHandActive: (active: boolean) => void,
  ) {
    this.video = video;
    this.overlay = overlay;
    this.engine = engine;
    this.onState = onState;
    this.onHandActive = onHandActive;
    overlay.width = this.PW * 2;
    overlay.height = this.PH * 2;
    this.octx = overlay.getContext("2d")!;
    this.octx.setTransform(2, 0, 0, 2, 0, 0);
  }

  async start() {
    this.onState("connecting");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("mediaDevices unavailable");
      await loadScript(MP_BASE + "hands.min.js");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        audio: false,
      });
      this.video.srcObject = stream;
      await this.video.play();
      this.hands = new window.Hands({ locateFile: (f: string) => MP_BASE + f });
      this.hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.55,
        minTrackingConfidence: 0.5,
      });
      this.hands.onResults((r: any) => this.onResults(r));
      this.onState("live");
      const pump = async () => {
        if (this.stopped) return;
        if (!document.hidden && this.video.readyState >= 2) {
          try { await this.hands.send({ image: this.video }); } catch { /* frame skip */ }
        }
        setTimeout(pump, 25);
      };
      pump();
    } catch (err) {
      console.warn("[vision fallback]", err);
      this.onState("dead");
    }
  }

  dispose() {
    this.stopped = true;
    try {
      const s = this.video.srcObject as MediaStream | null;
      s?.getTracks().forEach((tr) => tr.stop());
    } catch { /* noop */ }
  }

  private onResults(res: any) {
    const ctx = this.octx;
    ctx.clearRect(0, 0, this.PW, this.PH);
    const lmsArr: any[] | undefined = res.multiHandLandmarks;
    const numHands = lmsArr ? Math.min(lmsArr.length, 2) : 0;

    for (let h = 0; h < 2; h++) {
      if (h < numHands) {
        const lm = lmsArr![h];
        const t = lm[4], ix = lm[8], palm = lm[9];
        const nx = (1 - (t.x + ix.x) / 2 - 0.5) * 2;
        const ny = (0.5 - (t.y + ix.y) / 2) * 2;
        const d = Math.hypot(t.x - ix.x, t.y - ix.y);

        if (!this.pinch[h] && d < 0.06) this.pinch[h] = true;
        else if (this.pinch[h] && d > 0.078) this.pinch[h] = false;
        const strength = Math.max(0, Math.min(1, (0.13 - d) / 0.09));

        this.engine.setHand(h, nx, ny, this.pinch[h], strength);

        const pmx = 1 - palm.x;
        const pmy = palm.y;
        if (this.prev[h].has) {
          this.engine.nudgeRot(pmx - this.prev[h].x, pmy - this.prev[h].y);
        }
        this.prev[h] = { x: pmx, y: pmy, has: true };
        this.drawHand(lm, h);
      } else {
        this.engine.clearHand(h);
        this.pinch[h] = false;
        this.prev[h].has = false;
      }
    }
    this.onHandActive(numHands > 0);
  }

  private drawHand(lms: any[], idx: number) {
    const ctx = this.octx;
    const PW = this.PW, PH = this.PH;
    const colors = HAND_COLORS[idx];
    ctx.lineCap = "round";

    ctx.lineWidth = 2;
    ctx.strokeStyle = colors[0];
    ctx.shadowColor = colors[0];
    ctx.shadowBlur = 6;
    ctx.beginPath();
    for (const [a, b] of CONN) {
      ctx.moveTo(lms[a].x * PW, lms[a].y * PH);
      ctx.lineTo(lms[b].x * PW, lms[b].y * PH);
    }
    ctx.stroke();

    ctx.fillStyle = colors[1];
    ctx.shadowColor = colors[1];
    ctx.shadowBlur = 8;
    for (let i = 0; i < 21; i++) {
      ctx.beginPath();
      ctx.arc(lms[i].x * PW, lms[i].y * PH, i === 4 || i === 8 ? 4 : 2.3, 0, 6.2832);
      ctx.fill();
    }

    const t = lms[4], ix = lms[8];
    ctx.beginPath();
    ctx.moveTo(t.x * PW, t.y * PH);
    ctx.lineTo(ix.x * PW, ix.y * PH);
    if (this.pinch[idx]) {
      ctx.strokeStyle = colors[2];
      ctx.shadowColor = colors[2];
      ctx.lineWidth = 3;
      ctx.setLineDash([]);
    } else {
      ctx.strokeStyle = "rgba(255,255,255,.35)";
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 4]);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    if (this.pinch[idx]) {
      ctx.fillStyle = colors[2];
      ctx.beginPath();
      ctx.arc(((t.x + ix.x) / 2) * PW, ((t.y + ix.y) / 2) * PH, 6, 0, 6.2832);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }
}
