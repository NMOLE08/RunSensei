import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const outputDir=path.join(root,'artifacts','jett-lipsync');
const timingFile=path.join(outputDir,'timing','jett-intro-mouth-cues.json');
const allowed=new Set(['X','A','B','C','D','E','F','G']);
const timing=JSON.parse(fs.readFileSync(timingFile,'utf8'));
const errors=[]; const warnings=[];
if(!Number.isFinite(timing.metadata?.duration)||timing.metadata.duration<=0)errors.push('invalid_audio_duration');
if(!Array.isArray(timing.mouthCues)||!timing.mouthCues.length)errors.push('mouth_cues_missing');
let previousEnd=0;
for(const [index,cue] of (timing.mouthCues??[]).entries()){
  if(!allowed.has(cue.value))errors.push(`cue_${index}_unknown_state_${cue.value}`);
  if(!Number.isFinite(cue.start)||!Number.isFinite(cue.end)||cue.start<0||cue.end<=cue.start)errors.push(`cue_${index}_invalid_range`);
  if(Math.abs(cue.start-previousEnd)>0.001)errors.push(`cue_${index}_timeline_gap_or_overlap`);
  previousEnd=cue.end;
}
if(timing.mouthCues?.[0]?.start!==0)errors.push('timeline_does_not_start_at_zero');
if(Math.abs(previousEnd-(timing.metadata?.duration??0))>0.001)errors.push('timeline_does_not_cover_audio_duration');
for(const state of allowed)if(!fs.existsSync(path.join(outputDir,'frames',`mouth-${state}.png`)))errors.push(`sprite_missing_${state}`);
const used=[...new Set((timing.mouthCues??[]).map(cue=>cue.value))].sort();
for(const state of allowed)if(!used.includes(state))warnings.push(`sprite_state_not_used_${state}`);
timing.metadata.soundFile='../audio/jett-intro.wav';
fs.writeFileSync(timingFile,JSON.stringify(timing,null,2));
const report={valid:errors.length===0,errors,warnings,durationSeconds:timing.metadata.duration,cueCount:timing.mouthCues.length,firstStart:timing.mouthCues[0]?.start??null,lastEnd:previousEnd,allowedStates:[...allowed],usedStates:used,spriteFiles:[...allowed].map(state=>`frames/mouth-${state}.png`),audioFiles:['audio/jett-intro.mp3','audio/jett-intro.wav'],rhubarb:{version:'1.13.0',recognizer:'pocketSphinx',extendedShapes:'GX'}};
fs.writeFileSync(path.join(outputDir,'timing','validation-report.json'),JSON.stringify(report,null,2));
if(errors.length)throw new Error(errors.join(','));
console.log(`Valid: ${report.cueCount} contiguous cues cover ${report.durationSeconds.toFixed(2)} seconds using ${used.join(',')}.`);
