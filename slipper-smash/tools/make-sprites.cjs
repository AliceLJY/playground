// Cut the white studio background out of the roach reference art and write game sprites.
// Run by hand when the source art changes (not part of CI):
//   NODE_PATH="$(npm root -g)" node tools/make-sprites.cjs <roach-front.png> <roach-back.png>
// Needs an existing Playwright install and Google Chrome. Writes assets/roach-front.webp and assets/roach-back.webp.
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path');
const [front,back]=process.argv.slice(2);
if(!front||!back){console.error('usage: make-sprites.cjs <front.png> <back.png>');process.exit(2);}
const OUT=path.join(__dirname,'..','assets');

function cut(dataUrl,size){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>{
      const w=img.width,h=img.height,c=document.createElement('canvas');c.width=w;c.height=h;
      const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(img,0,0);
      const im=g.getImageData(0,0,w,h),d=im.data,bg=new Uint8Array(w*h);
      const white=i=>Math.min(d[i*4],d[i*4+1],d[i*4+2])>=236;
      // flood from the border: only background connected to the frame is removed, highlights on the shell stay
      const q=new Int32Array(w*h);let qh=0,qt=0;
      const push=i=>{if(!bg[i]&&white(i)){bg[i]=1;q[qt++]=i;}};
      for(let x=0;x<w;x++){push(x);push((h-1)*w+x);}
      for(let y=0;y<h;y++){push(y*w);push(y*w+w-1);}
      while(qh<qt){const i=q[qh++],x=i%w,y=(i/w)|0;if(x>0)push(i-1);if(x<w-1)push(i+1);if(y>0)push(i-w);if(y<h-1)push(i+w);}
      // the studio floor under the claws is enclosed white that the flood cannot reach; nothing on the insect is that bright down there
      for(let y=Math.floor(h*0.9);y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(Math.min(d[i*4],d[i*4+1],d[i*4+2])>=215)bg[i]=1;}
      // soft edge: pixels within 2px of removed background get alpha from how white they are, with white spill removed
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const i=y*w+x;if(bg[i]){d[i*4+3]=0;continue;}
        let near=false;
        for(let dy=-2;dy<=2&&!near;dy++)for(let dx=-2;dx<=2;dx++){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=w||yy>=h||bg[yy*w+xx]){near=true;break;}}
        if(!near)continue;
        const m=Math.min(d[i*4],d[i*4+1],d[i*4+2]);
        const a=Math.max(0,Math.min(1,(244-m)/90));
        if(a<=0.02){d[i*4+3]=0;continue;}
        for(let k=0;k<3;k++)d[i*4+k]=Math.max(0,Math.min(255,(d[i*4+k]-(1-a)*255)/a));
        d[i*4+3]=Math.round(a*255);
      }
      g.putImageData(im,0,0);
      // trim to the opaque bounds, then scale so the longer side is `size`
      let x0=w,y0=h,x1=0,y1=0;
      for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(d[(y*w+x)*4+3]>8){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}
      const bw=x1-x0+1,bh=y1-y0+1,s=size/Math.max(bw,bh),o=document.createElement('canvas');
      o.width=Math.round(bw*s);o.height=Math.round(bh*s);
      const og=o.getContext('2d');og.imageSmoothingQuality='high';og.drawImage(c,x0,y0,bw,bh,0,0,o.width,o.height);
      resolve({url:o.toDataURL('image/webp',0.9),w:o.width,h:o.height});
    };
    img.onerror=()=>reject(new Error('image failed to load'));img.src=dataUrl;
  });
}

(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage();
  for(const [src,name] of [[front,'roach-front'],[back,'roach-back']]){
    const url='data:image/png;base64,'+fs.readFileSync(src).toString('base64');
    const r=await page.evaluate(`(${cut.toString()})(${JSON.stringify(url)},560)`);
    const file=path.join(OUT,name+'.webp');
    fs.writeFileSync(file,Buffer.from(r.url.split(',')[1],'base64'));
    console.log(name,r.w+'x'+r.h,fs.statSync(file).size,'bytes');
  }
  // contact sheet on a dark background, to read the edges by eye
  await page.setViewportSize({width:1200,height:640});
  const imgs=['roach-front','roach-back'].map(n=>'data:image/webp;base64,'+fs.readFileSync(path.join(OUT,n+'.webp')).toString('base64'));
  await page.setContent('<body style="margin:0;background:#16202a;display:flex;gap:20px;align-items:center;justify-content:center;height:640px">'+imgs.map(u=>'<img src="'+u+'" style="height:600px">').join('')+'<div style="background:#c33;height:600px;display:flex;align-items:center"><img src="'+imgs[0]+'" style="height:300px"></div></body>');
  await page.screenshot({path:(fs.mkdirSync(path.join(OUT,'..','check-out'),{recursive:true}),path.join(OUT,'..','check-out','sprites.png'))});
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
