import fs from 'node:fs';
import path from 'node:path';
import { coachDefinitions } from '@/features/coaches/mascotAssets';

type Manifest = {
  character: string;
  rowMajorOrder: string[];
  grid: { frameWidth: number; frameHeight: number };
  states: Record<string, { file: string }>;
  rhubarb: { timingFile: string };
  audio: { sourceFile: string };
};

describe.each([
  ['moss-lipsync', 'Moss', 674, 736],
  ['jett-lipsync', 'Jett', 512, 576],
] as const)('%s bundled coach assets', (folder, character, width, height) => {
  it('maps every authored mouth state to an existing static artifact', () => {
    const root = path.resolve(process.cwd(), 'artifacts', folder);
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')) as Manifest;
    expect(manifest).toMatchObject({ character, grid: { frameWidth: width, frameHeight: height } });
    expect(manifest.rowMajorOrder).toEqual(['X', 'A', 'B', 'C', 'D', 'E', 'F', 'G']);
    for (const state of manifest.rowMajorOrder) expect(fs.existsSync(path.join(root, manifest.states[state]!.file))).toBe(true);
    expect(fs.existsSync(path.join(root, manifest.rhubarb.timingFile))).toBe(true);
    expect(fs.existsSync(path.join(root, manifest.audio.sourceFile))).toBe(true);
  });
});

describe('coach asset presentation', () => {
  it('keeps asset mappings attached to the same two persisted coach IDs', () => {
    expect(Object.keys(coachDefinitions).sort()).toEqual(['jett', 'moss']);
    expect(coachDefinitions.moss.title).toBe('The Hard-to-Impress Mentor');
    expect(coachDefinitions.jett.title).toBe('The Roasting Mentor');
    expect(coachDefinitions.moss.frameAspectRatio).toBe(674 / 736);
    expect(coachDefinitions.jett.frameAspectRatio).toBe(512 / 576);
  });
});
