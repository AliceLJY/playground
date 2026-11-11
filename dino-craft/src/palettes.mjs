// Authored colors are sRGB HEX. Three converts lighting and tints to linear space.
export const PALETTE = {
  name:'晴朗正午的侏罗纪岛',
  sky:{zenith:'#3E8EDB',middle:'#68ACE2',horizon:'#BFE3F2',nightTop:'#0E1A33',nightHorizon:'#23385A'},
  sun:'#FFE7B0',moon:'#9DBFF2',ambient:'#9CC4E8',shadow:'#6B523E',hemi:3.0,direct:1.7,
  cloud:'#FFF5DF',lamp:'#FFD48A',
  texture:{
    grassTop:['#5E9A35',5],grassSide:['#8A5A34',6],dirt:['#8A5A34',7],stone:['#8C8F8A',7],
    sand:['#E2C98A',5],logEnd:['#B58C59',6],log:['#6B4A2B',6],plank:['#BA925A',6],
    leaf:['#3F7F2E',3],fern:['#4E8F3A',3],pine:['#2E5E3A',3],water:['#2F8FB0',3],
    amber:['#DFA44D',7],ore:['#6F939A',7]
  },
  grassLight:'#7FB043',leafShades:['#2F6B26','#3F7F2E','#528F32','#6FA83D'],pineLight:'#3D7046',
  zones:{wet:'#4C8A34',slope:'#7A9A3E',shore:'#A3B356'},
  waterSpecular:'#A2D9E5',nightWater:'#47758E',
  rex:{skin:'#A4452B',dark:'#612E25',belly:'#D9B48A',eye:'#F8CE75'},
  grazer:{skin:'#6C8F9E',head:'#7C9EAB',dark:'#354F60',plate:'#4E6F7D',tail:'#6C8F9E'},
  ptero:{skin:'#B5683E',head:'#C98B52',beak:'#E3BE7B',crest:'#8B402A',wing:'#B5683E',wingDark:'#84452F',spar:'#D3AA71'}
};
