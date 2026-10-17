/**
 * DrivingSfx：驾车音效——Web Audio 程序化合成，零音频资产，模式对齐飞行版
 * GameSfx。引擎声 = 锯齿（发动机粗糙感）+ 正弦副低频（sub-bass 体感），音高/
 * 音量随 |speed|/maxSpeed 连续映射；怠速地板 42Hz 保证零速不静音（Three.js-
 * City 的做法在 speed=0 时音频归零，是已知缺陷，此处显式规避）。LFO ±2Hz/8Hz
 * 制造有机怠速颤动。刹车 = 滤波白噪声短包层；倒车 = 音高整体下移 20% +
 * 800Hz 间歇蜂鸣（250ms 开/关）；碰撞 = 滤波噪声爆发 + 低频正弦闷击，
 * 150ms 衰减。AudioContext 惰性创建、自持有（dispose 关闭）；AudioContext
 * 不可用（Node/测试桩）时静默降级，绝不抛错。
 */

const MASTER_GAIN = 0.5;
/** 怠速地板（Hz）：零速时引擎仍在转，杜绝 speed=0 静音缺陷。 */
const IDLE_FLOOR = 42;
/** 满速音高（Hz）。 */
const MAX_PITCH = 180;
/** 怠速音量（0-1）：安静但不缺席。 */
const IDLE_VOLUME = 0.06;
/** 满速音量（0-1）。 */
const MAX_VOLUME = 0.4;
/** 倒车时的整体音高下移系数（-20%）。 */
const REVERSE_PITCH_FACTOR = 0.8;
/** 倒车蜂鸣频率（Hz）与节奏（250ms 开 / 250ms 关）。 */
const REVERSE_BEEP_HZ = 800;
const REVERSE_BEEP_PERIOD = 0.5;
const REVERSE_BEEP_DURATION = 0.25;
/** LFO 有机颤动：8Hz、±2Hz。 */
const LFO_HZ = 8;
const LFO_DEPTH_HZ = 2;
/** 刹车噪声层有效所需的最小车速（世界单位/秒）。 */
const BRAKE_MIN_SPEED = 0.5;

// NaN 收敛到 0（怠速），±∞ 按方向收敛到边界（∞ 速 → 满挡，绝不除零/NaN 传播）。
const clamp01 = (v: number) => (Number.isNaN(v) ? 0 : v > 1 ? 1 : v < 0 ? 0 : v);

/** 纯函数：引擎音高映射 idleFloor + (maxPitch - idleFloor) * |speed| / maxSpeed。
 *  供 verify 脚本直接断言（NaN/∞ 极端值安全收敛到边界）。 */
export function engineFrequency(speed: number, maxSpeed: number): number {
  const ratio = clamp01(Math.abs(speed) / Math.max(Math.abs(maxSpeed), 1e-6));
  return IDLE_FLOOR + (MAX_PITCH - IDLE_FLOOR) * ratio;
}

/** 纯函数：引擎音量随 |speed|/maxSpeed 从安静怠速升到满速（零速不静音）。 */
export function engineVolume(speed: number, maxSpeed: number): number {
  const ratio = clamp01(Math.abs(speed) / Math.max(Math.abs(maxSpeed), 1e-6));
  return IDLE_VOLUME + (MAX_VOLUME - IDLE_VOLUME) * ratio;
}

/** 每帧由运行时喂给的行车状态（maxSpeed 用 DRIVING_PARAMS.maxForward）。 */
export type DrivingSfxTelemetry = Readonly<{
  /** 有符号车速（世界单位/秒）。 */
  speed: number;
  /** 归一化分母（调用方传 DRIVING_PARAMS.maxForward）。 */
  maxSpeed: number;
  braking: boolean;
  reversing: boolean;
}>;

