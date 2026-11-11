// Efeitos originais sintetizados; nenhum áudio externo ou biblioteca.
export class InvitationSound {
  constructor() { this.enabled = false; this.context = null; this.volume = .14; }
  async enable(on) {
    this.enabled = on;
    if (!on) { if (this.context?.state === 'running') await this.context.suspend(); return false; }
    const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Audio) { this.enabled = false; return false; }
    try { this.context ||= new Audio(); await this.context.resume(); this.enabled = this.context.state === 'running'; }
    catch { this.enabled = false; }
    return this.enabled;
  }
  play(kind = 'page') {
    if (!this.enabled || this.context?.state !== 'running' || this.volume <= 0) return;
    const ctx = this.context;
    const notes = kind === 'open' ? [523.25,659.25,783.99,1046.5] : kind === 'ready' ? [659.25,783.99] : [440,660];
    notes.forEach((frequency, i) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      const time = ctx.currentTime + i * (kind === 'open' ? .13 : .045);
      osc.type = 'sine'; osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0,time); gain.gain.linearRampToValueAtTime(Math.max(.0002,Math.min(.25,this.volume))*.25,time+.015); gain.gain.exponentialRampToValueAtTime(.0001,time+.7);
      osc.connect(gain); gain.connect(ctx.destination); osc.start(time); osc.stop(time+.75); osc.onended=()=>{osc.disconnect();gain.disconnect();};
    });
  }
}
