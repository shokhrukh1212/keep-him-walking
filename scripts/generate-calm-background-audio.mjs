import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sampleRate = 22_050;
const seconds = 16;
const sampleCount = sampleRate * seconds;
const pcm = Buffer.alloc(sampleCount * 2);
const chords = [
  [130.81, 164.81, 196, 246.94],
  [110, 130.81, 164.81, 196],
  [87.31, 130.81, 164.81, 196],
  [98, 146.83, 196, 220],
];

function softTriangle(phase) {
  return Math.asin(Math.sin(phase)) * (2 / Math.PI);
}

for (let index = 0; index < sampleCount; index += 1) {
  const time = index / sampleRate;
  const chord = chords[Math.floor(time / 4) % chords.length];
  const withinChord = time % 4;
  const chordEnvelope = Math.min(1, withinChord / 0.8, (4 - withinChord) / 0.8);
  const loopEnvelope = Math.min(1, time / 0.12, (seconds - time) / 0.12);
  let value = 0;
  chord.forEach((frequency, voice) => {
    const phase = Math.PI * 2 * frequency * time + voice * 0.7;
    value += softTriangle(phase) * (0.032 - voice * 0.004);
    value += Math.sin(phase * 0.5) * 0.009;
  });
  const melodyFrequency = chord[Math.floor(withinChord * 2) % chord.length] * 2;
  const melodyEnvelope = Math.sin(Math.PI * ((withinChord * 2) % 1)) ** 2;
  value += Math.sin(Math.PI * 2 * melodyFrequency * time) * melodyEnvelope * 0.018;
  const sample = Math.max(-1, Math.min(1, value * chordEnvelope * loopEnvelope));
  pcm.writeInt16LE(Math.round(sample * 32_767), index * 2);
}

const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + pcm.length, 4);
header.write("WAVEfmt ", 8);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22);
header.writeUInt32LE(sampleRate, 24);
header.writeUInt32LE(sampleRate * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(pcm.length, 40);

const destination = path.join(root, "public", "audio", "calm-background.wav");
await mkdir(path.dirname(destination), { recursive: true });
await writeFile(destination, Buffer.concat([header, pcm]));
process.stdout.write(`Wrote ${path.relative(root, destination)}\n`);
