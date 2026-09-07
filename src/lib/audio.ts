export function pcmToBase64(pcmData: Float32Array): string {
  const buffer = new ArrayBuffer(pcmData.length * 2);
  const view = new DataView(buffer);
  
  for (let i = 0; i < pcmData.length; i++) {
    let s = Math.max(-1, Math.min(1, pcmData[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export class AudioStreamPlayer {
  private audioCtx: AudioContext | null = null;
  private nextTime: number = 0;
  private sampleRate: number;

  constructor(sampleRate: number = 24000) {
    this.sampleRate = sampleRate;
  }

  private getContext(): AudioContext {
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      this.audioCtx = new AudioContext({ sampleRate: this.sampleRate });
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(console.error);
    }
    return this.audioCtx;
  }

  playChunk(base64Audio: string) {
    try {
      const ctx = this.getContext();
      const binary = atob(base64Audio);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      
      const sampleCount = Math.floor(bytes.length / 2);
      if (sampleCount === 0) return;

      const dataView = new DataView(bytes.buffer, bytes.byteOffset, sampleCount * 2);
      const float32 = new Float32Array(sampleCount);
      for (let i = 0; i < sampleCount; i++) {
        float32[i] = dataView.getInt16(i * 2, true) / 32768.0;
      }

      const buffer = ctx.createBuffer(1, float32.length, ctx.sampleRate);
      buffer.getChannelData(0).set(float32);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      
      if (this.nextTime < ctx.currentTime) {
        // Se a fila esvaziar, adicionamos um atraso artificial de 200ms (Jitter Buffer)
        // para dar tempo de receber os próximos pacotes da rede e evitar o picotamento.
        this.nextTime = ctx.currentTime + 0.2;
      }
      
      source.start(this.nextTime);
      this.nextTime += buffer.duration;
    } catch (e) {
      console.error("Error playing audio chunk:", e);
    }
  }

  stop() {
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
    this.nextTime = 0;
  }
}
