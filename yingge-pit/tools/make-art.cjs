// Bake the game art from the short film's layers. Run by hand when the source art changes (not part of CI):
//   NODE_PATH="$(npm root -g)" node tools/make-art.cjs [film-assets-dir]
// Needs an existing Playwright install and Google Chrome. The film's files are only read, never written.
// Writes assets/stage-back.webp, stage-front.webp, puppet-A/B/C.webp, gong.webp, ball.webp.
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path');
const SRC=process.argv[2]||'/Volumes/ColdData/产出/2026-10-21-英歌小戏台/assets';
const OUT=path.join(__dirname,'..','assets');
const BG_SCALE=5/6,PUPPET_SCALE=0.6;      // the game draws the stage ~720-900 px wide on phones; puppets ~320 design px tall

// Runs in the page. Everything is in the film's 1080x1920 design coordinates.
async function bake({src,bgScale,puppetScale}){
  const load=n=>new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(new Error('missing '+n));i.src='file://'+src+'/'+n;});
  const L={};
  for(const n of ['backdrop-default','wings','papercuts','drapes-open','valance-embroidery','lintel-carving','pillars-carving','ridge-mosaic',
    'floor-pit-front','lanterns-lit','box-sides','lid-inner','gong','ball'])L[n]=await load('stage-layers/'+n+'.png');
  const P={A:await load('puppets/A.png'),B:await load('puppets/B.png'),C:await load('puppets/C.png')};
  const canvas=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return[c,c.getContext('2d')];};
  const out={};
  // ---- back: everything behind the boss. The film's 64 px pit (1312-1376) is deepened to 1312-1500 so the boss has room to climb.
  const TOP=200,BOT=1500,FLOOR=1272,PIT=1312;
  {
    const [c,g]=canvas(1080,BOT-TOP);g.translate(0,-TOP);
    for(const n of ['lid-inner','box-sides','backdrop-default','wings','papercuts','drapes-open','valance-embroidery','lintel-carving','pillars-carving','ridge-mosaic'])g.drawImage(L[n],0,0);
    // light the stage the way the film's lit frame does: warm glow on the backdrop, footlight spill, darker corners
    g.save();g.beginPath();g.rect(186,582,708,690);g.clip();
    let r=g.createRadialGradient(540,1010,40,540,980,560);r.addColorStop(0,'rgba(255,170,80,0.55)');r.addColorStop(0.55,'rgba(230,110,50,0.22)');r.addColorStop(1,'rgba(0,0,0,0)');
    g.globalCompositeOperation='screen';g.fillStyle=r;g.fillRect(186,582,708,690);
    g.globalCompositeOperation='source-over';r=g.createLinearGradient(0,1060,0,1272);r.addColorStop(0,'rgba(255,200,120,0)');r.addColorStop(1,'rgba(255,190,110,0.22)');g.fillStyle=r;g.fillRect(186,1060,708,212);
    r=g.createLinearGradient(0,582,0,760);r.addColorStop(0,'rgba(10,4,2,0.45)');r.addColorStop(1,'rgba(10,4,2,0)');g.fillStyle=r;g.fillRect(186,582,708,180);
    g.restore();
    // the deep pit: stretch the film's dark pit strip, then add side walls and a faint glow from below
    g.drawImage(L['box-sides'],0,1300,1080,76,0,1300,1080,BOT-1300);
    g.drawImage(L['floor-pit-front'],76,PIT,928,64,76,PIT,928,BOT-PIT);
    r=g.createLinearGradient(0,PIT,0,BOT);r.addColorStop(0,'#0c0604');r.addColorStop(0.7,'#140a06');r.addColorStop(1,'#2a1408');g.fillStyle=r;g.fillRect(112,PIT,856,BOT-PIT);
    g.strokeStyle='rgba(120,70,30,0.35)';g.lineWidth=3;for(let x=150;x<960;x+=96){g.beginPath();g.moveTo(x,PIT+6);g.lineTo(x,BOT);g.stroke();}
    g.drawImage(L['floor-pit-front'],0,0,1080,PIT,0,0,1080,PIT);       // the stage floor strip and its front edge
    g.drawImage(L['lanterns-lit'],0,0);                                // lanterns hang off the stage edge, at the back wall of the pit
    g.globalCompositeOperation='lighter';
    for(const x of [252,432,648,828]){r=g.createRadialGradient(x,1350,6,x,1350,120);r.addColorStop(0,'rgba(255,190,110,0.35)');r.addColorStop(1,'rgba(255,190,110,0)');g.fillStyle=r;g.fillRect(x-130,1220,260,260);}
    g.globalCompositeOperation='source-over';
    const [o,og]=canvas(Math.round(1080*bgScale),Math.round((BOT-TOP)*bgScale));og.imageSmoothingQuality='high';og.drawImage(c,0,0,o.width,o.height);
    out['stage-back']={data:o.toDataURL('image/webp',0.86),w:o.width,h:o.height,top:TOP,bottom:BOT};
  }
  // ---- front: the pit's front panel (film 1376-1485) moved down to 1500-1609, with the box sides beside it
  {
    const h=109,[c,g]=canvas(1080,h);
    g.drawImage(L['box-sides'],0,1376,1080,h,0,0,1080,h);
    g.drawImage(L['floor-pit-front'],0,1376,1080,h,0,0,1080,h);
    const r=g.createLinearGradient(0,0,0,h);r.addColorStop(0,'rgba(255,200,120,0.18)');r.addColorStop(1,'rgba(0,0,0,0.25)');g.fillStyle=r;g.fillRect(76,0,928,h);
    const [o,og]=canvas(Math.round(1080*bgScale),Math.round(h*bgScale));og.imageSmoothingQuality='high';og.drawImage(c,0,0,o.width,o.height);
    out['stage-front']={data:o.toDataURL('image/webp',0.9),w:o.width,h:o.height,top:1500};
  }
  // ---- puppets: the whole part sheet, scaled; rigs.js coordinates are multiplied by the same factor in src/rigs.js
  for(const k of ['A','B','C']){
    const [o,og]=canvas(Math.round(1024*puppetScale),Math.round(1536*puppetScale));og.imageSmoothingQuality='high';og.drawImage(P[k],0,0,o.width,o.height);
    out['puppet-'+k]={data:o.toDataURL('image/webp',0.88),w:o.width,h:o.height};
  }
  // ---- props cropped to their opaque bounds at full size
  for(const [n,box] of [['gong',[633,707,254,316]],['ball',[482,1042,116,116]]]){
    const [o,og]=canvas(box[2],box[3]);og.drawImage(L[n],box[0],box[1],box[2],box[3],0,0,box[2],box[3]);
    out[n]={data:o.toDataURL('image/webp',0.92),w:o.width,h:o.height,box};
  }
  return out;
}

(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true,args:['--allow-file-access-from-files']});
  const page=await browser.newPage();await page.goto('file://'+path.join(SRC,'README.md'));
  const out=await page.evaluate(bake,{src:SRC,bgScale:BG_SCALE,puppetScale:PUPPET_SCALE});
  fs.mkdirSync(OUT,{recursive:true});
  for(const [name,o] of Object.entries(out)){
    const buf=Buffer.from(o.data.split(',')[1],'base64');fs.writeFileSync(path.join(OUT,name+'.webp'),buf);
    const {data,...rest}=o;console.log(name+'.webp',buf.length,'bytes',JSON.stringify(rest));
  }
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
