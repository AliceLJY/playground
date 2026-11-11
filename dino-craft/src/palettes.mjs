// Authored colors are sRGB HEX. Three converts lighting and tints to linear space.
export const PALETTE = {
  name:'晴朗的侏罗纪岛 · 沉稳版',
  sky:{zenith:'#1F4F8F',middle:'#4F88C0',horizon:'#AFCFE4',nightTop:'#0E1A33',nightHorizon:'#23385A'},
  sun:'#FFE7B0',moon:'#9DBFF2',ambient:'#9CC4E8',shadow:'#6B523E',hemi:2.3,direct:2.4,
  cloud:'#FFF5DF',lamp:'#FFD48A',
  texture:{
    grassTop:['#4E8A3C',5],grassSide:['#8A5A34',6],dirt:['#8A5A34',7],stone:['#8C8F8A',7],
    sand:['#E2C98A',5],logEnd:['#B58C59',6],log:['#6B4A2B',6],plank:['#BA925A',6],
    leaf:['#37702F',3],fern:['#447F3D',3],pine:['#27513A',3],water:['#2E7FA6',3],
    amber:['#DFA44D',7],ore:['#6F939A',7]
  },
  grassLight:'#679F47',leafShades:['#2A5E2C','#37702F','#4A8236','#5E963E'],pineLight:'#356446',
  zones:{wet:'#3F7A3A',slope:'#6C8F45',shore:'#94A85C'},
  waterSpecular:'#A2D9E5',nightWater:'#47758E',
  rex:{skin:'#9A4A33',dark:'#5C2F27',belly:'#D9B48A',eye:'#F8CE75'},
  grazer:{skin:'#5E7E8C',head:'#6E8D9A',dark:'#30485A',plate:'#44616E',tail:'#5E7E8C'},
  ptero:{skin:'#B5683E',head:'#C98B52',beak:'#E3BE7B',crest:'#8B402A',wing:'#B5683E',wingDark:'#84452F',spar:'#D3AA71'}
};
