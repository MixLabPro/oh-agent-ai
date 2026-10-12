/**
 * GameSfx：飞行音效——Web Audio 程序化合成，零音频资产。螺旋桨跟油门连续
 * 变转速、风声跟空速变强度、雨声跟天气强度（cityWeather 连续值，由会话层
 * 按回放时钟取值传入）；碰撞/穿环/倒计时为一次性合成音。与 GameAudio
 * （音乐 m4a）同层挂在 GameSession 副作用层，共享「进入游戏」的手势解锁；
 * AudioContext 不可用（Worker/测试桩）时静默降级，绝不打断游戏。
 */

const MASTER_GAIN = 0.5;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** 进程级共享 AudioContext（一个页面一个 ctx 是 Web Audio 最佳实践）。
 *  WKWebView 首次 new AudioContext() 可能同步阻塞主线程数秒（音频会话协商），
 *  因此提供预热：城市就绪后的空闲时机提前创建（新建即 suspended、不发声），
 *  进游戏时只做轻量 resume，进场不再冻结。 */
let sharedAudioContext: AudioContext | null = null;

export function prewarmAudioContext(): void {
  if (sharedAudioContext || typeof AudioContext === "undefined") return;
  try {
    sharedAudioContext = new AudioContext();
  } catch {
    sharedAudioContext = null;
  }
}

/** 每帧由会话层喂给的飞行状态（参数平滑由 setTargetAtTime 完成）。 */
export type SfxTelemetry = {
  /** 空速（世界单位/秒）。 */
  speed: number;
  minSpeed: number;
  maxSpeed: number;
  throttleUp: boolean;
  throttleDown: boolean;
  /** 天气雨强 0-1（clear 恒 0）。 */
  rainIntensity: number;
};

type SfxNodes = {
  master: GainNode;
  propOsc: OscillatorNode;
  propFilter: BiquadFilterNode;
  propGain: GainNode;
  windFilter: BiquadFilterNode;
  windGain: GainNode;
  rainGain: GainNode;
  noise: AudioBuffer;
};

export class GameSfx {
  private ctx: AudioContext | null = null;
  private nodes: SfxNodes | null = null;
  private soundMuted = false;
  /** 主音量（0-1，会话层声音面板），作用于基准增益之上。 */
  private vol = 1;
  private suspended = true;
  private nextThunderAt = 0;

  get muted(): boolean {
    return this.soundMuted;
  }

  /** 当前主增益目标：挂起/静音为 0，否则基准 × 主音量。 */
  private gainTarget(): number {
    return this.suspended || this.soundMuted ? 0 : MASTER_GAIN * this.vol;
  }

  private applyMasterGain(tau: number): void {
    if (this.ctx && this.nodes) {
      this.nodes.master.gain.setTargetAtTime(this.gainTarget(), this.ctx.currentTime, tau);
    }
  }

  setMuted(value: boolean): void {
    this.soundMuted = value;
    this.applyMasterGain(0.02);
  }

  setVolume(volume: number): void {
    this.vol = clamp01(volume);
    this.applyMasterGain(0.02);
  }

  /** 开始/继续（幂等）：run 挂载与重开路径共用。挂起期间主增益已淡到 0，
   *  这里负责恢复上下文并把增益淡回目标。 */
  start(): void {
    this.suspended = false;
    if (typeof AudioContext === "undefined") return;
    if (!this.ctx) {
      if (!sharedAudioContext) prewarmAudioContext();
      this.ctx = sharedAudioContext;  // 预热失败为 null → 音效静默降级
    }
    if (!this.ctx) return;
    if (!this.nodes) this.nodes = this.build(this.ctx);
    const fade = () => this.applyMasterGain(0.05);
    if (this.ctx.state === "suspended") void this.ctx.resume().then(fade).catch(() => undefined);
    else fade();
  }

  /** 挂起（暂停/焦点丢失/宿主隐藏/结算画面）。先短淡出再挂起：噪声/锯齿声部
   *  在非零振幅被瞬间冻结会在输出端产生阶跃——扬声器上就是那声「啪」。 */
  suspend(): void {
    if (this.suspended) return;
    this.suspended = true;
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    this.applyMasterGain(0.015);  // ~40ms 内收敛到 0
    setTimeout(() => {
      if (this.suspended && ctx.state === "running") void ctx.suspend().catch(() => undefined);
    }, 60);
  }

  resume(): void {
    if (!this.suspended) return;
    this.suspended = false;
    const ctx = this.ctx;
    if (!ctx) return;
    const fade = () => this.applyMasterGain(0.05);
    if (ctx.state === "suspended") void ctx.resume().then(fade).catch(() => undefined);
    else fade();
  }

  /** 停止（退出游戏）：挂起即可（循环参数在下次 start 前由 update 重设）。 */
  stop(): void {
    this.suspend();
  }

  dispose(): void {
    this.suspended = true;
    // 共享 ctx 不关闭（关闭后整页无法再建音频图）；只丢弃自己的节点图。
    this.nodes = null;
    this.ctx = null;
  }

