import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PNG } from 'pngjs';

const root=process.cwd();
const inputDir=path.join(root,'assets','jet');
const recording=path.join(root,'assets','recording','jet intro.mp3');
const outputDir=path.join(root,'artifacts','jett-lipsync');
const states=['X','A','B','C','D','E','F','G'];
const canvas={width:512,height:576};
const targetNose={x:320,y:350};

function load(file){return PNG.sync.read(fs.readFileSync(file));}
function write(file,image){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,PNG.sync.write(image));}
function sha256(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
function alphaBounds(image){let minX=image.width,minY=image.height,maxX=-1,maxY=-1,pixels=0;for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++){if(image.data[(y*image.width+x)*4+3]){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);pixels++;}}return {minX,minY,maxX,maxY,pixels};}
function noseComponents(image){
  const mask=new Uint8Array(image.width*image.height);
  for(let y=240;y<Math.min(390,image.height);y++)for(let x=200;x<Math.min(400,image.width);x++){
    const index=(y*image.width+x)*4; const [r,g,b,a]=image.data.subarray(index,index+4);
    if(a>200&&r>175&&g>70&&g<165&&b<150&&r-g>50)mask[y*image.width+x]=1;
  }
  const components=[];
  for(let start=0;start<mask.length;start++)if(mask[start]){
    const stack=[start];mask[start]=0;let count=0,sumX=0,sumY=0,minX=image.width,minY=image.height,maxX=0,maxY=0;
    while(stack.length){const current=stack.pop();const x=current%image.width,y=Math.floor(current/image.width);count++;sumX+=x;sumY+=y;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);for(const next of [current-1,current+1,current-image.width,current+image.width])if(next>=0&&next<mask.length&&mask[next]){mask[next]=0;stack.push(next);}}
    if(count>=200&&count<=400)components.push({count,x:sumX/count,y:sumY/count,bounds:{minX,minY,maxX,maxY}});
  }
  const candidates=components.filter(item=>item.x>270&&item.y<350).sort((a,b)=>Math.abs(a.y-325)-Math.abs(b.y-325));
  if(!candidates.length)throw new Error('nose_landmark_not_found');
  return candidates[0];
}
function translate(source,dx,dy){const output=new PNG(canvas);for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++){const tx=x+dx,ty=y+dy;if(tx<0||ty<0||tx>=output.width||ty>=output.height)continue;const from=(y*source.width+x)*4,to=(ty*output.width+tx)*4;source.data.copy(output.data,to,from,from+4);}return output;}
function difference(reference,image,region){let compared=0,different=0,absolute=0;for(let y=region.y;y<region.y+region.height;y++)for(let x=region.x;x<region.x+region.width;x++){const index=(y*reference.width+x)*4;const ra=reference.data[index+3],ia=image.data[index+3];if(!ra&&!ia)continue;compared++;let maximum=0;for(let channel=0;channel<4;channel++){const delta=Math.abs(reference.data[index+channel]-image.data[index+channel]);absolute+=delta;maximum=Math.max(maximum,delta);}if(maximum>32)different++;}return {comparedPixels:compared,differentPixels:different,differentPercent:compared?Number((different*100/compared).toFixed(2)):0,meanAbsoluteChannelDifference:compared?Number((absolute/(compared*4)).toFixed(2)):0};}

fs.mkdirSync(outputDir,{recursive:true});
const processed=[];
for(const state of states){
  const sourceFile=path.join(inputDir,`mouth-${state}.png`);const source=load(sourceFile);const nose=noseComponents(source);
  const translation={x:Math.round(targetNose.x-nose.x),y:Math.round(targetNose.y-nose.y)};
  const normalized=translate(source,translation.x,translation.y);const outputFile=path.join(outputDir,'frames',`mouth-${state}.png`);write(outputFile,normalized);
  processed.push({state,sourceFile:path.relative(root,sourceFile).replaceAll('\\','/'),outputFile:path.relative(root,outputFile).replaceAll('\\','/'),sourceDimensions:{width:source.width,height:source.height},sourceAlphaBounds:alphaBounds(source),nose:{x:Number(nose.x.toFixed(2)),y:Number(nose.y.toFixed(2)),pixels:nose.count},translation,normalized});
}
const reference=processed[0].normalized;
const regions={ears:{x:80,y:0,width:400,height:300},eyes:{x:150,y:250,width:240,height:105},nose:{x:270,y:315,width:100,height:75},whiskers:{x:280,y:310,width:225,height:115},muzzleAndMouth:{x:180,y:320,width:220,height:135}};
for(const item of processed)item.regionalDifferenceFromX=Object.fromEntries(Object.entries(regions).map(([name,region])=>[name,difference(reference,item.normalized,region)]));

