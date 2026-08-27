import { useEffect, useRef, useState } from "react";
import { NebulaEngine, SHAPES, type Telemetry } from "./engine/engine";
import { Vision, type VisionState } from "./engine/vision";
import { AudioEngine, type AudioMode } from "./engine/audio";
import {
  SphereIcon, HeartIcon, SaturnIcon, FlowerIcon, HelixIcon, GalaxyIcon,
  MicIcon, NoteIcon, WaveIcon, CaptureIcon, HandIcon, SignalOffIcon, OrbitLogo,
} from "./components/Icons";

const SHAPE_ICONS = [SphereIcon, HeartIcon, SaturnIcon, FlowerIcon, HelixIcon, GalaxyIcon];

type StatusKind = "" | "link" | "track" | "err" | "audio";

const visionStatus = (s: VisionState): { text: string; kind: StatusKind } => {
  if (s === "connecting") return { text: "LINKING VISION CORE", kind: "link" };
  if (s === "live") return { text: "TRACKING · DUAL HAND", kind: "track" };
  return { text: "CAMERA OFFLINE · MOUSE MODE", kind: "err" };
};

export default function App() {
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const vizRef = useRef<HTMLCanvasElement>(null);
  const pinchFillRef = useRef<HTMLDivElement>(null);
  const bassFillRef = useRef<HTMLDivElement>(null);
  const midFillRef = useRef<HTMLDivElement>(null);
  const trebleFillRef = useRef<HTMLDivElement>(null);
  const reticleRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const engineRef = useRef<NebulaEngine | null>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  const visionRef = useRef<Vision | null>(null);
  const camStateRef = useRef<VisionState>("connecting");
  const bootedRef = useRef(false);

  const [bootStep, setBootStep] = useState("igniting webgl core");
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<{ text: string; kind: StatusKind }>({
    text: "INITIALIZING UNIVERSE",
    kind: "",
  });
  const [shapeIdx, setShapeIdx] = useState(0);
  const [shapeName, setShapeName] = useState("");
  const [flashKey, setFlashKey] = useState(0);
  const [tele, setTele] = useState<Telemetry>({ fps: 0, heat: 0, zoom: 27, wells: 0 });
  const [camState, setCamState] = useState<VisionState>("connecting");
  const [audioMode, setAudioMode] = useState<AudioMode>(null);
  const [handActive, setHandActive] = useState(false);

  useEffect(() => {
    if (bootedRef.current || !stageRef.current) return;
    bootedRef.current = true;

    const engine = new NebulaEngine(stageRef.current, {
      onBoot: setBootStep,
      onReady: () => setReady(true),
      onMorph: (i, name) => {
        setShapeIdx(i);
        if (name) {
          setShapeName(name);
          setFlashKey((k) => k + 1);
        }
      },
      onTelemetry: setTele,
      onPinch: (s, any) => {
        if (pinchFillRef.current) pinchFillRef.current.style.transform = `scaleX(${s.toFixed(3)})`;
        document.body.dataset.pinch = any ? "1" : "0";
      },
    });
    engineRef.current = engine;
    engine.init();

    const audio = new AudioEngine(
      vizRef.current!,
      (l) => {
        engine.setAudio(l);
        if (bassFillRef.current) bassFillRef.current.style.transform = `scaleX(${l.bass.toFixed(3)})`;
        if (midFillRef.current) midFillRef.current.style.transform = `scaleX(${l.mid.toFixed(3)})`;
        if (trebleFillRef.current) trebleFillRef.current.style.transform = `scaleX(${l.treble.toFixed(3)})`;
      },
      (mode, label) => {
        setAudioMode(mode);
        if (mode) setStatus({ text: label, kind: "audio" });
        else setStatus(visionStatus(camStateRef.current));
      },
    );
    audioRef.current = audio;

    const vision = new Vision(
      videoRef.current!,
      overlayRef.current!,
      engine,
      (s) => {
        camStateRef.current = s;
        setCamState(s);
        setStatus((prev) => (prev.kind === "audio" ? prev : visionStatus(s)));
      },
      setHandActive,
    );
    visionRef.current = vision;
    vision.start();

    const onMove = (e: PointerEvent) => {
      if (reticleRef.current) {
        reticleRef.current.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      }
    };
    const onDown = () => reticleRef.current?.classList.add("down");
    const onUp = () => reticleRef.current?.classList.remove("down");
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      vision.dispose();
      audio.dispose();
      engine.dispose();
    };
  }, []);

  const pickShape = (i: number) => engineRef.current?.setShape(i);

  const toggleAudio = (mode: Exclude<AudioMode, null>) => {
    const a = audioRef.current;
    if (!a) return;
    if (audioMode === mode) {
      a.stop();
      return;
    }
    if (mode === "mic") a.startMic().catch(() => setStatus({ text: "MIC UNAVAILABLE", kind: "err" }));
    else if (mode === "demo") a.startDemo();
    else fileRef.current?.click();
  };

  const fpsClass = tele.fps >= 50 ? "good" : tele.fps >= 30 ? "warn" : "bad";

  return (
    <div className="relative h-full">
      {/* layers */}
      <div ref={stageRef} className="stage" />
      <div className="nebula-wash" />
      <div className="vignette" />
      <div className="grain" />
      <div className="corner tl" />
      <div className="corner tr" />
      <div className="corner bl" />
      <div className="corner br" />

      {/* brand */}
      <header className="hud brand">
        <h1>
          NEBULA <em>HANDS</em>
          <sup>2.0</sup>
        </h1>
        <div className="tagline">
          <b>25,000</b> particles · audio-reactive · dual-hand tracking
        </div>
        <div className="brand-row">
          <div className="status-chip" data-kind={status.kind}>
            <span className="dot" />
            <span>{status.text}</span>
          </div>
          <button className="ghost-btn" onClick={() => engineRef.current?.capture()} title="Save frame as PNG">
            <CaptureIcon /> Capture
          </button>
        </div>
      </header>

      {/* hints */}
      <aside className="hud hints">
        {[
          ["PINCH", "black hole"],
          ["OPEN PALM", "vortex"],
          ["TWO HANDS", "dual control"],
          ["CLICK + DRAG", "gravity pull"],
          ["DBL CLICK", "gravity well"],
          ["1 – 6 / ← →", "morph shape"],
          ["SCROLL", "zoom"],
        ].map(([k, d]) => (
          <div className="hint-row" key={k}>
            <span className="hint-desc">{d}</span>
            <span className="kbd">{k}</span>
          </div>
        ))}
      </aside>

      {/* audio panel */}
      <section className="hud audio-panel panel">
        <span className="tick tl" />
        <span className="tick br" />
        <div className="panel-head">
          <span className={`led ${audioMode ? "live" : ""}`} />
          <WaveIcon />
          <span className="hud-label">Audio Reactivity</span>
        </div>
        <div className="audio-btns">
          <button className={`audio-btn ${audioMode === "mic" ? "active" : ""}`} onClick={() => toggleAudio("mic")}>
            <MicIcon /> MIC
          </button>
          <button className={`audio-btn ${audioMode === "file" ? "active" : ""}`} onClick={() => toggleAudio("file")}>
            <NoteIcon /> FILE
          </button>
          <button className={`audio-btn ${audioMode === "demo" ? "active" : ""}`} onClick={() => toggleAudio("demo")}>
            <WaveIcon /> DEMO
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) audioRef.current?.startFile(f).catch(() => setStatus({ text: "DECODE FAILED", kind: "err" }));
              e.target.value = "";
            }}
          />
        </div>
        <canvas ref={vizRef} className="audio-viz" />
        <div className="audio-meters">
          <div className="meter bass">
            <div className="m-label"><span>BASS</span><span>▾</span></div>
            <div className="m-track"><div className="m-fill" ref={bassFillRef} /></div>
          </div>
          <div className="meter mid">
            <div className="m-label"><span>MID</span><span>▾</span></div>
            <div className="m-track"><div className="m-fill" ref={midFillRef} /></div>
          </div>
          <div className="meter treble">
            <div className="m-label"><span>TREBLE</span><span>▾</span></div>
            <div className="m-track"><div className="m-fill" ref={trebleFillRef} /></div>
          </div>
        </div>
      </section>

      {/* shape dock */}
      <nav className="hud dock" aria-label="shape morph">
        {SHAPES.map((s, i) => {
          const Icon = SHAPE_ICONS[i];
          return (
            <button
              key={s.name}
              className={`shape-btn ${shapeIdx === i ? "active" : ""}`}
              onClick={() => pickShape(i)}
              aria-label={`morph to ${s.name}`}
            >
              <span className="key">{i + 1}</span>
              <Icon />
              <span className="name">{s.name}</span>
            </button>
          );
        })}
      </nav>

      {/* camera panel */}
      <section className={`hud cam-panel panel ${camState === "live" ? "live" : ""} ${camState === "dead" ? "dead" : ""}`}>
        <span className="tick tl" />
        <span className="tick br" />
        <div className="panel-head">
          <span className={`led ${camState === "live" ? "mint" : camState === "dead" ? "gold" : ""}`} />
          <HandIcon />
          <span className="hud-label">Vision Feed · Dual Hand</span>
        </div>
        <div className="cam-wrap">
          <video ref={videoRef} autoPlay muted playsInline />
          <canvas ref={overlayRef} />
          <div className="scanlines" />
          <div className="scanbeam" />
          <div className="rec"><i />REC</div>
          <div className="no-signal">
            <SignalOffIcon />
            NO SIGNAL
            <small>MOUSE CONTROL ENGAGED</small>
          </div>
        </div>
        <div className="pinch-row">
          <span className="hud-label">Pinch</span>
          <div className="pinch-bar">
            <div className="pinch-fill" ref={pinchFillRef} />
          </div>
        </div>
      </section>

      {/* telemetry */}
      <footer className="hud telemetry">
        <div className="t-item">
          <span style={{ color: "var(--cyan)", display: "inline-flex" }}>
            <OrbitLogo className="w-3.5 h-3.5" />
          </span>
          <span className={`t-val ${fpsClass}`}>{tele.fps || "—"}</span> FPS
        </div>
        <div className="sep" />
        <div className="t-item">
          <span className="t-val">25,000</span> PTS
        </div>
        <div className="sep" />
        <div className="t-item">
          HEAT
          <span className="heat-track">
            <span className="heat-fill" style={{ transform: `scaleX(${Math.min(1, tele.heat)})` }} />
          </span>
        </div>
        <div className="sep" />
        <div className="t-item">
          ZOOM <span className="t-val">{tele.zoom.toFixed(0)}</span>
        </div>
        <div className="sep" />
        <div className="t-item">
          WELLS <span className="t-val">{tele.wells}</span>
        </div>
      </footer>

      {/* morph flash */}
      <div key={flashKey} className={`morph-flash ${flashKey > 0 ? "go" : ""}`}>
        <span className="rule" />
        <span className="label">MORPH ▸ {shapeName || SHAPES[shapeIdx].name}</span>
        <span className="rule r" />
        <span className="sub">restructuring particle lattice</span>
      </div>

      {/* reticle */}
      <div ref={reticleRef} className={`reticle ${ready && !handActive ? "on" : ""}`}>
        <span className="ring" />
        <span className="core" />
      </div>

      {/* loader */}
      <div className={`loader ${ready ? "done" : ""}`}>
        <div className="orbit-stage">
          <span className="ring" />
          <span className="ring r2" />
          <span className="orb" />
        </div>
        <div className="loader-title">Nebula Hands</div>
        <div className="loader-sub">{bootStep}</div>
      </div>
    </div>
  );
}