type EngineNodes = {
  master: GainNode;
  engineOsc: OscillatorNode;
  engineFilter: BiquadFilterNode;
  subOsc: OscillatorNode;
  subGain: GainNode;
  engineGain: GainNode;
  lfo: OscillatorNode;
  lfoDepth: GainNode;
  brakeGain: GainNode;
  noise: AudioBuffer;
};

export class DrivingSfx {
  private ctx: AudioContext | null = null;
  private nodes: EngineNodes | null = null;
  private muted = false;
  private disposed = false;
  /** 下次倒车蜂鸣的上下文时刻（0 = 待重整）。 */
  private nextReverseBeepAt = 0;

  constructor() {
    this.ensureGraph();  // AudioContext 不可用时静默降级（保持惰性：不抛错、不占资源）
  }

  /** 惰性建图（幂等）：构造与 update 各自兜底，覆盖宿主延迟暴露 AudioContext 的情况。 */
  private ensureGraph(): void {
    if (this.disposed || this.nodes) return;
    if (typeof AudioContext === "undefined") return;
    let ctx: AudioContext;
    try {
      ctx = new AudioContext();
    } catch {
      return;  // 静默降级：音效缺席绝不打断驾驶
    }
    this.ctx = ctx;
    this.nodes = this.build(ctx);
  }

  get isMuted(): boolean {
    return this.muted;
  }

  private gainTarget(): number {
    return this.muted ? 0 : MASTER_GAIN;
  }

  private applyMasterGain(tau: number): void {
    if (this.ctx && this.nodes) {
      this.nodes.master.gain.setTargetAtTime(this.gainTarget(), this.ctx.currentTime, tau);
    }
  }

  setMuted(value: boolean): void {
    this.muted = value;
    this.applyMasterGain(0.02);
  }

  /** 每帧驱动连续声部：引擎音高/音量、刹车噪声层、倒车蜂鸣调度。 */
  update(telemetry: DrivingSfxTelemetry): void {
    this.ensureGraph();
    const ctx = this.ctx;
    const nodes = this.nodes;
    if (!ctx || !nodes || this.disposed) return;
    const t = ctx.currentTime;

    // 引擎音高：连续映射 + 倒车整体下移 20%（setTargetAtTime 完成参数平滑）。
    let freq = engineFrequency(telemetry.speed, telemetry.maxSpeed);
    if (telemetry.reversing) freq *= REVERSE_PITCH_FACTOR;
    nodes.engineOsc.frequency.setTargetAtTime(freq, t, 0.08);
    nodes.subOsc.frequency.setTargetAtTime(freq / 2, t, 0.08);
    // 音量：怠速安静、满速更响（零速不静音）。
    nodes.engineGain.gain.setTargetAtTime(engineVolume(telemetry.speed, telemetry.maxSpeed), t, 0.1);

    // 刹车：滤波白噪声层，短包层起落（静止时刹车不嘶鸣）。
    const brakingHard = telemetry.braking && Math.abs(telemetry.speed) > BRAKE_MIN_SPEED;
    nodes.brakeGain.gain.setTargetAtTime(brakingHard ? 0.22 : 0, t, brakingHard ? 0.03 : 0.08);

    // 倒车蜂鸣：800Hz、250ms 开 / 250ms 关；离开倒车即重整。
    if (telemetry.reversing) {
      if (this.nextReverseBeepAt === 0) this.nextReverseBeepAt = t;
      if (t >= this.nextReverseBeepAt) {
        this.nextReverseBeepAt = t + REVERSE_BEEP_PERIOD;
        this.tone(REVERSE_BEEP_HZ, 0, REVERSE_BEEP_DURATION, 0.12);
      }
    } else if (this.nextReverseBeepAt !== 0) {
      this.nextReverseBeepAt = 0;
    }
  }