const sheet=new PNG({width:canvas.width*4,height:canvas.height*2});
processed.forEach((item,index)=>{const column=index%4,row=Math.floor(index/4);for(let y=0;y<canvas.height;y++){const sourceStart=y*canvas.width*4,targetStart=((row*canvas.height+y)*sheet.width+column*canvas.width)*4;item.normalized.data.copy(sheet.data,targetStart,sourceStart,sourceStart+canvas.width*4);}});
write(path.join(outputDir,'jett-mouths-4x2.png'),sheet);
write(path.join(outputDir,'base','jett-base-X.png'),reference);
if(!fs.existsSync(recording))throw new Error('jett_intro_recording_missing');
fs.mkdirSync(path.join(outputDir,'audio'),{recursive:true});fs.copyFileSync(recording,path.join(outputDir,'audio','jett-intro.mp3'));

const wavFile=path.join(outputDir,'audio','jett-intro.wav');
const manifest={schemaVersion:1,character:'Jett',rowMajorOrder:states,grid:{columns:4,rows:2,frameWidth:canvas.width,frameHeight:canvas.height},anchor:{name:'nose',x:targetNose.x,y:targetNose.y},states:Object.fromEntries(processed.map((item,index)=>[item.state,{file:`frames/mouth-${item.state}.png`,row:Math.floor(index/4),column:index%4}])),rhubarb:{allowedMouthStates:states,extendedShapes:'GX',timingFile:'timing/jett-intro-mouth-cues.json'},audio:{sourceFile:'audio/jett-intro.mp3',sourceSha256:sha256(path.join(outputDir,'audio','jett-intro.mp3')),rhubarbFile:fs.existsSync(wavFile)?'audio/jett-intro.wav':null,rhubarbSha256:fs.existsSync(wavFile)?sha256(wavFile):null}};
fs.writeFileSync(path.join(outputDir,'manifest.json'),JSON.stringify(manifest,null,2));
const report={canvas,targetNose,frames:processed.map(({normalized,...item})=>item),regions,overlayAssessment:{safeForAutomaticExtraction:false,reason:'The inputs are whole-character redraws. Stable facial regions change between states, so a rectangular mouth overlay would introduce seams, ghosting, or overwrite original muzzle details. The normalized X frame is supplied as a stationary base; mouth overlays require manual redrawing/retouching against that base.'}};
fs.writeFileSync(path.join(outputDir,'alignment-report.json'),JSON.stringify(report,null,2));
const lines=['# Jett lip-sync asset report','','- Source: eight separate PNG frames (not a combined sheet).','- Row-major output: X, A, B, C / D, E, F, G.',`- Normalized frame size: ${canvas.width} × ${canvas.height}.`,`- Alignment anchor: nose at (${targetNose.x}, ${targetNose.y}).`,'- Originals were not modified.','','## Alignment translations','',...processed.map(item=>`- ${item.state}: source ${item.sourceDimensions.width}×${item.sourceDimensions.height}; translate (${item.translation.x}, ${item.translation.y}).`),'','## Overlay feasibility','',report.overlayAssessment.reason,'','See `alignment-report.json` for regional pixel-difference measurements.'];
fs.writeFileSync(path.join(outputDir,'alignment-report.md'),lines.join('\n'));
console.log(`Processed ${processed.length} frames into ${path.relative(root,outputDir)}.`);
