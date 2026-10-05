import type { Page } from "@playwright/test";

declare global { interface Window { browserAudio: { rms: number; raw: number } } }

/** Sample actual output and decoded remote media, rather than a UI mute label. */
export async function observeAudio(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.browserAudio = { rms: 0, raw: 0 };
    const outputs: AnalyserNode[] = [], sources: AnalyserNode[] = [];
    const original = AudioNode.prototype.connect;
    const connect = original as unknown as (this: AudioNode, destination: AudioNode | AudioParam, output?: number, input?: number) => AudioNode | void;
    AudioNode.prototype.connect = function(this: AudioNode, ...args: Parameters<typeof connect>) {
      const destination = args[0];
      if (destination instanceof AudioDestinationNode) {
        const analyser = this.context.createAnalyser();
        connect.call(this, analyser); connect.call(analyser, destination); outputs.push(analyser);
        return destination;
      }
      return connect.apply(this, args);
    } as typeof original;
    const createSource = AudioContext.prototype.createMediaStreamSource;
    AudioContext.prototype.createMediaStreamSource = function(stream) {
      const source = createSource.call(this, stream), analyser = this.createAnalyser();
      source.connect(analyser); sources.push(analyser); return source;
    };
    const rms = (analyser: AnalyserNode) => {
      const samples = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(samples);
      return Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
    };
    setInterval(() => {
      window.browserAudio.rms = Math.max(0, ...outputs.map(rms));
      window.browserAudio.raw = Math.max(0, ...sources.map(rms));
    }, 40);
  });
}
