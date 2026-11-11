// sRGB art direction; light intensities are Three.js multipliers, distances world units.
// Sky stops run top → middle → horizon → lower cloud sea at 0 / .48 / .82 / 1.
const frame=(sky,cloudLight,cloudShade,fog,near,far,sun,kelvin,intensity,hemi,ground,ambient,night,cloudAlpha)=>({sky,cloudLight,cloudShade,fog,near,far,sun,kelvin,intensity,hemi,ground,ambient,night,cloudAlpha});
export const DEFAULT_PALETTE='c';
export const PALETTES={
 a:{name:'暖金黄昏',materials:{0:'#665972',1:'#6c8b48',2:'#e3cc9f',3:'#ffdfb3',4:'#237479',5:'#dba34b',6:'#604335',7:'#3a725a',10:'#53bcca',14:'#75605a',15:'#c77a39'},frames:[
  frame(['#283c75','#ba99aa','#ffd4a0','#b499b6'],'#ffdfbb','#6d78a6','#cbb3bc',90,205,'#ffd5a0',3900,3.0,'#b4c9f4','#483450',.95,.15,.83),
  frame(['#1e6cad','#7cbfd6','#d7e9df','#8bbbc8'],'#fff6df','#6b8eac','#b1d9dc',105,230,'#fff1d5',5600,3.1,'#b9e3f4','#4e5f65',1.15,0,.88),
  frame(['#162d60','#72789f','#ffb878','#ba8b99'],'#ffca87','#606b99','#d6a5a0',100,220,'#ffbb75',3100,3.6,'#8fa9db','#74677f',1.05,.4,.88),
  frame(['#070b23','#222c59','#675978','#303959'],'#a1afe4','#344064','#4c4a6d',100,215,'#d2ddff',8500,2.1,'#9aa9d5','#7c738d',1.25,1,.68)
 ]},
 b:{name:'清透晴空',materials:{0:'#6c747a',1:'#79a64a',2:'#eee2c4',3:'#fff1d6',4:'#218a85',5:'#cda451',6:'#645046',7:'#397956',10:'#4bcbd8',14:'#726b61',15:'#c48750'},frames:[
  frame(['#3269a6','#9ed5dd','#ffdfba','#97bdce'],'#fff0da','#749ab4','#bfdee1',110,240,'#ffe0bb',4700,2.6,'#c1e5f6','#415762',1.0,.15,.86),
  frame(['#076fbd','#53b9e7','#d8f4f1','#80c0dc'],'#ffffff','#688fb6','#b6e1ea',125,255,'#fff8e9',6200,3.5,'#c3eafa','#405969',1.1,0,.94),
  frame(['#17558b','#68a7c4','#f4cf9b','#80aec3'],'#ffe5bb','#5c88ab','#b4cdd5',115,245,'#ffd297',4200,3.2,'#a9daed','#667f93',1.1,.4,.9),
  frame(['#020c24','#103765','#436c8a','#1b405e'],'#98c3eb','#254c72','#315476',115,245,'#c3ddff',9200,1.7,'#6c9bc3','#526e86',.95,1,.67)
 ]},
 c:{name:'碧空琥珀',materials:{0:'#5b6b79',1:'#779752',2:'#e8d5b1',3:'#ffe7ba',4:'#197d7e',5:'#d8a344',6:'#594336',7:'#346e52',10:'#4ac6ce',14:'#736257',15:'#ca8245'},frames:[
  frame(['#19456d','#80b3bc','#f8d1a0','#8caab6'],'#ffe4ba','#547c99','#b5c7c8',105,235,'#ffdcaa',4200,3.0,'#acd6e7','#334458',.85,.15,.86),
  frame(['#0e609e','#54afcf','#c2e8e6','#76b6c9'],'#fff9e5','#578ba3','#acd6dd',120,250,'#fff0cd',5700,3.3,'#b0dfed','#36505b',1.0,0,.92),
  frame(['#103a65','#65a1b6','#f5c58b','#83adbb'],'#ffdda4','#527693','#c7d3cd',110,235,'#ffc985',3600,3.8,'#90c6dd','#6d7d8e',1.0,.4,.9),
  frame(['#010518','#0a1b36','#203b58','#11283b'],'#9ebcdd','#294663','#34546c',110,235,'#d3e1ff',8000,1.9,'#a2bdd3','#637b91',1.2,1,.68)
 ]}
};
export const paletteKey=value=>Object.hasOwn(PALETTES,value)?value:DEFAULT_PALETTE;
