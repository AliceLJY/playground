// sRGB art direction; light intensities are Three.js multipliers, distances world units.
// Sky stops run top → blue middle → bright boundary → peach horizon → cloud bed.
// Positions 0 / .48 / .72 / .84 / .94 / 1 are interpolated in OKLCH.
const frame=(sky,cloudLight,cloudShade,near,far,sun,kelvin,intensity,hemi,ground,ambient,night,cloudAlpha)=>({sky,cloudLight,cloudShade,near,far,sun,kelvin,intensity,hemi,ground,ambient,night,cloudAlpha});
export const DEFAULT_PALETTE='c';
export const PALETTES={
 c:{name:'碧空琥珀',materials:{0:'#5b6b79',1:'#779752',2:'#e8d5b1',3:'#ffe7ba',4:'#197d7e',5:'#d8a344',6:'#594336',7:'#346e52',10:'#4ac6ce',14:'#736257',15:'#ca8245'},frames:[
  frame(['#244e9b','#739eea','#a8b9ff','#ddadf2','#ffbf9a','#ffaf90'],'#fff2de','#a8b4d6',105,235,'#ffdcaa',4200,3.0,'#acd6e7','#334458',.85,.15,.86),
  frame(['#2f78d8','#68a4ed','#94c4f7','#b0d7fa','#cde6fa','#cde6fa'],'#fff2de','#a8b4d6',120,250,'#fff0cd',5700,3.3,'#b0dfed','#36505b',1.0,0,.92),
  frame(['#1f4fa8','#4d8fe0','#8ebbff','#c8adff','#ffc796','#ffb38a'],'#fff2de','#a8b4d6',110,235,'#ffc985',3600,3.8,'#90c6dd','#6d7d8e',1.0,.4,.9),
  frame(['#0b1530','#142349','#19294f','#1c2c54','#1e2e58','#1e2e58'],'#9ebcdd','#253760',110,235,'#d3e1ff',8000,1.9,'#a2bdd3','#637b91',1.2,1,.68)
 ]}
};
export const paletteKey=value=>Object.hasOwn(PALETTES,value)?value:DEFAULT_PALETTE;