  /** 每帧驱动连续声部（螺旋桨/风/雨 + 雷声调度）。暂停/结算时不会被调用。 */
  update(telemetry: SfxTelemetry): void {
    const ctx = this.ctx;
    const nodes = this.nodes;
    if (!ctx || !nodes || this.suspended) return;
    const t = ctx.currentTime;
    const speedN = Math.max(0, Math.min(1, (telemetry.speed - telemetry.minSpeed) / Math.max(1, telemetry.maxSpeed - telemetry.minSpeed)));
    const throttle = telemetry.throttleUp ? 1 : telemetry.throttleDown ? 0 : 0.55;
    // 螺旋桨：叶片通过频率与机身共鸣随油门/空速移动（τ≈0.25s 相当于发动机惯性）。
    nodes.propOsc.frequency.setTargetAtTime(58 + throttle * 52 + speedN * 10, t, 0.25);
    nodes.propFilter.frequency.setTargetAtTime(260 + throttle * 220, t, 0.25);
    nodes.propGain.gain.setTargetAtTime(0.2 + throttle * 0.12, t, 0.2);
    // 风：带通中心与增益随空速（平方曲线贴合低速被机身掩蔽的听感）。
    nodes.windFilter.frequency.setTargetAtTime(500 + speedN * 1100, t, 0.2);
    nodes.windGain.gain.setTargetAtTime(0.02 + speedN * speedN * 0.16, t, 0.2);
    // 雨：增益随雨强（慢时间常数——雨势本就渐变）。
    nodes.rainGain.gain.setTargetAtTime(telemetry.rainIntensity * 0.12, t, 0.5);
    // 闷雷：雨强足够时随机远雷（低频噪声涌起），间隔 8-22s。
    if (telemetry.rainIntensity > 0.45 && t >= this.nextThunderAt) {
      this.nextThunderAt = t + 8 + Math.random() * 14;
      this.thunder();
    }
  }

  /** 穿环：双音短钟（E6 起、B6 延 30ms 叠入），指数衰减。 */
  ringPass(): void {
    const ctx = this.ctx;
    const nodes = this.nodes;
    if (!ctx || !nodes || this.suspended) return;
    this.tone(1318.5, 0, 0.45, 0.16);
    this.tone(1975.5, 0.03, 0.5, 0.1);
  }

  /** 碰撞：噪声爆发 + 75Hz 闷响（与视觉 pulseFeedback 同时触发）。 */
  collision(): void {
    const ctx = this.ctx;
    const nodes = this.nodes;
    if (!ctx || !nodes || this.suspended) return;
    const t = ctx.currentTime;
    const burst = ctx.createBufferSource();
    burst.buffer = nodes.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 300;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    burst.connect(hp).connect(g).connect(nodes.master);
    burst.start(t, Math.random());
    burst.stop(t + 0.15);
    this.tone(75, 0, 0.3, 0.3);
  }

  /** 倒计时蜂鸣；final 为起跑音（更高更长）。 */
  countdownBeep(final: boolean): void {
    this.tone(final ? 1318.5 : 880, 0, final ? 0.25 : 0.09, 0.16);
  }

  private tone(freq: number, delay: number, dur: number, peak: number): void {
    const ctx = this.ctx;
    const nodes = this.nodes;
    if (!ctx || !nodes) return;
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

  private thunder(): void {
    const ctx = this.ctx;
    const nodes = this.nodes;
    if (!ctx || !nodes) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = nodes.noise;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(320, t);
    lp.frequency.exponentialRampToValueAtTime(90, t + 1.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.14, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    src.connect(lp).connect(g).connect(nodes.master);
    src.start(t, Math.random());
    src.stop(t + 2.3);
  }

  private build(ctx: AudioContext): SfxNodes {
    const master = ctx.createGain();
    master.gain.value = this.gainTarget();
    master.connect(ctx.destination);

    const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;

    // 螺旋桨：低频锯齿（叶片通过）经低通塑形 + 带通噪声层（机身共鸣）。
    const propOsc = ctx.createOscillator();
    propOsc.type = "sawtooth";
    propOsc.frequency.value = 62;
    const propFilter = ctx.createBiquadFilter();
    propFilter.type = "lowpass";
    propFilter.frequency.value = 320;
    propFilter.Q.value = 1.2;
    const propGain = ctx.createGain();
    propGain.gain.value = 0.25;
    propOsc.connect(propFilter).connect(propGain).connect(master);
    propOsc.start();

    const propNoise = ctx.createBufferSource();
    propNoise.buffer = noise;
    propNoise.loop = true;
    const propNoiseFilter = ctx.createBiquadFilter();
    propNoiseFilter.type = "bandpass";
    propNoiseFilter.frequency.value = 140;
    propNoiseFilter.Q.value = 0.8;
    const propNoiseGain = ctx.createGain();
    propNoiseGain.gain.value = 0.18;
    propNoise.connect(propNoiseFilter).connect(propNoiseGain).connect(propGain);
    propNoise.start();

    // 风：噪声带通，中心/增益由 update 按空速驱动。
    const wind = ctx.createBufferSource();
    wind.buffer = noise;
    wind.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = "bandpass";
    windFilter.frequency.value = 700;
    windFilter.Q.value = 0.5;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.02;
    wind.connect(windFilter).connect(windGain).connect(master);
    wind.start();

    // 雨：高通噪声，增益由 update 按雨强驱动。
    const rain = ctx.createBufferSource();
    rain.buffer = noise;
    rain.loop = true;
    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = "highpass";
    rainFilter.frequency.value = 3800;
    const rainGain = ctx.createGain();
    rainGain.gain.value = 0;
    rain.connect(rainFilter).connect(rainGain).connect(master);
    rain.start();

    return { master, propOsc, propFilter, propGain, windFilter, windGain, rainGain, noise };
  }
}
