import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { PNG } from 'pngjs';

const root = process.cwd();
const states = ['X', 'A', 'B', 'C', 'D', 'E', 'F', 'G'];
const inputDir = path.join(root, 'assets', 'moss');
const recording = path.join(root, 'assets', 'recording', 'moss intor.mp3');
const outputDir = path.join(root, 'artifacts', 'moss-lipsync');
const temporaryDir = path.join(outputDir, '.source-png');
const ffmpeg = path.join(root, '.tools', 'ffmpeg', 'app', 'package', 'ffmpeg.exe');
const canvas = { width: 674, height: 736 };

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed: ${result.stderr || result.stdout}`);
}
function load(file) { return PNG.sync.read(fs.readFileSync(file)); }
function write(file, image) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, PNG.sync.write(image)); }
function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function isConnectedBackgroundColor(data, index) {
  const r = data[index], g = data[index + 1], b = data[index + 2];
  return Math.min(r, g, b) >= 220 && Math.max(r, g, b) - Math.min(r, g, b) <= 32;
}
function removeEdgeConnectedWhite(source) {
  const visited = new Uint8Array(source.width * source.height);
  const stack = [];
  const seed = (x, y) => {
    const pixel = y * source.width + x;
    if (visited[pixel] || !isConnectedBackgroundColor(source.data, pixel * 4)) return;
    visited[pixel] = 1; stack.push(pixel);
  };
  // The jacket reaches the bottom edge. Seed top and side edges only so its
  // cream panels cannot be mistaken for background.
  for (let x = 0; x < source.width; x++) seed(x, 0);
  for (let y = 0; y < source.height; y++) { seed(0, y); seed(source.width - 1, y); }
  while (stack.length) {
    const pixel = stack.pop(); const x = pixel % source.width; const y = Math.floor(pixel / source.width);
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (nx >= 0 && ny >= 0 && nx < source.width && ny < source.height) seed(nx, ny);
    }
  }
  const output = new PNG({ width: source.width, height: source.height }); source.data.copy(output.data);
  let removed = 0; let feathered = 0;
  for (let pixel = 0; pixel < visited.length; pixel++) if (visited[pixel]) {
    const index = pixel * 4; const minimum = Math.min(output.data[index], output.data[index + 1], output.data[index + 2]);
    const alpha = minimum >= 245 ? 0 : Math.round(255 * (245 - minimum) / 25);
    output.data[index + 3] = Math.max(0, Math.min(255, alpha));
    if (alpha === 0) removed++; else feathered++;
  }
  return { image: output, removed, feathered };
}
function place(source) {
  const output = new PNG(canvas);
  for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
    const from = (y * source.width + x) * 4; const to = (y * canvas.width + x) * 4;
    source.data.copy(output.data, to, from, from + 4);
  }
  return output;
}
function alphaAlignmentScore(reference, candidate, dx, dy) {
  let score = 0;
  // Upper body/head silhouette is used; mouth pixels contribute only a small
  // fraction and therefore do not determine alignment by themselves.
  for (let y = 0; y < 410; y += 2) for (let x = 0; x < canvas.width; x += 2) {
    const rx = x - dx; const ry = y - dy;
    const referenceAlpha = reference.data[(y * canvas.width + x) * 4 + 3];
    const candidateAlpha = rx >= 0 && ry >= 0 && rx < canvas.width && ry < canvas.height ? candidate.data[(ry * canvas.width + rx) * 4 + 3] : 0;
    score += Math.abs(referenceAlpha - candidateAlpha);
  }
  return score;
}
function bestTranslation(reference, candidate) {
  let best = { x: 0, y: 0, score: Number.POSITIVE_INFINITY };
  for (let y = -8; y <= 8; y++) for (let x = -8; x <= 8; x++) {
    const score = alphaAlignmentScore(reference, candidate, x, y);
    if (score < best.score) best = { x, y, score };
  }
  return best;
}
function translate(source, dx, dy) {
  const output = new PNG(canvas);
  for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
    const tx = x + dx; const ty = y + dy;
    if (tx < 0 || ty < 0 || tx >= canvas.width || ty >= canvas.height) continue;
    const from = (y * source.width + x) * 4; const to = (ty * canvas.width + tx) * 4;
    source.data.copy(output.data, to, from, from + 4);
  }
  return output;
}
function alphaBounds(image) {
  let minX = image.width, minY = image.height, maxX = -1, maxY = -1, pixels = 0;
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) if (image.data[(y * image.width + x) * 4 + 3] > 8) {
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); pixels++;
  }
  return { minX, minY, maxX, maxY, pixels };
}
function regionalDifference(reference, image, region) {
  let compared = 0, different = 0, total = 0;
  for (let y = region.y; y < region.y + region.height; y++) for (let x = region.x; x < region.x + region.width; x++) {
    const index = (y * canvas.width + x) * 4;
    if (!reference.data[index + 3] && !image.data[index + 3]) continue;
    compared++; let maximum = 0;
    for (let channel = 0; channel < 4; channel++) { const delta = Math.abs(reference.data[index + channel] - image.data[index + channel]); total += delta; maximum = Math.max(maximum, delta); }
    if (maximum > 32) different++;
  }
  return { comparedPixels: compared, differentPixels: different, differentPercent: compared ? Number((different * 100 / compared).toFixed(2)) : 0, meanAbsoluteChannelDifference: compared ? Number((total / (compared * 4)).toFixed(2)) : 0 };
}

if (!fs.existsSync(ffmpeg)) throw new Error(`ffmpeg missing: ${ffmpeg}`);
if (!fs.existsSync(recording)) throw new Error(`Moss introduction missing: ${recording}`);
fs.mkdirSync(temporaryDir, { recursive: true });
const prepared = [];
for (const state of states) {
  const sourceFile = path.join(inputDir, `moss-${state}.jpg`); const pngFile = path.join(temporaryDir, `moss-${state}.png`);
  if (!fs.existsSync(sourceFile)) throw new Error(`Moss frame missing: ${sourceFile}`);
  run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', sourceFile, pngFile]);
  const source = load(pngFile); const transparent = removeEdgeConnectedWhite(source); const placed = place(transparent.image);
  prepared.push({ state, sourceFile, sourceDimensions: { width: source.width, height: source.height }, background: { removedPixels: transparent.removed, featheredPixels: transparent.feathered }, placed });
}
const reference = prepared[0].placed;
const processed = prepared.map((item) => {
  const translation = item.state === 'X' ? { x: 0, y: 0, score: 0 } : bestTranslation(reference, item.placed);
  const normalized = translate(item.placed, translation.x, translation.y);
  const outputFile = path.join(outputDir, 'frames', `mouth-${item.state}.png`); write(outputFile, normalized);
  return { ...item, normalized, outputFile, translation, alphaBounds: alphaBounds(normalized) };
});
write(path.join(outputDir, 'base', 'moss-base-X.png'), processed[0].normalized);
const sheet = new PNG({ width: canvas.width * 4, height: canvas.height * 2 });
processed.forEach((item, index) => { const column = index % 4; const row = Math.floor(index / 4); for (let y = 0; y < canvas.height; y++) { const from = y * canvas.width * 4; const to = ((row * canvas.height + y) * sheet.width + column * canvas.width) * 4; item.normalized.data.copy(sheet.data, to, from, from + canvas.width * 4); } });
write(path.join(outputDir, 'moss-mouths-4x2.png'), sheet);
fs.mkdirSync(path.join(outputDir, 'audio'), { recursive: true }); fs.copyFileSync(recording, path.join(outputDir, 'audio', 'moss-intro.mp3'));

const regions = { eyesAndHead: { x: 180, y: 0, width: 420, height: 290 }, beakAndMouth: { x: 330, y: 120, width: 300, height: 300 }, shell: { x: 0, y: 230, width: 260, height: 380 }, jacketAndZipper: { x: 130, y: 350, width: 500, height: 386 }, runningLogo: { x: 500, y: 560, width: 160, height: 150 } };
const reportFrames = processed.map((item) => ({ state: item.state, sourceFile: path.relative(root, item.sourceFile).replaceAll('\\', '/'), outputFile: path.relative(root, item.outputFile).replaceAll('\\', '/'), sourceDimensions: item.sourceDimensions, background: item.background, translation: item.translation, alphaBounds: item.alphaBounds, regionalDifferenceFromX: Object.fromEntries(Object.entries(regions).map(([name, region]) => [name, regionalDifference(reference, item.normalized, region)])) }));
const wavFile = path.join(outputDir, 'audio', 'moss-intro.wav');
const manifest = { schemaVersion: 1, character: 'Moss', rowMajorOrder: states, grid: { columns: 4, rows: 2, frameWidth: canvas.width, frameHeight: canvas.height }, states: Object.fromEntries(processed.map((item, index) => [item.state, { file: `frames/mouth-${item.state}.png`, row: Math.floor(index / 4), column: index % 4 }])), rhubarb: { allowedMouthStates: states, extendedShapes: 'GX', timingFile: 'timing/moss-intro-mouth-cues.json' }, audio: { sourceFile: 'audio/moss-intro.mp3', sourceSha256: sha256(path.join(outputDir, 'audio', 'moss-intro.mp3')), rhubarbFile: 'audio/moss-intro.wav', rhubarbSha256: fs.existsSync(wavFile) ? sha256(wavFile) : null } };
fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
fs.writeFileSync(path.join(outputDir, 'alignment-report.json'), JSON.stringify({ canvas, frames: reportFrames, regions, backgroundRemoval: { method: 'edge-connected near-white flood fill with feathered alpha', manualReviewRequired: true }, overlayAssessment: { safeForAutomaticExtraction: false, reason: 'The eight source JPEGs are complete-character redraws. Stable head, shell, jacket, and facial pixels vary, so physical-device switching may still jitter.' } }, null, 2));
fs.writeFileSync(path.join(outputDir, 'alignment-report.md'), ['# Moss lip-sync asset report', '', `- Normalized frame size: ${canvas.width} × ${canvas.height}.`, '- Originals were not modified.', '- White backgrounds were removed only when connected to the top or side edges.', '- Alignment was estimated from the upper-body/head alpha silhouette.', '- Manual and Android visual review remain required; zero jitter is not claimed.', '', '## Alignment translations', '', ...reportFrames.map((frame) => `- ${frame.state}: ${frame.sourceDimensions.width}×${frame.sourceDimensions.height}; translate (${frame.translation.x}, ${frame.translation.y}); removed ${frame.background.removedPixels} background pixels.`)].join('\n'));
fs.rmSync(temporaryDir, { force: true, recursive: true });
console.log(`Prepared ${processed.length} Moss frames in ${path.relative(root, outputDir)}.`);
