// sRGB art direction; light intensities are Three.js multipliers, distances world units.
// Sky stops run top → deep blue → pale haze → cream → apricot; lightness only rises until the warm band.
// Positions 0 / .48 / .72 / .84 / .94 / 1 are interpolated in OKLCH.
const frame=(sky,cloudLight,cloudShade,near,far,sun,kelvin,intensity,hemi,ground,ambient,night,cloudAlpha)=>({sky,cloudLight,cloudShade,near,far,sun,kelvin,intensity,hemi,ground,ambient,night,cloudAlpha});
export const DEFAULT_PALETTE='c';
export const PALETTES={
 c:{name:'暮蓝杏金',materials:{0:'#5b6b79',1:'#779752',2:'#e8d5b1',3:'#ffe7ba',4:'#197d7e',5:'#d8a344',6:'#594336',7:'#346e52',10:'#4ac6ce',14:'#736257',15:'#ca8245'},frames:[
  frame(['#4e6fa6','#86a6cf','#bccfe0','#efe3d6','#f6cdbb','#f2bbaa'],'#fff1e6','#93a5c8',105,235,'#ffdcaa',4200,3.0,'#acd6e7','#334458',.85,.15,1),
  frame(['#4f8fd0','#6aa5dc','#8fbde8','#a9cdee','#c3dcf2','#cfe3f4'],'#ffffff','#9db6d4',120,250,'#fff0cd',5700,3.3,'#b0dfed','#36505b',1.0,0,1),
  frame(['#1b3358','#3f6a93','#adc6dc','#f1ddc0','#f3c092','#f0ab84'],'#fff0dc','#7f93bd',110,235,'#ffc985',3600,3.8,'#90c6dd','#6d7d8e',1.0,.4,1),
  frame(['#0c1530','#1f2a5a','#7a4a8c','#cc4f58','#d9774a','#b85a3c'],'#f0b8a0','#3b4670',110,235,'#ff9a6b',2600,2.2,'#7f8fc0','#5a5570',1.05,.7,1),
  frame(['#070c1d','#0d1833','#152647','#1d355c','#27456f','#2b4c78'],'#7189b3','#17233f',110,235,'#d3e1ff',8000,1.9,'#a2bdd3','#637b91',1.2,1,1)
 ]}
};
export const paletteKey=value=>Object.hasOwn(PALETTES,value)?value:DEFAULT_PALETTE;