  /** 碰撞一次性音：滤波噪声爆发 + 低频正弦闷击，150ms 衰减。 */
  collision(): void {
    this.ensureGraph();
    const ctx = this.ctx;
    const nodes = this.nodes;
    if (!ctx || !nodes || this.disposed) return;
    const t = ctx.currentTime;
    const burst = ctx.createBufferSource();
    burst.buffer = nodes.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 420;
    bp.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.32, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    burst.connect(bp).connect(g).connect(nodes.master);
    burst.start(t, Math.random());
    burst.stop(t + 0.16);
    // 低频闷击（thump）。
    this.tone(64, 0, 0.15, 0.3);
  }

  /** 关闭 AudioContext、丢弃全部节点；幂等。 */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const ctx = this.ctx;
    const nodes = this.nodes;
    this.nodes = null;
    this.ctx = null;
    this.nextReverseBeepAt = 0;
    if (!ctx || !nodes) return;
    try {
      nodes.master.gain.cancelScheduledValues(ctx.currentTime);
      nodes.master.gain.setValueAtTime(0, ctx.currentTime);
    } catch {
      /* 参数调度在已关闭上下文上可能拒绝——忽略 */
    }
    for (const source of [nodes.engineOsc, nodes.subOsc, nodes.lfo]) {
      try {
        source.stop();
      } catch {
        /* 未启动或已停止——忽略 */
      }
      try {
        source.disconnect();
      } catch {
        /* 忽略 */
      }
    }
    try {
      nodes.master.disconnect();
    } catch {
      /* 忽略 */
    }
    void ctx.close().catch(() => undefined);
  }

  /** 短音（蜂鸣/闷击共用）：8ms 指数起音 + 指数衰减。 */
  private tone(freq: number, delay: number, dur: number, peak: number): void {
    const ctx = this.ctx;
    const nodes = this.nodes;
    if (!ctx || !nodes || this.disposed) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(nodes.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private build(ctx: AudioContext): EngineNodes {
    const master = ctx.createGain();
    master.gain.value = this.gainTarget();
    master.connect(ctx.destination);

    // 共享白噪声缓冲（刹车层与碰撞爆发取样源）。
    const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 1), ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;

    // 引擎主体：锯齿（粗糙感）经低通塑形。
    const engineOsc = ctx.createOscillator();
    engineOsc.type = "sawtooth";
    engineOsc.frequency.value = IDLE_FLOOR;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = "lowpass";
    engineFilter.frequency.value = 900;
    engineFilter.Q.value = 1.1;
    // 副低频：正弦低八度，车身/座椅体感轰鸣。
    const subOsc = ctx.createOscillator();
    subOsc.type = "sine";
    subOsc.frequency.value = IDLE_FLOOR / 2;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.7;
    // 引擎总音量（update 按车速驱动）。
    const engineGain = ctx.createGain();
    engineGain.gain.value = IDLE_VOLUME;
    engineOsc.connect(engineFilter).connect(engineGain);
    subOsc.connect(subGain).connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
    subOsc.start();

    // LFO 颤动：8Hz 正弦经深度增益（±2Hz）调制两个振荡器的频率。
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = LFO_HZ;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = LFO_DEPTH_HZ;
    lfo.connect(lfoDepth);
    lfoDepth.connect(engineOsc.frequency);
    lfoDepth.connect(subOsc.frequency);
    lfo.start();

    // 刹车层：循环白噪声经带通，增益由 update 短包层驱动（初始静默）。
    const brakeNoise = ctx.createBufferSource();
    brakeNoise.buffer = noise;
    brakeNoise.loop = true;
    const brakeFilter = ctx.createBiquadFilter();
    brakeFilter.type = "bandpass";
    brakeFilter.frequency.value = 1600;
    brakeFilter.Q.value = 0.6;
    const brakeGain = ctx.createGain();
    brakeGain.gain.value = 0;
    brakeNoise.connect(brakeFilter).connect(brakeGain).connect(master);
    brakeNoise.start();

    return { master, engineOsc, engineFilter, subOsc, subGain, engineGain, lfo, lfoDepth, brakeGain, noise };
  }
}
