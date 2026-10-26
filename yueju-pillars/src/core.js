// 粤剧六柱测试的题目、结果、来源与计分。没有 DOM，Node 里也能跑，测试直接读这里。
// 事实依据与核对状态见 SPEC.md 第 4 节；拿不准的事实不进这个文件（见 WITHHELD）。
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PillarCore=factory();})(typeof self!=='undefined'?self:this,function(){
'use strict';

// 六柱。hook 是分享图上那条冷知识在 facts 里的序号。id 用拼音首字母，顺序就是剧团里通常的排法，也是「看看其他五根柱」的列出顺序。
const PILLARS=[
  {id:'wms',name:'文武生',label:'撑全场的那根柱',color:'#1F4FA8',hook:3,
   portrait:'什么都扛得起，关键时刻你是顶上去的那个。讲道理讲得通，真动手也不怵。大家习惯了把戏份最重的那部分交给你。',
   facts:[
     {t:'剧团的第一男主角。不管戏里的人物原本属于哪个行当，只要是戏份最重的男主角，就由文武生来演。',src:['S3','S7']},
     {t:'传统的十大行当里本来没有「文武生」，这是后来才有的叫法，到了六柱制，成了剧团第一男主角的称呼。',src:['S3','R1']},
     {t:'讲究「可文可武，文武兼备」，以平喉演唱为主。',src:['S7']},
     {t:'女演员也演文武生，叫「坤生」。最有名的任剑辉就是女文武生，和白雪仙一起撑起了仙凤鸣剧团。',src:['S8','S11']}
   ],
   role:'周世显（驸马）'},
  {id:'xs',name:'小生',label:'文气的那根柱',color:'#6A4FD0',hook:1,
   portrait:'斯文、讲究、心细。你在意表达的分寸，一句话怎么说才好听，你会多想一步。',
   facts:[
     {t:'剧团的第二男主角。',src:['S1','S7']},
     {t:'传统上演贾宝玉、张生这类公子和书生，专攻文场戏，特别重唱功，讲究扇子功、水袖功。',src:['S3']},
     {t:'扮相净面不挂须；长长的袖子叫「文袖」，演文质彬彬的角色时甩袖。',src:['S3','S4']},
     {t:'白驹荣人称「小生王」。',src:['S8']}
   ],
   role:'周宝伦'},
  {id:'zyhd',name:'正印花旦',label:'什么戏都能挑的那根柱',color:'#D2245E',hook:1,
   portrait:'能柔能刚，换什么角色都立得住。站到中间你不慌，让你去补别人的位置你也做得漂亮。',
   facts:[
     {t:'剧团的第一女主角。',src:['S1','S7']},
     {t:'老规矩讲「花旦四门齐」：踩跷、散发、披甲、妹仔戏，四样都要会，所以粤剧的花旦是什么戏都能演的通才。',src:['S3','R1']},
     {t:'唱子喉，比平喉高八度；头上贴片子，「片子石」是花旦必用的头饰。',src:['S4','S7']},
     {t:'白雪仙、红线女、芳艳芬都是粤剧的名花旦，芳艳芬人称「花旦王」。',src:['S8','S9','S10']},
     {t:'早年花旦全由男演员演，叫「男花旦」，千里驹就是上世纪二十年代人寿年班的正印花旦。',src:['S3','S13']}
   ],
   role:'长平公主'},
  {id:'ebhd',name:'二帮花旦',label:'托住整台戏的那根柱',color:'#138A7A',hook:1,
   portrait:'实力不输谁，但你懂得什么时候该退半步，让整台戏更好看。少了你，主角也唱不圆。',
   facts:[
     {t:'剧团的第二女主角。和正印花旦本来就是同一个行当，差别只在戏份多少。',src:['S3','S7']},
     {t:'白雪仙十四岁就担纲正印花旦，后来自谦退居二帮花旦；和任剑辉合组仙凤鸣时，又是她演正印花旦。',src:['S8']},
     {t:'唱子喉，扮相和正印花旦同一类。',src:['S7']}
   ],
   role:'周瑞兰'},
  {id:'cs',name:'丑生',label:'让整个戏班笑起来的那根柱',color:'#E07A12',hook:1,
   portrait:'反应快，会接话，场子冷了你一句话就救回来。大家以为你只是开心果，其实你往往是最懂行的那个。',
   facts:[
     {t:'戏行有句话：「无丑不成戏」。',src:['S3']},
     {t:'老戏班里丑生是「众人师傅」。下乡演出第一晚开演前，由正印男丑在化妆柱上写一个大大的「吉」字，「吉」下面那个口要留一道缝，意思是演员得开得了口，戏才唱得成。',src:['S3','R1']},
     {t:'擅长即兴插科打诨，行内叫「爆肚」，讲究生活化，常常直接和台下观众交流。',src:['S3','S7']},
     {t:'梁醒波人称「丑生王」；马师曾也是丑生出身。',src:['S8','S13']}
   ],
   role:'周钟'},
  {id:'ws',name:'武生',label:'压得住阵的那根柱',color:'#2E2A28',hook:2,
   portrait:'稳。你不一定话最多，但有你在，大家心里就有底。事情越乱，越显出你的分量。',
   facts:[
     {t:'演中老年男角，按年纪身份挂黑色或白色的胡子，在戏里分量很重。',src:['S3','S7','R1']},
     {t:'传统武生要熟习南派武技，还要懂得各种表演排场、有扎实的唱功。',src:['S3']},
     {t:'正印武生要在传统例戏《六国大封相》里演公孙衍，表演一手「坐车」。',src:['S3']},
     {t:'靓次伯人称「武生王」。',src:['S3','S8']}
   ],
   role:'崇祯皇帝'}
];

// 八道题。每个选项给一根柱加一分。分布在 tests 里按全部 4^8 种答法精确计算。
const QUESTIONS=[
  {q:'朋友聚会冷场了，你会？',opts:[
    ['讲个段子，把气氛救回来','cs'],
    ['起个头玩个游戏，自己先上','wms'],
    ['给大家续上茶，等有人开口再接话','ebhd'],
    ['不急，冷一会儿也好，聊聊最近看的书','xs']]},
  {q:'团队接了个急活，你通常在哪个位置？',opts:[
    ['扛最重的那块，冲在最前面','wms'],
    ['坐镇兜底，出了事大家先来找你','ws'],
    ['哪里缺人补哪里，什么都能顶上','zyhd'],
    ['配合主力，把细节做到最好','ebhd']]},
  {q:'你最不想听别人说你？',opts:[
    ['没担当','wms'],
    ['俗气，没品味','xs'],
    ['闷，没意思','cs'],
    ['不靠谱，压不住事','ws']]},
  {q:'别人最常夸你什么？',opts:[
    ['有气场，往那一站就是主角','zyhd'],
    ['有分寸，懂得成全别人','ebhd'],
    ['脑子快，嘴皮子利索','cs'],
    ['说话好听，有学问','xs']]},
  {q:'难得空出一个周末，你想？',opts:[
    ['一个人看书、听曲、写点东西','xs'],
    ['学个新本事，越难越来劲','zyhd'],
    ['约一大帮人出去玩','cs'],
    ['把家里该收拾的收拾好，给家里人做顿饭','ws']]},
  {q:'到了一个新环境，你通常？',opts:[
    ['先看清规矩，再出手','xs'],
    ['很快和所有人混熟','cs'],
    ['先把自己最拿手的那件事做漂亮','wms'],
    ['先帮别人的忙，慢慢被人看见','ebhd']]},
  {q:'如果一定要上台，你最想露哪一手？',opts:[
    ['唱，一段曲唱到人心里','xs'],
    ['演，一哭一笑把人带进戏里','zyhd'],
    ['逗，台下笑成一片','cs'],
    ['压轴，往那一坐全场就静了','ws']]},
  {q:'你希望别人怎么记住你？',opts:[
    ['能文能武，什么都拿得下','wms'],
    ['有你在，大家心里就踏实','ws'],
    ['什么角色都演得好','zyhd'],
    ['不抢风头，但少了你不行','ebhd']]}
];

// 页面上引用的来源。R1 是行内朋友的核对（不署名），其余是公开资料。
const SOURCES={
  S1:{t:'Roles in Cantonese Opera，香港记忆',org:'香港康乐及文化事务署',url:'https://www.hkmemory.hk/en/collections-ichhk-opera-roles.html'},
  S3:{t:'粤剧表演行当（中国粤剧网条目，羊城晚报网转载）',org:'羊城晚报网',url:'https://news.ycwb.com/2019-07/11/content_30295922.htm'},
  S4:{t:'戏曲（魅力广州·文化广州）',org:'广州市人民政府网',url:'https://www.gz.gov.cn/zlgz/whgz/xq/index.html'},
  S7:{t:'粤剧笔记（新高中音乐）',org:'赵聿修纪念中学，香港教育大学非遗教育资源站',url:'https://xich.eduhk.hk/f/page/1205/2794/35.pdf'},
  S8:{t:'赞辞：荣誉社会科学博士陈淑良博士（白雪仙）',org:'香港教育大学',url:'https://www.eduhk.hk/cms/f/honorary_doctors_fellows/21789/29948/Dr%20Chan%20Suk-leung_citation_CHI.pdf'},
  S9:{t:'粤剧教育及资料中心 艺人展区',org:'香港康乐及文化事务署',url:'https://lcsd.gov.hk/en/kst/kstnw/coeic/exhibition/artist.html'},
  S10:{t:'「裳心贯艺 声好芳华」粤剧名伶戏服展',org:'香港都会大学',url:'https://www.hkmu.edu.hk/as/tc/news-events/resplendent-attire-and-graceful-demeanor-cantonese-opera-costumes-exhibition/'},
  S11:{t:'坤生的戏梦人生（粤剧行当的千秋风华讲座）',org:'香港都会大学、香港八和会馆',url:'https://www.hkmu.edu.hk/as/sc/research/ihcorc/ihcorc-seminar-20250614/'},
  S13:{t:'《花月总留痕——香港粤剧回眸（1930s–1970s）》试阅',org:'岳清著，三联书店（香港）',url:'https://www.jointpublishing.com/wp-content/uploads/2024/09/《花月總留痕——香港粵劇回眸（1930s-1970s）》_試閱.pdf'},
  R1:{t:'研究戏曲的朋友逐条核对（2026-10）',org:'',url:''}
};
const ROLE_SOURCE='《帝女花》六柱对应的角色：S7，并经研究戏曲的朋友核对。';

// 资料里有、但还没核实，所以故意不上页面的说法。测试会确认它们没混进来。
const WITHHELD=['骑龙头','靓少华','即京剧之'];

// 计分：每个选项给一根柱一分；最高分并列时，取并列者里最后一次被选中的那根。
// scoreWith 接受任意题表，测试用它拿一份故意失衡的题表校准分布检查。
function scoreWith(qs,answers){
  if(!Array.isArray(answers)||answers.length!==qs.length)throw new Error('need '+qs.length+' answers');
  const sc={},last={};
  answers.forEach((a,i)=>{
    const opt=qs[i].opts[a];
    if(!opt)throw new Error('question '+(i+1)+' has no option '+a);
    const p=opt[1];sc[p]=(sc[p]||0)+1;last[p]=i;
  });
  const top=Math.max(...Object.values(sc));
  const tied=Object.keys(sc).filter(p=>sc[p]===top);
  const id=tied.reduce((b,p)=>last[p]>last[b]?p:b);
  return{id,scores:sc};
}
const score=answers=>scoreWith(QUESTIONS,answers);
const pillar=id=>PILLARS.find(p=>p.id===id);

return{PILLARS,QUESTIONS,SOURCES,ROLE_SOURCE,WITHHELD,score,scoreWith,pillar};
});
