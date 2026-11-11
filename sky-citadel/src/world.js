// Deterministic sculpting on a 0.22-unit grid. Only exposed faces survive meshing.
export const CELL = .22;
export const P = {rock:0,grass:1,stone:2,trim:3,roof:4,gold:5,wood:6,leaf:7,light:8,glass:9,water:10,flower:11,flag:12,crystal:13,soil:14,copper:15};
export const PALETTE = ['#68677e','#72866a','#d9d0b8','#eee0bd','#347e82','#cfaa61','#725b51','#507d72','#ffc17a','#283c52','#86d4dc','#d89a9c','#a85853','#9cc9e1','#888077','#bf7b55'];
export function hash(x,y,z,seed=731){let h=Math.imul(x,374761393)^Math.imul(y,668265263)^Math.imul(z,2147483647)^seed;h=Math.imul(h^(h>>>13),1274126177);return((h^(h>>>16))>>>0)/4294967296;}
export const key=(x,y,z)=>(x+512)*524288+(y+256)*1024+z+512;
export function unpack(k){const x=Math.floor(k/524288)-512;const rem=k-(x+512)*524288;const y=Math.floor(rem/1024)-256;return[x,y,rem-(y+256)*1024-512];}
export class Grid{
 constructor(){this.cells=new Map();}
 set(x,y,z,m){this.cells.set(key(Math.round(x),Math.round(y),Math.round(z)),m);}
 get(x,y,z){return this.cells.get(key(x,y,z));}
 has(x,y,z){return this.cells.has(key(x,y,z));}
 del(x,y,z){this.cells.delete(key(x,y,z));}
 box(x0,x1,y0,y1,z0,z1,m,pred){for(let x=Math.ceil(x0);x<=x1;x++)for(let y=Math.ceil(y0);y<=y1;y++)for(let z=Math.ceil(z0);z<=z1;z++)if(!pred||pred(x,y,z))this.set(x,y,z,typeof m==='function'?m(x,y,z):m);}
}
function island(g,cx,cz,r,rz,top,depth,seed){
 for(let y=top-depth;y<=top;y++){const t=(y-(top-depth))/depth,rad=r*Math.pow(t,.64);for(let x=Math.floor(cx-r-3);x<=cx+r+3;x++)for(let z=Math.floor(cz-rz-3);z<=cz+rz+3;z++){
 const a=Math.atan2((z-cz)/rz,(x-cx)/r),edge=1+.055*Math.sin(a*7+seed)+.03*Math.cos(a*11-y*.18);
 if(((x-cx)**2+(z-cz)**2*(r/rz)**2)<(rad*edge)**2){let m=y===top?P.grass:y>top-3?P.soil:P.rock;if(y<top-9&&Math.floor(y/6)%3===0&&hash(x,y,z,seed)>.3)m=P.soil;g.set(x,y,z,m);}
 }}
 // Hanging roots snake independently of the rock outline.
 for(let j=0;j<11;j++){const a=j*2.399,r0=r*(.58+.22*hash(j,0,0,seed));let xx=cx+Math.cos(a)*r0,zz=cz+Math.sin(a)*r0*rz/r;for(let y=top-8;y>top-depth*.85;y--){xx+=Math.sin(y*.22+j)*.12;zz+=Math.cos(y*.16+j)*.13;g.set(xx,y,zz,P.wood);if(y>top-depth*.4)g.set(xx+1,y,zz,P.wood);}}
 for(let j=0;j<8;j++){const a=j*2.4,rr=r*.7,x=cx+Math.cos(a)*rr,z=cz+Math.sin(a)*rr*rz/r,y=top-depth*.38;g.box(x-1,x+1,y-4,y+4,z-1,z+1,P.crystal,(xx,yy,zz)=>Math.abs(xx-x)+Math.abs(zz-z)<2.6-Math.abs(yy-y)*.3);}
}
function round(g,x,z,r,y0,y1,m,shell=0){g.box(x-r,x+r,y0,y1,z-r,z+r,m,(xx,y,zz)=>{const d=(xx-x)**2+(zz-z)**2;return d<=r*r&&(!shell||d>=(r-shell)**2);});}
function tree(g,x,z,y,s=1,seed=731){g.box(x,x+1,y,y+10*s,z,z+1,P.wood);for(let yy=0;yy<15*s;yy++){const r=6*s*(1-yy/(18*s));g.box(x-r,x+r,y+5*s+yy,y+5*s+yy,z-r,z+r,P.leaf,(xx,_,zz)=>(xx-x)**2+(zz-z)**2<r*r*(.8+.25*hash(xx,yy,zz,seed)));}}
function lamp(g,x,z,y){g.box(x,x,y,y+6,z,z,P.wood);g.box(x-1,x+1,y+6,y+8,z-1,z+1,P.gold);g.box(x,x,y+6,y+7,z-1,z+1,P.light);g.box(x-1,x+1,y+6,y+7,z,z,P.light);g.set(x,y+9,z,P.gold);}
function windowArch(g,axis,c,plane,base,width=3,height=11){
 const arch=(u,v)=>Math.abs(u)<=width&&v>=0&&v<=height&&(v<height-width||(u*u+(v-(height-width))**2<=width*width));
 for(let u=-width-1;u<=width+1;u++)for(let v=-1;v<=height+1;v++){
 const inside=arch(u,v),edge=!inside&&(arch(u-1,v)||arch(u+1,v)||arch(u,v-1)||arch(u,v+1));
 for(let d=0;d<3;d++){const xx=axis==='z'?c+u:plane-d,zz=axis==='z'?plane-d:c+u;if(inside){if(d<2)g.del(xx,base+v,zz);else g.set(xx,base+v,zz,(u===0||v===4||v===8)?P.gold:P.light);}else if(edge&&d===0)g.set(xx,base+v,zz,P.trim);}
 }
}
function tower(g,x,z,base,height=45,r=6){
 round(g,x,z,r+1,base,base+2,P.trim);round(g,x,z,r,base+3,base+height,P.stone,2);
 for(let yy=base+7;yy<base+height;yy+=12)round(g,x,z,r+1,yy,yy+1,P.trim,2);
 windowArch(g,'z',x,z+r,base+height-18,2,9);windowArch(g,'x',z,x+r,base+height-18,2,9);
 for(let yy=0;yy<22;yy++){const rr=Math.max(.5,(r+3)*(1-yy/22));round(g,x,z,rr,base+height+yy,base+height+yy,yy%8===0?P.gold:P.roof);}
 g.box(x,x,base+height+22,base+height+28,z,z,P.gold);
}
function house(g,x,z,w,d,h,roof=P.roof){g.box(x-w,x+w,2,2+h,z-d,z+d,P.stone,(xx,yy,zz)=>Math.abs(xx-x)>w-2||Math.abs(zz-z)>d-2||yy===2);g.box(x-w-1,x+w+1,2+h,3+h,z-d-1,z+d+1,P.trim);
 for(let yy=0;yy<w+3;yy++)g.box(x-w-2+yy,x+w+2-yy,4+h+yy,4+h+yy,z-d-2,z+d+2,roof);
 windowArch(g,'z',x,z+d,4,2,7);g.box(x-1,x+1,2,6,z+d,z+d,P.wood);g.box(x+w-2,x+w-1,h+6,h+13,z-d+2,z-d+3,P.stone);
}
function bridge(g,ax,az,bx,bz,y,suspension=false){const dx=bx-ax,dz=bz-az,n=Math.ceil(Math.hypot(dx,dz)),len=Math.hypot(dx,dz),nx=-dz/len,nz=dx/len;
 for(let i=0;i<=n;i++){const t=i/n,xx=ax+dx*t,zz=az+dz*t,yy=y+(suspension?-Math.sin(t*Math.PI)*3:0);
 for(let w=-3;w<=3;w++){g.set(xx+nx*w,yy,zz+nz*w,suspension?P.wood:P.stone);if(!suspension&&i%n>3&&i<n-3){const bottom=y-3-Math.sin(t*Math.PI)*7;for(let h=bottom;h<yy;h++)if(h>y-5||Math.abs(w)>1)g.set(xx+nx*w,h,zz+nz*w,P.stone);}}
 for(const side of[-1,1]){if(i%4===0)g.box(xx+nx*4*side,xx+nx*4*side,yy+1,yy+5,zz+nz*4*side,zz+nz*4*side,P.trim);g.set(xx+nx*4*side,yy+5,zz+nz*4*side,suspension?P.wood:P.trim);}
 }return{a:[ax*CELL,y*CELL,az*CELL],b:[bx*CELL,y*CELL,bz*CELL],suspension};}
export function generateWorld(seed=731){const g=new Grid(),meta={seed,satellites:[],bridges:[],waterfall:[28*CELL,0,42*CELL],landmarks:{}};
 island(g,0,0,61,49,0,66,seed);
 // Courtyard cut-stone inlaid paths; vegetation grows in the other cells.
 for(let x=-58;x<=58;x++)for(let z=-47;z<=47;z++)if(g.has(x,0,z)){
 const radial=Math.hypot(x,z*.95);if(Math.abs(x)<5||Math.abs(z-23)<4||radial>44&&radial<49||radial<30)g.set(x,1,z,(x+z)%7===0?P.trim:P.stone);
 else if(hash(x,1,z,seed)>.975){g.set(x,1,z,P.leaf);g.set(x,2,z,P.flower);}
 }
 // Lower ring, open gate and crenellations carved by polar angle.
 for(let y=2;y<=12;y++)for(let x=-58;x<=58;x++)for(let z=-48;z<=48;z++){const r=Math.hypot(x,z*1.12);if(r>51&&r<54&&g.has(x,0,z)&&!(Math.abs(x)<5&&z>0)&&!(x>25&&x<35&&z>35)&&!(Math.abs(z)<5&&Math.abs(x)>48)&&(y<10||Math.floor(Math.atan2(z,x)*36)%3!==0))g.set(x,y,z,y===9?P.trim:P.stone);}
 // Raised acropolis terrace, monumental central stairs and balustrade.
 round(g,0,-12,31,2,17,P.stone);round(g,0,-12,32,16,18,P.trim);
 for(let j=0;j<16;j++)g.box(-7,7,j+2,j+2,13+(15-j),15+(15-j),P.trim);
 for(let x=-29;x<=29;x++)for(const z of[-29,16]){if(z===16&&Math.abs(x)<9)continue;if(x%4===0)g.box(x,x,19,22,z,z,P.trim);g.set(x,23,z,P.trim);}
 // Main hall hollow shell, layered cornices, buttresses and real inset arched windows.
 g.box(-20,20,19,54,-26,10,P.stone,(x,y,z)=>Math.abs(x)>17||z<-23||z>7||y===19||y===54);
 for(const y of[20,25,50,54,56])g.box(-21,21,y,y,-27,11,P.trim,(x,_,z)=>Math.abs(x)>=19||z<=-25||z>=9);
 for(let x=-18;x<=18;x+=12){g.box(x-1,x+1,19,51,11,13,P.trim);windowArch(g,'z',x+6,10,31,3,13);}
 for(let z=-19;z<=5;z+=12)windowArch(g,'x',z,20,30,3,14);
 // Grand portal and stepped gold-edged gable.
 windowArch(g,'z',0,12,20,4,15);for(let i=0;i<12;i++)g.box(-14+i,14-i,57+i,57+i,8,12,i%3===0?P.gold:P.trim);
 round(g,0,-9,19,55,62,P.trim,3);
 for(let y=0;y<=20;y++){const rr=Math.sqrt(Math.max(0,19*19-(y*.92)**2));round(g,0,-9,rr,63+y,63+y,P.roof);for(let a=0;a<12;a++){const angle=a*Math.PI/6;g.set(Math.cos(angle)*rr,63+y,-9+Math.sin(angle)*rr,P.gold);}}
 round(g,0,-9,4,83,91,P.trim,2);for(let x=-1;x<=1;x++)g.box(x,x,85,89,-5,-5,P.light);for(let y=0;y<9;y++)round(g,0,-9,Math.max(.5,5-y*.6),92+y,92+y,P.roof);g.box(0,0,100,107,-9,-9,P.gold);g.box(-2,2,104,104,-9,-9,P.gold);
 for(const x of[-25,25])for(const z of[-29,9])tower(g,x,z,18,z<0?46:38,5);
 // Lower city: differently scaled row houses, stairs, herb gardens, lanterns.
 for(const [x,z,w,d,h]of[[-36,12,6,7,14],[37,5,6,8,15],[-27,31,7,6,12],[20,31,6,6,12],[39,-21,6,7,13],[-39,-19,6,7,12],[-12,35,5,6,10]])house(g,x,z,w,d,h);
 for(const[x,z,s]of[[-44,27,1],[43,24,.8],[-43,-32,.9],[32,-36,.9],[-24,-40,.8],[-7,-40,.7],[47,-5,.8],[-48,1,.75]])tree(g,x,z,1,s,seed);
 for(const [x,z]of[[-10,27],[10,27],[-31,23],[31,23],[-45,-8],[45,-8],[-32,-29],[32,-29]])lamp(g,x,z,2);
 // Water emerges from a small grotto into a voxel channel, then leaves the island.
 for(let z=19;z<=44;z++){const xx=28+Math.sin(z*.18)*2;g.box(xx-4,xx+4,1,2,z,z,P.trim);g.box(xx-2,xx+2,3,3,z,z,P.water);}
 g.box(23,34,4,10,18,22,P.stone,(x,y)=>!(Math.abs(x-28)<3&&y<8));
 const sats=[[-91,12,15,13,'Windmill garden'],[84,26,17,14,'Watchkeeper’s isle'],[63,-65,14,12,'Star observatory'],[-65,-64,13,12,'Quiet orchard']];
 for(let i=0;i<sats.length;i++){const[x,z,r,rz,name]=sats[i];island(g,x,z,r,rz,0,25+i*2,seed+i);meta.satellites.push({x:x*CELL,z:z*CELL,name});
 if(i===1)tower(g,x,z,1,22,4);else if(i===2){round(g,x,z,7,1,13,P.stone,2);for(let yy=0;yy<9;yy++)round(g,x,z,Math.sqrt(Math.max(0,64-yy*yy)),14+yy,14+yy,P.roof);g.box(x,x,23,28,z,z,P.gold);}else{tree(g,x-4,z-1,1,.9,seed+i);house(g,x+4,z+3,4,4,7,i===0?P.copper:P.roof);}
 lamp(g,x-5,z+6,1);
 const ang=Math.atan2(z,x),ax=Math.cos(ang)*53,az=Math.sin(ang)*45,bx=x-Math.cos(ang)*(r-2),bz=z-Math.sin(ang)*(rz-2);meta.bridges.push(bridge(g,ax,az,bx,bz,3,i%2===0));
 }
 // One-cell finials, banners on separate animated instanced geometry in main.js.
 meta.flags=[[-25,84,9],[25,84,9],[-25,92,-29],[25,92,-29]].map(v=>v.map(n=>n*CELL));
 meta.landmarks={palace:[0,12,-1],waterfall:meta.waterfall,bridge:meta.bridges[1].b,island:[sats[0][0]*CELL,1,sats[0][1]*CELL]};
 meta.voxelCount=g.cells.size;return{grid:g,meta};
}
// Face winding is outward; tangent coordinates support three-neighbour corner AO.
export const FACES=[
 {n:[1,0,0],u:[0,0,-1],v:[0,1,0]}, {n:[-1,0,0],u:[0,0,1],v:[0,1,0]},
 {n:[0,1,0],u:[1,0,0],v:[0,0,-1]}, {n:[0,-1,0],u:[1,0,0],v:[0,0,1]},
 {n:[0,0,1],u:[1,0,0],v:[0,1,0]}, {n:[0,0,-1],u:[-1,0,0],v:[0,1,0]}
];
export function surfaceFaces(grid,visitor){let count=0;for(const[k,m]of grid.cells){const[x,y,z]=unpack(k);for(const f of FACES){if(grid.has(x+f.n[0],y+f.n[1],z+f.n[2]))continue;count++;if(visitor)visitor(x,y,z,m,f);}}return count;}
export function cornerAO(g,x,y,z,f,su,sv){const p=[x+f.n[0],y+f.n[1],z+f.n[2]],u=f.u,v=f.v;const a=g.has(p[0]+u[0]*su,p[1]+u[1]*su,p[2]+u[2]*su),b=g.has(p[0]+v[0]*sv,p[1]+v[1]*sv,p[2]+v[2]*sv),c=g.has(p[0]+u[0]*su+v[0]*sv,p[1]+u[1]*su+v[1]*sv,p[2]+u[2]*su+v[2]*sv);return a&&b?.52:1-.16*(a+b+c);}
