(function (root) {
  'use strict';
  const W = 360, H = 740; // H is the original two-storey height (film, legacy); the office page adds the fun floor
  const mvDesks = [
    [65, 112], [157, 112], [229, 112], [301, 112], [157, 194],
    [53, 224], [229, 194], [301, 269], [301, 194], [157, 269], [308, 339]
  ];
  // etwin-cc (desk 7) keeps the boss company on a stool beside her desk instead of a workstation.
  // Dots (desk 5) reads X clippings standing at a board in the small mailroom; the showcase takes the old shelf corner.
  const desks = mvDesks.map((p,i)=>i===9 ? [229,269] : i===7 ? [140,351] : i===5 ? [115,209] : p);
  const mvRest = [[35, 294], [61, 294], [87, 294], [35, 324], [61, 324], [87, 324], [116, 294], [116, 323], [35, 351], [68, 351], [308, 362]];
  const games = [[156,268,'pingpong'],[156,332,'pingpong'],[80,312,'chess'],[116,312,'chess'],[36,294,'arcade'],[60,294,'arcade'],[36,328,'nap'],[60,328,'read'],[88,340,'watch'],[116,340,'watch'],[210,294,'arcade'],[234,294,'arcade']].map(([x,y,kind])=>({x,y,kind}));
  const rest = [...games.slice(0,10).map(p=>[p.x,p.y]),[308,366]], gameWatch = {x:92,y:372};
  // Gym and teahouse are drawn from local origins (office.js) and placed per layout.
  const gymLocal = [[14,44,'run'],[42,36,'lift'],[70,46,'box'],[42,68,'yoga']], gymLocalObstacles = [{x:6,y:6,w:16,h:10},{x:30,y:6,w:24,h:10},{x:67,y:16,w:10,h:14}];
  const teaLocal = [[16,68,'tea'],[62,68,'tea'],[29,46,'tea'],[49,46,'tea']], teaLocalObstacles = [{x:26,y:52,w:26,h:14},{x:6,y:84,w:18,h:10}];
  // A treat of dim sum seats four at the table and two more standing at its ends.
  const feastLocal = [[8,54,'stand'],[70,54,'stand']];
  // Rest room, 104×66 local: three bunk beds, upper and lower berth each.
  const bedLocal = [[17,32,'bed'],[17,56,'bed'],[51,32,'bed'],[51,56,'bed'],[85,32,'bed'],[85,56,'bed']];
  // Bunk posts are solid (one climbs in from the open side); the berths themselves stay reachable.
  const bedLocalObstacles = [4,38,72].flatMap(bx=>[{x:bx,y:8,w:3,h:56},{x:bx+25,y:8,w:3,h:56}]);
  const atOrigin = (list,[ox,oy]) => list.map(([x,y,kind])=>({x:x+ox,y:y+oy,kind}));
  const obstaclesAt = (list,[ox,oy]) => list.map(o=>({...o,x:o.x+ox,y:o.y+oy}));
  // Idle colleagues fill leisure spots in this order (pairs only when both partners exist); breakfast puts the teahouse first.
  // The teahouse is open all day (two seats in the ordinary rotation); at 早茶/下午茶/夜茶 it fills first.
  // 20 = dance machine, 21 = claw machine (bottom-right of the game room).
  // 41–43 = pool (two swimmers, one deckchair), 44 = the cat tree, 45 = the clinic bed (tower only; other layouts skip missing slots).
  const LEISURE_ORDER = [0,1,4,20,16,17,12,22,2,3,21,41,25,44,28,5,13,29,43,23,10,26,27,18,14,24,30,42,11,19,15,31,32,33,6,7,8,9,37,34,45],
  // 楼下时间: twenty minutes of every hour, idle colleagues head downstairs first so the fun floor is lived in too.
  FUN_ORDER = [22,25,32,41,28,44,23,24,29,30,26,27,33,31,42,0,1,4,20,12,2,3,21,5,13,10,14,11,15,6,7,8,9], BREAKFAST_ORDER = [16,17,18,19,...LEISURE_ORDER.filter(i=>i<16||i>19)];
  const KITCHEN_ORDER = [37,38,39,40,...LEISURE_ORDER.filter(i=>i<37)], BBQ_ORDER = [34,35,36,...BREAKFAST_ORDER.filter(i=>i<34||i>36)];
  const kitchenLocal = [[16,40,'cook'],[46,40,'chop'],[16,70,'eat'],[60,70,'eat']], kitchenLocalObstacles = [{x:6,y:10,w:22,h:16},{x:36,y:12,w:18,h:14},{x:58,y:6,w:14,h:25},{x:28,y:53,w:20,h:14}];
  // Alice: 「根据他们是哪里的AI就做哪里的菜」. Each colleague orders its home cuisine (made by whoever runs it); demo and unknown
  // ids get one by hash. 豆包 is the chef and cooks Cantonese for the house, since the boss lives in Guangzhou.
  const CUISINES = {cc:['意大利菜','肉酱面'],codex:['美式','汉堡'],kimi:['京味','炸酱面'],agy:['墨西哥菜','塔可'],grok:['德州菜','烤牛胸'],muse:['日料','寿司'],
    dots:['韩料','炸鸡'],cobbler:['甜点','桃子馅饼'],etwin:['湘菜','剁椒鱼头'],doubao:['粤菜','白切鸡']};
  const CUISINE_POOL = [['川菜','麻婆豆腐'],['粤菜','烧鹅'],['湘菜','小炒肉'],['日料','拉面'],['韩料','石锅拌饭'],['意大利菜','披萨'],['泰国菜','冬阴功'],['西北菜','手抓羊肉']];
  const dishOf = id => CUISINES[id] || CUISINE_POOL[stableHash(String(id||'')) % CUISINE_POOL.length];
  const machineSpots = [{x:234,y:332,kind:'dance'},{x:196,y:336,kind:'claw'}];
  // Fun floor downstairs: four 110×80 rooms. Leisure slots 22–31.
  const funLocal = {ktv:[[26,50,'sing'],[60,68,'cheer'],[86,68,'cheer']], read:[[30,64,'book'],[80,64,'book']], garden:[[28,44,'water'],[78,62,'cat']], cinema:[[32,70,'movie'],[56,70,'movie'],[80,70,'movie']], snack:[[16,50,'buy'],[48,72,'soda']], bbq:[[20,40,'grill'],[20,62,'eat'],[54,62,'cheer']]};
  const funLocalObstacles = {ktv:[{x:34,y:4,w:46,h:18}], read:[{x:4,y:2,w:102,h:24}], garden:[{x:4,y:4,w:50,h:14},{x:84,y:8,w:14,h:14}], cinema:[{x:8,y:2,w:94,h:32}], snack:[{x:4,y:2,w:48,h:36}], bbq:[{x:8,y:14,w:26,h:13}]};
  const FUN_ROOMS = ['ktv','read','garden','cinema','snack'];
  const funSpots = (offsets,local=funLocal) => [...FUN_ROOMS,...(offsets.bbq?['bbq']:[])].flatMap(k=>atOrigin(local[k],offsets[k]));
  const funObstacles = (offsets,local=funLocalObstacles) => [...FUN_ROOMS,...(offsets.bbq && local.bbq?['bbq']:[])].flatMap(k=>obstaclesAt(local[k]||[],offsets[k]));
  const PAIRS = {0:1,2:3};
  // After the first three units (table tennis, an arcade, the dance machine) the rest rotate every twenty minutes on
  // clock-aware pages, so the gym, massage chairs, garden and snack bar all get their turn; pairs stay together.
  function rotate(order, turn) {
    const units=[]; for (const slot of order) { if (Object.values(PAIRS).includes(slot)) continue; units.push(PAIRS[slot]!==undefined?[slot,PAIRS[slot]]:[slot]); }
    const head=units.slice(0,3), tail=units.slice(3), k=tail.length ? ((turn % tail.length) + tail.length) % tail.length : 0;
    return [...head,...tail.slice(k),...tail.slice(0,k)].flat();
  }
  function leisureSlots(count, breakfast=false, turn=0, reserved=[], has=()=>true) {
    const order=Array.isArray(breakfast)?breakfast:breakfast==='fun'?FUN_ORDER:breakfast?BREAKFAST_ORDER:turn?rotate(LEISURE_ORDER,rotationIndex(turn)):LEISURE_ORDER, picked=[];
    for(const slot of order) {
      if(picked.length>=count) break;
      if(reserved.includes(slot) || !has(slot)) continue;
      if(Object.values(PAIRS).includes(slot)) continue;
      if(PAIRS[slot]!==undefined) { if(count-picked.length>=2) picked.push(slot,PAIRS[slot]); continue; }
      picked.push(slot);
    }
    return picked;
  }
  const teaTime = time => { const h = new Date(time + 8 * 3600000).getUTCHours(); return h >= 8 && h < 10 ? '早茶' : h >= 15 && h < 17 ? '下午茶' : h >= 20 && h < 23 ? '夜茶' : null; };
  const mealTime = time => { const d=new Date(time+8*3600000), m=d.getUTCHours()*60+d.getUTCMinutes(); return m>=690 && m<780 ? '午餐' : m>=1050 && m<1140 ? '晚餐' : null; };
  const isBBQTime = time => { const h=new Date(time+8*3600000).getUTCHours(); return h>=19 && h<23; };
  const isBreakfast = time => !!teaTime(time);
  const isFunTime = time => Math.floor(time / 1200000) % 3 === 2;
  // The rotation only advances on ordinary windows (not the downstairs hour, not tea time): counting every window let the
  // tail alias with the every-third downstairs hour once it grew to a multiple of three, and some units never came round.
  const ROTATING=[]; for(let w=0;w<72;w++){const t=Date.UTC(2026,0,1,16)+w*1200000;if(!isFunTime(t)&&!isBreakfast(t))ROTATING.push(w);}
  const rotationIndex = turn => { const w=((turn-48)%72+72)%72, day=Math.floor((turn-48)/72), before=ROTATING.filter(x=>x<w).length; return day*ROTATING.length+before; };
  const door = { x: 340, y: 388 }, bossDesk = { x: 195, y: 352 }, handoff = { x: 221, y: 352 }, pantry = { x: 198, y: 247 };
  const deskObstacles = layout => layout.map(([x, y], i) => ({ x: x - (i === 10 ? 23 : 27), y: y - 9, w: i === 10 ? 46 : 54, h: 29 }));
  const NOWHERE = {x:-100,y:-100,w:0,h:0}, SHOWCASE = {x:24,y:172,w:72,h:68};
  const obstacles = deskObstacles(desks).map((o,i)=>i===9?{x:200,y:260,w:44,h:22}:i===7?NOWHERE:i===5?{x:104,y:206,w:22,h:8}:o);
  obstacles.push({ x: 150, y: 366, w: 84, h: 28 });
  obstacles.push({ x: 26, y: 173, w: 72, h: 29 }, { x: 109, y: 88, w: 3, h: 58 });
  for (const [x, y] of [[119,198],[266,277],[323,93],[27,378]]) obstacles.push({ x, y, w: 12, h: 13 });
  // The fixed MV keeps its old lounge; ordinary pages use the corner's solid cabinets and seat backs.
  const mvObstacles = [...deskObstacles(mvDesks),...obstacles.slice(desks.length),{x:22,y:269,w:78,h:10}];
  obstacles[12] = SHOWCASE; obstacles[14] = NOWHERE; // bookshelf → showcase cabinet; the little plant goes
  obstacles.push({x:186,y:306,w:20,h:22},{x:218,y:300,w:32,h:14},{x:24,y:260,w:20,h:22},{x:48,y:260,w:20,h:22},{x:88,y:292,w:20,h:16},{x:26,y:312,w:20,h:6},{x:50,y:312,w:20,h:6},{x:136,y:276,w:40,h:40});
  const podium = { x: 156, y: 532 }, booth = { x: 284, y: 540 };
  const seats = [[44,540],[70,540],[96,540],[122,540]].map(([x,y]) => ({x,y}));
  const standing = [32,56,80,104,128,152].map(x=>({x,y:592}));
  const audience = [{x:52,y:630},{x:80,y:630}];
  const patrol = [door, {x:340,y:492}, {x:248,y:604}, {x:200,y:640}, {x:28,y:640}, {x:180,y:612}, {x:340,y:492}, door, {x:198,y:247}, {x:125,y:169}, door];
  const mainObstacles=obstacles.slice();
  const meetingObstacles=[{x:36,y:552,w:96,h:20}, {x:20,y:490,w:3,h:113}, {x:176,y:490,w:3,h:86}, {x:20,y:600,w:159,h:3}, {x:40,y:614,w:52,h:6}];
  // A one-person phone booth (CC alone ever uses it).
  const boothObstacles=[{x:268,y:494,w:3,h:46}, {x:299,y:494,w:3,h:46}, {x:290,y:504,w:10,h:20}],storageObstacle={x:266,y:616,w:64,h:60};
  const gymOrigin=[212,630], teaOrigin=[186,494], restOrigin=[24,652];
  const bedObstacles = obstaclesAt(bedLocalObstacles,restOrigin); obstacles.push(...bedObstacles);
  obstacles.push(...meetingObstacles,...boothObstacles,...obstaclesAt(gymLocalObstacles,gymOrigin),...obstaclesAt(teaLocalObstacles,teaOrigin));
  const emptyScene = () => ({meeting:null, dispatched:[], call:null, disk:null, guard:null});
  const diskLayers = disk => disk ? Math.ceil(disk.usedPct / 12.5) : 0;
  const isNight = time => { const h = new Date(time + 8 * 3600000).getUTCHours(); return h >= 23 || h < 8; };
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const MEET_NAMES = {pitch:'带项目来洽谈',research:'来调研',learn:'来取经',chat:'随便聊聊'};
  // Even lines are hosts, odd lines the guest. Text is never supplied by visitors.
  const MEET_LINES = {
    pitch:['我们先看看需求','带了个新点子来','这块我熟，回头发方案','好呀，期待再聊'],
    research:['想了解哪一块？','想看看怎么协作','数据在这，一起看看','记下了，谢谢分享'],
    learn:['我们是这么搭的','原来还能这样做','先试小步，再慢慢改','学到了，回去试试'],
    chat:['坐坐，喝点啥','一杯茶就好','忙里也要歇一会儿','下次再来串门']
  };
  // One ownership order. Arguments refine their own review's meeting claim; they never override another meeting.
  const ACTIVITY_PRIORITY = Object.freeze({work:70,quota:60,reception:50,argue:40,gate:40,snack:30,souvenir:30,radar:30,melon:20,games:10});
  const stableHash = value => {let h=2166136261;for(const c of value)h=Math.imul(h^c.charCodeAt(0),16777619)>>>0;return h;};
  const home = (i,selection=false) => { const p=getLayout(selection).desks[i]; return {x:p[0],y:p[1]+27}; };
  const lookIndex = (a,legacy=false) => legacy ? a.i : a.look ?? a.i;
  function plateName(name) {
    let result='',units=0;
    for(const c of (name || '').replace(/[\s-]/g,'')) { units+=c.codePointAt(0)<128?1:2; if(units>8)break; result+=c; }
    return result;
  }
  const visibleActor = (a,L) => !(!a.activity && ['away','off'].includes(a.status) && distance(a,L.door)<3);
  function nameplates(actors,measure,exclusions=[],selection=false) {
    const L=getLayout(selection),{W,H,desks}=L,visible=actors.filter(a=>visibleActor(a,L)),plates=[];
    const overlaps=(p,q)=>p.x<q.x+q.w+1&&q.x<p.x+p.w+1&&p.y<q.y+q.h+1&&q.y<p.y+p.h+1;
    const bodies=visible.map(a=>({x:Math.round(a.x)-9,y:Math.round(a.y)-24,w:18,h:29}));
    // simplified: bounded nearby placement for <=11 colleagues; larger crowds need a dedicated layout.
    for(const a of visible.filter(a=>!a.visitor&&!a.boss&&desks[a.i]&&distance(a,home(a.i,L))>=1).sort((a,b)=>b.y-a.y||a.i-b.i)) {
      const name=plateName(a.name);if(!name)continue;
      const w=Math.ceil(measure(name))+10,footX=Math.round(a.x),footY=Math.round(a.y);
      let placed=false;
      for(const dy of [6,17]) { for(const dx of [0,-12,12,-24,24,-36,36]) {
        const p={id:a.id,name,color:a.color,x:Math.round(footX-w/2+dx),y:footY+dy,w,h:10,footX,footY};
        if(p.x<2||p.x+w>W-2||p.y+p.h>H-2||[...plates,...bodies,...exclusions,{x:147,y:279,w:17,h:34}].some(q=>overlaps(p,q)))continue;
        const center=Math.round(p.x+p.w/2),leaders=[{x:Math.min(center,footX),y:footY+5,w:Math.abs(center-footX)+1,h:1},{x:center,y:footY+5,w:1,h:dy-4}];
        if(leaders.some(line=>exclusions.some(q=>overlaps(line,q))))continue;
        plates.push(p);placed=true;break;
      } if(placed)break; }
    }
    return plates;
  }
  // The waiting queue grows away from the game room's machines into the floor etwin's old desk left free.
  const queuePoint = i => ({ x: [247, 273, 273, 299, 325, 273, 299, 325, 286, 312, 338][i % 11], y: [352, 352, 325, 325, 325, 300, 300, 300, 276, 276, 276][i % 11] });
  const filmQueuePoint = i => ({ x: [247, 273, 273, 247, 221, 195, 195, 221, 247, 273, 299][i % 11], y: [352, 352, 325, 325, 325, 325, 300, 300, 300, 300, 300][i % 11] });
  const tour = [{x:125,y:169},pantry,{x:273,y:300},{x:104,y:390},gameWatch];
  const FUN_P = {ktv:[24,816],read:[150,816],garden:[24,924],cinema:[150,924],snack:[272,880]}, FUN_L = {ktv:[20,448],read:[136,448],cinema:[252,448],garden:[442,448],snack:[556,448]};
  obstacles.push(...funObstacles(FUN_P));
  // The two-storey-plus-fun-floor plan (11-01 to 11-03). Film, legacy and landscape still build on it.
  const classic = {id:'portrait',W,H:1040,funOffsets:FUN_P,fun:funSpots(FUN_P),desks,door,bossDesk,handoff,pantry,games,gameWatch,podium,booth,seats,standing,audience,patrol,tour,queuePoint,obstacles,
    partySpot:{x:FUN_P.ktv[0]+44,y:FUN_P.ktv[1]+56},beds:atOrigin(bedLocal,restOrigin),restOffset:restOrigin,gym:atOrigin(gymLocal,gymOrigin),tea:atOrigin(teaLocal,teaOrigin),feastStand:atOrigin(feastLocal,teaOrigin),feastDrop:atOrigin([[39,82,'drop']],teaOrigin)[0],gymOffset:gymOrigin,teaOffset:teaOrigin,gameRect:{x:22,y:258,w:238,h:82},
    gatePoint:{x:124,y:164},meetingOffset:[0,0],boothOffset:[0,0],storageOffset:[-238,-438],totalsOffset:[0,0],noticeRect:{x:226,y:23,w:103,h:49}};
  const shift = (p,dx,dy) => ({...p,x:p.x+dx,y:p.y+dy});
  // Landscape wing, two columns. Left (by the entrance): meeting room with its audience bench, then the front desk
  // beside the door and the gym. Right, one aligned stack: teahouse, showcase, phone booth. An aisle runs between.
  const W_MEET=[334,-398], W_TEA=[536,92], W_BOOTH=[182,-282], W_GYM=[526,206], W_REST=[520,316];
  const landscape = {...classic,id:'landscape',W:640,H:560,funOffsets:FUN_L,fun:funSpots(FUN_L),partySpot:{x:FUN_L.ktv[0]+44,y:FUN_L.ktv[1]+56},desks:desks.map((p,i)=>i===10?[384,350]:p),
    podium:shift(podium,...W_MEET),seats:seats.map(p=>shift(p,...W_MEET)),standing:standing.map(p=>shift(p,...W_MEET)),audience:audience.map(p=>shift(p,...W_MEET)),
    beds:atOrigin(bedLocal,W_REST),restOffset:W_REST,gym:atOrigin(gymLocal,W_GYM),tea:atOrigin(teaLocal,W_TEA),feastStand:atOrigin(feastLocal,W_TEA),feastDrop:atOrigin([[39,82,'drop']],W_TEA)[0],gymOffset:W_GYM,teaOffset:W_TEA,
    booth:shift(booth,...W_BOOTH),meetingOffset:W_MEET,boothOffset:W_BOOTH,totalsOffset:[328,-403],lobby:{x:440,y:304,w:60,h:14},
    queuePoint:i=>({x:[248,276,304,248,276,304,376,404,432,460,488][i%11],y:i<3?344:388})};
  landscape.obstacles=[...mainObstacles.filter((_,i)=>i!==10),...deskObstacles(landscape.desks).slice(10),
    ...meetingObstacles.map(p=>shift(p,...W_MEET)),...boothObstacles.map(p=>shift(p,...W_BOOTH)),landscape.lobby,{x:456,y:330,w:28,h:8},...obstaclesAt(bedLocalObstacles,W_REST),
    ...obstaclesAt(gymLocalObstacles,W_GYM),...obstaclesAt(teaLocalObstacles,W_TEA),...funObstacles(FUN_L)];
  landscape.tour=[...tour,{x:470,y:350},{x:512,y:240}];
  landscape.patrol=[door,{x:352,y:392},{x:512,y:392},{x:512,y:296},{x:616,y:296},{x:616,y:196},{x:524,y:196},{x:524,y:88},{x:360,y:88},pantry,{x:125,y:169},door];
  // The published MV films (v5–v7) keep desk 7 as a workstation; ordinary pages seat etwin-cc beside the boss.
  const filmPatrol=[door,{x:244,y:708},{x:28,y:708},{x:244,y:620},{x:180,y:620},{x:248,y:604},{x:340,y:492},door,{x:198,y:247},{x:125,y:169},door];
  const film={...classic,id:'film',H,funOffsets:null,fun:null,patrol:filmPatrol,booth:{x:296,y:560},storageOffset:[0,0],desks:desks.map((p,i)=>[5,7].includes(i)?mvDesks[i]:p),obstacles:[...classic.obstacles.filter(o=>!bedObstacles.includes(o)).map((o,i)=>[5,7].includes(i)?deskObstacles(mvDesks)[i]:i===12?{x:26,y:173,w:72,h:29}:i===14?{x:119,y:198,w:12,h:13}:o),storageObstacle],tour:tour.map((p,i)=>i===3?{x:124,y:372}:p),queuePoint:filmQueuePoint};
  // 11-03 three-floor tower for the phone page. Alice: 「会议室挪到一楼，就在我的桌子旁边」「休息室要放到三楼……比较吵的就放上来」
  // 「公告栏那么多字……放到第一层，人家一进来就能先看到」「猫咪在办公室里面跑……花园改成菜地」「游泳池也行」.
  // 1F: office + compact meeting room beside the boss desk + the totals board. 2F: everything noisy. 3F: reading, rest, farm, cat tree.
  // Stairs stay in the right-hand column (x 312–342) between floors.
  const T_BANDS=[[88,466],[516,808],[868,1030]];
  const T_FUN={ktv:[16,526],cinema:[128,526],snack:[240,526],bbq:[178,632],read:[16,876],garden:[16,962]};
  const T_TEA=[16,616],T_KITCHEN=[98,632],T_GYM=[16,724],T_POOL=[116,726],T_REST=[134,888],T_CAT=[244,724],T_CLINIC=[242,878],T_BOOTH=[-6,136];
  const towerLocal={...funLocal,garden:[[60,32,'water'],[112,52,'pick']]}, towerLocalObstacles={...funLocalObstacles,garden:[{x:176,y:6,w:30,h:18}]};
  const poolLocal=[[28,40,'swim'],[60,52,'swim'],[104,62,'lounge']], poolLocalObstacles=[{x:92,y:20,w:22,h:12}];
  // 医务室 (Alice: 「缺了一个医务室，我给你们看病刚好合适」): a colleague sits by the bed for a check-up; the boss drops in as the doctor.
  const clinicLocal=[[28,62,'checkup']], clinicLocalObstacles=[{x:4,y:14,w:18,h:22},{x:34,y:24,w:26,h:10},{x:6,y:70,w:50,h:12}], clinicDoctorLocal=[48,50];
  const catTreeLocal=[[18,62,'cat']], catTreeLocalObstacles=[{x:24,y:6,w:24,h:42}];
  // Compact meeting room, absolute coordinates: x 16–120, y 350–468; the door is a gap in its right wall.
  const T_MEET={x:16,y:350,w:104,h:118};
  const towerMeetingObstacles=[{x:16,y:350,w:104,h:3},{x:118,y:350,w:3,h:40},{x:118,y:438,w:3,h:30},{x:26,y:400,w:72,h:14},{x:26,y:446,w:46,h:6}];
  const T_TOTALS={x:142,y:410,w:164,h:54};
  const towerObstacles=[...mainObstacles.filter(o=>!(o.x===27&&o.y===378)),...towerMeetingObstacles,{...T_TOTALS},
    ...boothObstacles.map(o=>({...o,x:o.x+T_BOOTH[0],y:o.y+T_BOOTH[1]})),...obstaclesAt(gymLocalObstacles,T_GYM),...obstaclesAt(teaLocalObstacles,T_TEA),
    ...obstaclesAt(bedLocalObstacles,T_REST),...obstaclesAt(kitchenLocalObstacles,T_KITCHEN),...obstaclesAt(poolLocalObstacles,T_POOL),...obstaclesAt(catTreeLocalObstacles,T_CAT),...obstaclesAt(clinicLocalObstacles,T_CLINIC),
    ...funObstacles(T_FUN,towerLocalObstacles)];
  const towerGameWatch={x:172,y:350};
  const tower={...classic,id:'portrait',H:1050,bands:T_BANDS,funOffsets:T_FUN,funLocal:towerLocal,fun:funSpots(T_FUN,towerLocal),partySpot:{x:T_FUN.ktv[0]+44,y:T_FUN.ktv[1]+56},
    gameWatch:towerGameWatch,tour:[tour[0],pantry,tour[2],{x:132,y:420},towerGameWatch],
    meetingRect:T_MEET,meetingOffset:[0,0],podium:{x:104,y:386},seats:[32,50,68,86].map(x=>({x,y:390})),standing:[...[28,48,68,88,108].map(x=>({x,y:432})),{x:100,y:456}],audience:[{x:36,y:458},{x:60,y:458}],
    booth:shift(booth,...T_BOOTH),boothOffset:T_BOOTH,totals:T_TOTALS,totalsOffset:[0,0],
    beds:atOrigin(bedLocal,T_REST),restOffset:T_REST,gym:atOrigin(gymLocal,T_GYM),gymOffset:T_GYM,tea:atOrigin(teaLocal,T_TEA),teaOffset:T_TEA,
    feastStand:atOrigin(feastLocal,T_TEA),feastDrop:atOrigin([[39,82,'drop']],T_TEA)[0],
    kitchenOffset:T_KITCHEN,kitchen:atOrigin(kitchenLocal,T_KITCHEN),poolOffset:T_POOL,pool:atOrigin(poolLocal,T_POOL),catOffset:T_CAT,catSpot:atOrigin(catTreeLocal,T_CAT)[0],clinicOffset:T_CLINIC,clinic:atOrigin(clinicLocal,T_CLINIC),clinicDoctor:{x:T_CLINIC[0]+clinicDoctorLocal[0],y:T_CLINIC[1]+clinicDoctorLocal[1]},
    funTop:488,obstacles:towerObstacles,
    patrol:[door,{x:326,y:488},{x:326,y:612},{x:40,y:612},{x:40,y:716},{x:230,y:716},{x:326,y:716},{x:326,y:488},door,pantry,{x:125,y:169},door]};
  const layouts={portrait:tower,landscape,film,legacy:{...classic,id:'legacy',queuePoint:filmQueuePoint,desks:mvDesks,obstacles:mvObstacles,tour:tour.slice(0,4).map((p,i)=>i===3?{x:115,y:351}:p)}};
  // Extend only office layouts after film/legacy have captured their original arrays and offsets.
  const W_KITCHEN = [356,256];
  for (const [L,kitchenOffset,bbq] of [[landscape,W_KITCHEN,[366,448]]]) {
    L.kitchenOffset=kitchenOffset; L.kitchen=atOrigin(kitchenLocal,kitchenOffset);
    L.funOffsets={...L.funOffsets,bbq}; L.fun=funSpots(L.funOffsets);
    L.obstacles=[...L.obstacles,...obstaclesAt(kitchenLocalObstacles,kitchenOffset),...obstaclesAt(funLocalObstacles.bbq,bbq)];
  }
  const getLayout = value => value && typeof value==='object' ? value : layouts[value===true?'legacy':value || 'portrait'];
  const blocked = (x,y,selection=false) => {
    const L=getLayout(selection), deep=!!L.funOffsets;
    if (x<18 || x>L.W-18 || y<88) return true;
    if (L.bands) {
      const last=L.bands[L.bands.length-1];
      if (y>last[1] || !L.bands.some(([a,b])=>y>=a && y<=b) && !(x>=312 && x<=342)) return true;
    } else if (L.id==='landscape') { if (y>392 && !(deep && (y>=440 && y<=544 || x>=416 && x<=436 && y<440))) return true; }
    else {
      if (y>(deep?1022:720) || y>398 && y<490 && x<312) return true;
      // Stairs from the annex's bottom-right down to the fun floor.
      if (deep && y>720 && y<808 && x<312) return true;
    }
    return L.obstacles.some(o=>x>o.x-4 && x<o.x+o.w+4 && y>o.y-3 && y<o.y+o.h+3);
  };
  function noticeBoard(notices,time,guest=false,noticesToday) {
    const day=n=>new Date(n+8*3600000).toISOString().slice(0,10);
    const today=notices.filter(n=>Number.isFinite(Date.parse(n.at)) && day(Date.parse(n.at))===day(time));
    const count=guest ? (Number.isInteger(noticesToday)&&noticesToday>=0?noticesToday:null) : today.length;
    const age=time-Math.max(...today.map(n=>Date.parse(n.at)));
    return {count,sheets:Math.min(8,count ?? 0),extra:Math.max(0,(count ?? 0)-8),recent:!guest && age>=0 && age<600000};
  }

  function meetingBoardText(stats,events) {
    const last=events.filter(e=>e.kind==='meeting').sort((a,b)=>Date.parse(b.at)-Date.parse(a.at))[0];
    const clock=last?new Date(Date.parse(last.at)+8*3600000).toISOString().slice(11,16):null;
    if(stats?.today) return stats.today.meetings>0?`今天开过 ${stats.today.meetings} 次会${clock?' · 上次 '+clock:''}`:'今天还没开会';
    return clock?'上次开会 '+clock:'今天还没开会';
  }

  // Fixed 4-pixel floor grid. At this room size BFS is simpler than a navigation dependency.
  function route(from, to, legacy = false) {
    const key = p => `${p.x},${p.y}`;
    const snap = p => ({ x: Math.round(p.x / 4) * 4, y: Math.round(p.y / 4) * 4 });
    const start = snap(from), goal = snap(to), q = [start], seen = new Map([[key(start), null]]);
    let index = 0, end;
    while (index < q.length) {
      const p = q[index++];
      if (p.x === goal.x && p.y === goal.y) { end = p; break; }
      for (const [dx, dy] of [[0, 4], [4, 0], [0, -4], [-4, 0]]) {
        const n = { x: p.x + dx, y: p.y + dy }, k = key(n);
        if (!seen.has(k) && !blocked(n.x, n.y, legacy)) { seen.set(k, p); q.push(n); }
      }
    }
    if (!end) return [];
    const points = [to];
    for (let p = end; p && key(p) !== key(start); p = seen.get(key(p))) points.push(p);
    points.reverse();
    return points.filter((p, i, a) => i === 0 || i === a.length - 1 || (a[i - 1].x !== a[i + 1].x && a[i - 1].y !== a[i + 1].y));
  }

  function create(roster, seed = 7, selection = false) {
    const L=getLayout(selection),legacy=L.id==='legacy';
    const {desks:layout,door,bossDesk,handoff,pantry,games:gameSpots,gameWatch,podium,booth,seats,standing,audience,patrol,queuePoint,tour}=L;
    // One list of leisure places: game room 0–11, gym 12–15, teahouse 16–19 (see LEISURE_ORDER).
    const games = legacy ? gameSpots.slice(0,10) : [...gameSpots,...(L.gym||[]),...(L.tea||[]),...machineSpots,...(L.fun||[]),...(L.kitchen||[]),...(L.pool||[]),...(L.catSpot?[L.catSpot]:[]),...(L.clinic||[])];
    const home = i => ({x:layout[i][0],y:layout[i][1]+27});
    let randomState = seed >>> 0;
    const random = () => { randomState = (1664525 * randomState + 1013904223) >>> 0; return randomState / 4294967296; };
    const sim = { time: 0, seed, actors: roster.map((r, i) => { const slot = Number.isInteger(r.desk) && r.desk >= 0 && r.desk < desks.length ? r.desk : i; return { ...r, i: slot, ...home(slot), status: 'idle', changed: 0, path: [], dest: null }; }), boss: { ...bossDesk, path: [], dest: null }, bossTarget: null, notices: [], deliveries: [], delivery: null, delivered: 0, nextWander: 0 };
    const courier = legacy || roster.every(a=>a.courier===undefined) ? sim.actors.find(a=>a.i===10) : sim.actors.find(a=>a.courier===true);
    const isCourier = a => a === courier;
    sim.scene = emptyScene(); sim.flights = []; sim.night = false; sim.guard = null;
    const director = () => sim.actors.find(a => a.id === 'cc') || sim.actors.find(a => a.i === 0);
    const deskPoint = a => ({x:layout[a.i][0] + 17, y:layout[a.i][1] + 4});
    const ccPoint = () => { const a = director(); return a && a.activity ? {x:a.x,y:a.y-12} : a ? deskPoint(a) : null; };
    sim.handoffWalk = null; sim.dispatchCall = null;
    const handoffActor = a => !!sim.handoffWalk && (a===director() || a.id===sim.handoffWalk.id);
    const inOffice = a => a && !['away','off'].includes(a.status) && distance(a,door)>3 && !blocked(a.x,a.y,L);
    const pathLength = (from,to) => {let n=0,p=from;for(const q of route(from,to,L)){n+=distance(p,q);p=q;}return n;};
    const handoffPoints=new Map();
    function handoffPoint(a) {
      if(handoffPoints.has(a.id))return handoffPoints.get(a.id);
      const p=home(a.i);
      let options=[-20,20].map(dx=>({x:p.x+dx,y:p.y})).filter(p=>!blocked(p.x,p.y,L));
      // etwin's stool in the tower sits between the meeting-room wall and the boss desk: hand over from below instead.
      if(!options.length)options=[20,-20].map(dy=>({x:p.x,y:p.y+dy})).filter(p=>!blocked(p.x,p.y,L));
      const point=options.sort((a,b)=>pathLength(home(director().i),a)-pathLength(home(director().i),b))[0];
      handoffPoints.set(a.id,point);return point;
    }
    const boothCall = () => !!sim.scene.call && (sim.scene.call.kind!=='dispatch' || (!sim.scene.meeting && sim.dispatchCall?.mode==='phone'));
    function tickHandoff() {
      const e=sim.handoffWalk;if(!e)return;
      const cc=director(),a=sim.actors.find(a=>a.id===e.id);
      if(sim.scene.meeting || !a || ['away','off'].includes(a.status) || (sim.scene.call && sim.scene.call.kind!=='dispatch')) {sim.handoffWalk=null;return;}
      const age=sim.time-e.phaseAt;
      const change=phase=>{e.phase=phase;e.phaseAt=sim.time;};
      if(e.phase==='pickup' && distance(cc,home(cc.i))<1) {e.pickedAt ??=sim.time;if(sim.time-e.pickedAt>=.6)change('walking');}
      else if(e.phase==='walking' && distance(cc,handoffPoint(a))<1 && distance(a,home(a.i))<1)change('placing');
      else if(e.phase==='placing' && age>=.6) {e.placed=true;change('pat');}
      else if(e.phase==='pat' && age>=1.4)change('reply');
      else if(e.phase==='reply' && age>=1.4)change('returning');
      else if(e.phase==='returning' && distance(cc,home(cc.i))<1 && sim.time-e.at>=6)sim.handoffWalk=null;
    }
    function handoffSpeech() {
      const e=sim.handoffWalk;if(!e || !['pat','reply'].includes(e.phase))return [];
      return [{id:director().id,text:'这个交给你'},...(e.phase==='reply'?[{id:e.id,text:'收到'}]:[])];
    }
    function setScene(value, now) {
      if(now!==undefined) {sim.clockBase=now-sim.time*1000;sim.clockKnown=true;}
      const next = value || emptyScene(), before = sim.scene.dispatched;
      if(next.call?.kind==='dispatch') {
        const key=next.call.since+'|'+next.call.with;
        if(sim.dispatchCall?.key!==key || sim.scene.call?.kind!=='dispatch') {
          const a=sim.actors.find(a=>a.id===next.call.with),cc=director();
          const walk=(!legacy || sim.eventsEnabled) && !next.meeting && inOffice(a) && cc && a!==cc;
          sim.dispatchCall={key,id:a?.id,mode:next.meeting?'meeting':walk?'walk':'phone'};sim.handoffWalk=null;
          if(walk) {
            const p=handoffPoint(a),h=home(cc.i),length=pathLength(cc,h)+pathLength(h,p)+pathLength(p,h);
            sim.handoffWalk={id:a.id,phase:'pickup',phaseAt:sim.time,at:sim.time,placed:false,speed:Math.max(1,length/(59*4))};
          }
        }
        if(next.meeting) {sim.dispatchCall.mode='meeting';sim.handoffWalk=null;}
      }
      if(next.meeting || next.call && next.call.kind!=='dispatch')sim.handoffWalk=null;
      for (const id of new Set([...before, ...next.dispatched])) {
        if (before.includes(id) === next.dispatched.includes(id)) continue;
        const a = sim.actors.find(a => a.id === id), cc = ccPoint(); if (!a || !cc) continue;
        const returning = !next.dispatched.includes(id);
        sim.flights = sim.flights.filter(f => f.id !== id);
        if(!returning && sim.dispatchCall?.id===id && sim.dispatchCall.mode==='walk')continue;
        sim.flights.push({id, returning, at:sim.time, from:returning ? deskPoint(a) : cc, to:returning ? deskPoint(director()) : deskPoint(a)});
      }
      if (!sim.supper && (next.guard?.at !== sim.scene.guard?.at || next.guard?.phase !== sim.scene.guard?.phase)) sim.guard = null;
      sim.scene = JSON.parse(JSON.stringify(next));
      receiveEvents(next);
    }
    function flightPoints() {
      return sim.flights.map(f => { const t = Math.min(1, (sim.time-f.at)); return {...f, x:f.from.x+(f.to.x-f.from.x)*t, y:f.from.y+(f.to.y-f.from.y)*t-48*4*t*(1-t), progress:t}; });
    }
    function meetingTarget(id) {
      if (!sim.scene.meeting?.members.includes(id)) return null;
      if (director()?.id === id) return podium;
      const i = sim.scene.meeting.members.filter(id => id !== director()?.id).indexOf(id);
      return seats[i] || standing[i-seats.length];
    }
    const meetingStanding = id => { const p=meetingTarget(id); return p === podium || standing.includes(p); };
    sim.reception = null; sim.meetQueue = []; sim.seenMeets = [];
    function meet(kind, at, local = false, ageMs = 0) {
      if (legacy || !Object.hasOwn(MEET_NAMES,kind) || typeof at !== 'string' || !Number.isFinite(Date.parse(at)) || sim.seenMeets.includes(at)) return;
      sim.seenMeets = [...sim.seenMeets,at].slice(-128);
      sim.meetQueue = [...sim.meetQueue,{kind,at,local,expires:sim.time+Math.max(0,120-Math.max(0,Number(ageMs)||0)/1000)}].slice(-3);
    }
    const freeForReception = a => !handoffActor(a) && !quotaClaim(a) && a.status==='idle' && !a.boss && !a.visitor && !isCourier(a) && !meetingTarget(a.id) && !(a===director() && boothCall());
    const receptionist = a => sim.reception?.hosts.includes(a.id) && sim.reception.phase!=='leaving';
    function receptionPoint(index, handshake = false) {
      const m=sim.reception;
      if(m.venue==='door') return {x:door.x-16,y:door.y};
      if(m.venue==='pantry') return index<0 ? {...pantry} : {x:pantry.x+(index===0?-24:24),y:pantry.y};
      if(index<0) return seats[1];
      return handshake && index===0 ? {x:seats[1].x-20,y:seats[1].y} : seats[index===0?0:3];
    }
    function receptionTarget(a) {
      return receptionist(a) ? receptionPoint(sim.reception.hosts.indexOf(a.id),sim.reception.phase==='handshake') : null;
    }
    function receptionSpeech() {
      const m=sim.reception; if(!m || m.phase==='leaving') return null;
      if(m.mode==='closed') return {id:sim.guard?.id || m.visitor.id,text:legacy || sim.classicLeisure || !sim.actors.some(a=>a.status==='off') ? '下班了，明天再来' : '都在打盹，明天再来'};
      if(m.mode==='tea') return {id:m.hosts[0] || m.visitor.id,text:m.uncertain?'先喝杯茶，等伙伴有空':'都在赶活，先喝杯茶'};
      if(m.redirectAt!=null && sim.time-m.redirectAt<7) return {id:m.hosts[0] || m.visitor.id,text:'会议室有人，我们在这儿聊'};
      if(m.phase==='arriving') return {id:m.visitor.id,text:MEET_NAMES[m.kind]};
      if(m.phase==='handshake') return {id:m.visitor.id,text:'谢谢招待，下次见'};
      const i=Math.min(3,Math.floor((sim.time-m.talkAt)/7));
      return {id:i%2 ? m.visitor.id : m.hosts[Math.floor(i/2)%m.hosts.length] || m.visitor.id,text:MEET_LINES[m.kind][i]};
    }
    function tickReception(dt) {
      while(!sim.reception && sim.meetQueue.length && sim.meetQueue[0].expires<=sim.time) sim.meetQueue.shift();
      if(!sim.reception && sim.meetQueue.length) {
        const event=sim.meetQueue.shift();
        // ID hashing is independent of the page's random stream, roster order and preceding visitors.
        const rank = id => {let h=2166136261;for(const c of event.at+'|'+id) h=Math.imul(h^c.charCodeAt(0),16777619)>>>0;return h;};
        const hosts=sim.actors.filter(freeForReception).sort((a,b)=>rank(a.id)-rank(b.id)||a.id.localeCompare(b.id)).slice(0,event.kind==='chat'?1:2).map(a=>a.id);
        const closed=sim.actors.every(a=>['off','away'].includes(a.status));
        const mode=hosts.length?'normal':closed?'closed':'tea';
        if(mode==='tea' && courier && !quotaClaim(courier) && !meetingTarget(courier.id) && !(courier===director()&&boothCall()) && !sim.delivery && !['off','away'].includes(courier.status)) hosts.push(courier.id);
        sim.reception={...event,hosts,mode,venue:mode==='closed'?'door':mode==='tea'||sim.scene.meeting?'pantry':'meeting',phase:'arriving',started:sim.time,talkAt:null,handshakeAt:null,
          uncertain:!sim.actors.some(a=>['busy','waiting','done'].includes(a.status)),redirectAt:mode==='normal'&&sim.scene.meeting?sim.time:null,
          visitor:{id:'reception-guest',visitor:true,receptionGuest:true,i:24,color:'#c9a35b',...door,path:[],dest:null,status:'visiting',activity:'reception'}};
      }
      const m=sim.reception;if(!m)return;
      // A later real signal takes the colleague back immediately; never save/restore a stale status.
      m.hosts=m.hosts.filter(id=>{const a=sim.actors.find(a=>a.id===id);return a && (m.mode==='normal'?freeForReception(a):!quotaClaim(a)&&!sim.delivery&&!meetingTarget(id)&&!(a===director()&&boothCall())&&!['off','away'].includes(a.status));});
      if(m.mode==='normal' && !m.hosts.length && m.phase!=='leaving') {m.phase='leaving';m.visitor.dest=null;}
      if(sim.scene.meeting && m.venue==='meeting' && m.phase!=='leaving') {m.venue='pantry';m.redirectAt=sim.time;m.visitor.dest=null;}
      const v=m.visitor;
      moveTo(v,m.phase==='leaving'?door:receptionPoint(-1));travel(v,dt);
      const arrived=m.phase==='arriving' && distance(v,receptionPoint(-1))<1 && m.hosts.every(id=>{const a=sim.actors.find(a=>a.id===id);return distance(a,receptionTarget(a))<1;});
      if(m.phase==='arriving' && arrived) {m.phase='talking';m.talkAt=sim.time;}
      if(m.mode!=='normal' && sim.time-m.started>=(m.mode==='closed'?10:20)) m.phase='leaving';
      else if(m.phase==='talking' && sim.time-m.talkAt>=24) {m.phase='handshake';m.handshakeAt=sim.time;}
      else if(m.phase==='handshake' && sim.time-m.handshakeAt>=4) m.phase='leaving';
      if(m.phase==='leaving' && distance(v,door)<1) sim.reception=null;
    }
    // Cosmetic performances share the existing movement and never write status/statusSince.
    sim.eventsEnabled = !legacy; sim.clockBase = Date.now(); sim.quota = {};
    sim.eventQueues = {gate:[],argue:[],snack:[],souvenir:[],radar:[],supper:[],quota:[],melon:[]}; sim.seenEvents = [];
    sim.gate = null; sim.gateFolder = null; sim.gateHistoryCounts = {};
    sim.argue = null; sim.snack = null; sim.souvenir = null; sim.radar = null; sim.radarCard = null; sim.supper = null; sim.quotaEvent = null; sim.melon = null; sim.melonKey = null;
    sim.deskFood = {}; sim.eventBubbles = [];
    const signalNow = () => sim.clockBase + sim.time * 1000;
    const actor = id => sim.actors.find(a=>a.id===id);
    function queueEvent(kind, key, data, at = signalNow()) {
      if(!sim.eventsEnabled || sim.seenEvents.includes(kind+'|'+key)) return;
      sim.seenEvents = [...sim.seenEvents,kind+'|'+key].slice(-256);
      const age = signalNow()-at; if(age<0 || age>=120000) return;
      sim.eventQueues[kind] = [...sim.eventQueues[kind],{...data,key,at,expires:sim.time+(120000-age)/1000}].slice(-3);
    }
    function receiveEvents(s) {
      if(!sim.eventsEnabled)return;
      const m=s.meeting, old=sim.lastRound;
      const key=m?.kind==='review' && m.round!==null ? m.since+'|'+m.round : null;
      sim.lastRound=key;
      if(key && key!==old && m.slide?.rejected>=1) queueEvent('argue',key,{since:m.since,round:m.round,rejected:m.slide.rejected,members:[...m.members]},Date.parse(m.roundAt || m.since));
      if(s.gate)receiveGate(s.gate);
      if(s.snack) queueEvent('snack',s.snack.id+'|'+Math.floor(Date.parse(s.snack.at)/60000),{id:s.snack.id},Date.parse(s.snack.at));
      if(s.souvenir) queueEvent('souvenir',Math.floor(Date.parse(s.souvenir.at)/60000),{},Date.parse(s.souvenir.at));
      if(s.radar) {
        queueEvent('radar',dayOf(Date.parse(s.radar.at))+'|'+s.radar.n,{n:s.radar.n,added:s.radar.added},Date.parse(s.radar.at));
        if(signalNow()-Date.parse(s.radar.at)>=120000 && dayOf(Date.parse(s.radar.at))===dayOf(signalNow()))sim.radarCard={n:s.radar.n,day:dayOf(signalNow())};
        const a=returner('radar');
        if(a) {const overlaps=e=>e.id===a.id&&Math.abs(e.at-Date.parse(s.radar.at))<120000;sim.eventQueues.snack=sim.eventQueues.snack.filter(e=>!overlaps(e));if(sim.snack&&overlaps(sim.snack))sim.snack=null;}
      }
      if(s.supper) queueEvent('supper',s.supper.at,{ids:[...s.supper.ids]},Date.parse(s.supper.at));
    }
    const gateSignature=e=>e.id+'|'+e.at+'|'+e.ok;
    function receiveGate(e,ordinal) {
      if(!sim.eventsEnabled)return;
      const base=gateSignature(e),key=base+'|'+(ordinal || sim.gateHistoryCounts[base] || 1);
      if(sim.gate?.key===key)sim.gate.n=e.n || sim.gate.n;
      for(const queued of sim.eventQueues.gate)if(queued.key===key)queued.n=e.n || queued.n;
      queueEvent('gate',key,{id:e.id,ok:e.ok,n:e.n || 1},Date.parse(e.at));
    }
    function receiveEventHistory(events) {
      const counts={};
      for(const e of events) {
        if(e.kind==='gate'){const key=gateSignature(e);counts[key]=(counts[key]||0)+1;receiveGate(e,counts[key]);}
        if(e.kind==='souvenir')queueEvent('souvenir',Math.floor(Date.parse(e.at)/60000),{},Date.parse(e.at));
        if(e.kind==='radar')queueEvent('radar',dayOf(Date.parse(e.at))+'|'+e.n,{n:e.n,added:e.added},Date.parse(e.at));
      }
      sim.gateHistoryCounts=counts;
      for(const e of events)if(e.kind==='snack' && actor(e.ids?.[0]))queueEvent('snack',e.ids[0]+'|'+Math.floor(Date.parse(e.at)/60000),{id:e.ids[0]},Date.parse(e.at));
    }
    // Archive rows select the same public performance entrances; no replay-only animation.
    function replayEvent(e) {
      const s=JSON.parse(JSON.stringify(sim.scene)),at=e.at;
      switch(e.kind) {
        case 'visitor': setVisitors(e.n); sim.replayVisitorsUntil=sim.time+30; return;
        case 'treat': treat(e.treat,at); return;
        case 'reception': meet('chat',at); return; // old archive records no menu choice
        case 'meeting': s.meeting={kind:e.review?'review':'huddle',since:at,members:[...e.ids],round:null,slide:null};s.call=null;break;
        case 'meeting-end': s.meeting=null;break;
        case 'round': if(s.meeting){s.meeting.round=e.round;s.meeting.roundAt=at;s.meeting.slide=null;}break;
        case 'argue':
          if(s.meeting){s.meeting.round=e.round;s.meeting.roundAt=at;setScene(s,Date.parse(at));queueEvent('argue',s.meeting.since+'|'+e.round,{since:s.meeting.since,round:e.round,rejected:e.rejected,members:[...s.meeting.members]},Date.parse(at));}return;
        case 'handoff': s.dispatched=[...new Set([...s.dispatched,e.ids[1]])];s.call={kind:'dispatch',with:e.ids[1],since:at};break;
        case 'return': s.dispatched=s.dispatched.filter(id=>id!==e.ids[0]);if(s.call?.with===e.ids[0])s.call=null;break;
        case 'call': s.call={kind:'consult',since:at};break;
        case 'call-end': s.call=null;break;
        case 'snack': s.snack={at,id:e.ids[0]};break;
        case 'supper': s.supper={at,ids:[...e.ids]};break;
        case 'souvenir': s.souvenir={at};break;
        case 'radar': s.radar={at,n:e.n,added:e.added};break;
        case 'gate': {
          const key=gateSignature(e);sim.gateHistoryCounts[key]=(sim.gateHistoryCounts[key]||0)+1;
          s.gate={at,id:e.id,ok:e.ok,n:1};break;
        }
        case 'quota': {
          const quota=Object.fromEntries(Object.entries(sim.quota).map(([id,t])=>[id,new Date(t).toISOString()]));
          if(e.clear)delete quota[e.ids[0]];else quota[e.ids[0]]=new Date(Date.parse(at)+3600000).toISOString();
          setQuota(quota,Date.parse(at));return;
        }
        case 'guard': s.guard={phase:'done',at,ok:e.ok};break;
        default:return;
      }
      setScene(s,Date.parse(at));
    }
    function setQuota(value = {}, now) {
      if(now!==undefined)sim.clockBase=now-sim.time*1000;
      sim.quota=Object.fromEntries(Object.entries(value).map(([id,until])=>[id,Date.parse(until)]));
      for(const [id,until] of Object.entries(sim.quota)) {
        if(until<=signalNow())continue;
        if(sim.quotaEvent?.id===id) sim.quotaEvent.until=until;
        else queueEvent('quota',id+'|'+until,{id,until});
      }
    }
    function pruneEvents(now = signalNow()) {
      for(const kind of Object.keys(sim.eventQueues)) sim.eventQueues[kind]=sim.eventQueues[kind].filter(e=>e.expires>sim.time && (sim.replaying || now-e.at<120000));
    }
    const wallPoint = a => ({x:28+(a.i%5)*16,y:92});
    const argumentPoint = index => ({x:podium.x-48+index*28,y:podium.y});
    const cloudPoint = () => ({x:podium.x-34,y:podium.y});
    const melonPoint = index => ({x:[88,116,64][index],y:368});
    const work = a => handoffActor(a) || (a===director() && boothCall()) || meetingTarget(a.id) || ['busy','waiting'].includes(a.status) || (isCourier(a)&&sim.delivery);
    const chargeBed = () => !legacy && !sim.classicLeisure && L.beds ? L.beds[L.beds.length-1] : null;
    function quotaClaim(a) {return sim.eventsEnabled && sim.quotaEvent?.id===a.id && sim.quota[a.id]>signalNow() && !work(a);}
    function cosmeticClaim(a) {
      if(!sim.eventsEnabled)return null;
      const argument = sim.argue?.ids.includes(a.id) && sim.scene.meeting?.since===sim.argue.since && sim.scene.meeting?.round===sim.argue.round && meetingTarget(a.id) && !(a===director()&&boothCall()) && a.status!=='waiting';
      // The review owns these colleagues already, even if the underlying CLI is busy.
      const claims=[];
      if(work(a) && !argument)claims.push({kind:'work',target:null});
      // Out of quota: no standing in the corner — back to the rest room's last berth to recharge.
      if(quotaClaim(a))claims.push({kind:'quota',target:chargeBed() || wallPoint(a)});
      if(receptionist(a))claims.push({kind:'reception',target:receptionTarget(a)});
      if(argument) {
        const e=sim.argue,i=e.ids.indexOf(a.id);
        claims.push({kind:'argue',target:e.phase==='returning'?meetingTarget(a.id):['joining','smoke'].includes(e.phase)?cloudPoint():argumentPoint(i)});
      }
      if(sim.gate?.id===a.id)claims.push({kind:'gate',target:gateTarget(sim.gate)});
      for(const kind of ['souvenir','radar'])if(sim[kind]?.id===a.id)claims.push({kind,target:returnTarget(kind,sim[kind])});
      if(sim.snack?.id===a.id)claims.push({kind:'snack',target:sim.snack.phase==='returning'?home(a.i):foodTarget(sim.snack.ids[sim.snack.index])});
      if(sim.melon?.ids.includes(a.id))claims.push({kind:'melon',target:melonPoint(sim.melon.ids.indexOf(a.id))});
      const winner=claims.sort((a,b)=>ACTIVITY_PRIORITY[b.kind]-ACTIVITY_PRIORITY[a.kind])[0];
      return winner?.kind==='work'?null:winner || null;
    }
    // Beside the colleague, on whichever side is floor (etwin's stool has the boss desk on its right).
    const foodTarget = id => {const p=home(actor(id).i);return [[20,0],[-20,0],[0,20],[0,-20]].map(([dx,dy])=>({x:p.x+dx,y:p.y+dy})).find(q=>!blocked(q.x,q.y,L)) || {x:p.x+20,y:p.y};};
    const occupied = () => sim.actors.filter(a=>!['away','off'].includes(a.status)).sort((a,b)=>a.i-b.i).map(a=>a.id);
    function food(kind,id) {
      sim.deskFood[kind+':'+id]={id,kind,until:sim.time+(['biscuit','cloud'].includes(kind)?300:600)};
      sim.eventBubbles.push({id,until:sim.time+3,text:kind==='cloud'?['欢迎回来','这是哪儿的特产','好软'][actor(id).i%3]:kind==='biscuit'?['谢啦','好耶','请客的来了'][actor(id).i%3]:['谢谢大哥','好香'][actor(id).i%2]});
    }
    const foodNow = () => Object.values(sim.deskFood).filter(f=>f.until>sim.time);
    const dayOf = n => new Date(n+8*3600000).toISOString().slice(0,10);
    // Live IDs are fixed; the pre-existing demo uses scout/writer aliases.
    const returner = kind => actor(kind==='souvenir'?'grok':'doubao') || sim.actors.find(a=>a.name===(kind==='souvenir'?'Grok Bot':'豆包'));
    const radarPoint = {x:276,y:88}, bossRadarPoint = {x:300,y:88};
    function returnTarget(kind,e) {
      if(['entering','leaving'].includes(e.phase))return door;
      if(['returning','sitting'].includes(e.phase))return home(actor(e.id).i);
      if(kind==='radar')return radarPoint;
      return foodTarget(e.phase==='papers'?director().id:e.ids[e.index]);
    }
    function tickReturn(kind) {
      let e=sim[kind],a=e?actor(e.id):returner(kind);
      if(e && (!a || work(a)||quotaClaim(a)||receptionist(a)||sim.gate?.id===a.id||a.status==='off'))sim[kind]=e=null;
      if(e) {
        if(kind==='radar' && e.phase==='showing') {
          if(!sim.bossTarget && !sim.delivery && !sim.actors.some(a=>a.status==='waiting') && distance(sim.boss,bossRadarPoint)<1) {
            e.lookedAt ??= sim.time;
            if(sim.time-e.lookedAt<3)sim.eventBubbles.push({id:'boss',text:'有意思',until:sim.time+.04});
            if(sim.time-e.lookedAt>=3)e.phase='returning';
          }
          // Real work can keep the host occupied; do not hold the visitor forever.
          if(sim.time-e.phaseAt>=25)e.phase='returning';
        } else if(distance(a,returnTarget(kind,e))<1) {
          if(e.phase==='entering')e.phase=kind==='souvenir'?'papers':'pinning';
          else if(e.phase==='papers') {
            sim.deskFood['papers:'+director().id]={id:director().id,kind:'papers',until:sim.time+600};
            e.phase=e.ids.length?'delivering':'returning';
          } else if(e.phase==='delivering') {
            const id=e.ids[e.index];if(occupied().includes(id))food('cloud',id);
            sim.eventBubbles.push({id:a.id,text:e.index%2?'刚醒':'云上带的',until:sim.time+3});
            if(++e.index===e.ids.length)e.phase='returning';
          } else if(e.phase==='pinning') {
            e.phaseAt ??=sim.time;
            if(sim.time-e.phaseAt>=2) {
              sim.radarCard={n:e.n,day:dayOf(e.at)};e.phase='showing';e.phaseAt=sim.time;
              const nearby=sim.actors.filter(b=>b.id!==a.id&&!['away','off'].includes(b.status)&&distance(b,radarPoint)<150).sort((a,b)=>a.i-b.i).slice(0,2);
              nearby.forEach((b,i)=>sim.eventBubbles.push({id:b.id,text:i?'这个能写':'今天有啥题',until:sim.time+5}));
            }
          } else if(e.phase==='returning'){e.phase='sitting';e.phaseAt=sim.time;}
          else if(e.phase==='sitting' && sim.time-e.phaseAt>=5)e.phase='leaving';
          else if(e.phase==='leaving')sim[kind]=null;
        }
      }
      if(!sim[kind] && sim.eventQueues[kind].length) {
        if(!a)sim.eventQueues[kind].shift();
        else if(!work(a)&&!quotaClaim(a)&&!receptionist(a)&&sim.gate?.id!==a.id&&a.status!=='off') {
          const next=sim.eventQueues[kind].shift();
          sim[kind]={...next,id:a.id,phase:'entering',ids:occupied(),index:0};
          if(sim.snack?.id===a.id)sim.snack=null;
        }
      }
    }
    function radarCardNow() {return sim.radarCard?.day===dayOf(signalNow())?sim.radarCard:null;}
    function melonSource() {
      if(sim.argue && !['arriving','returning'].includes(sim.argue.phase))return {key:'argue:'+sim.argue.key,...cloudPoint()};
      if(sim.delivery?.phase==='holding')return {key:'note:'+sim.delivery.at,...handoff};
      const a=sim.actors.find(a=>a.status==='waiting');return a?{key:'waiting:'+a.id+':'+a.statusSince,...bossDesk}:null;
    }
    function gateTarget(e) {
      if(['pickup','returning','sitting'].includes(e.phase))return home(actor(e.id).i);
      if(e.phase==='delivering')return foodTarget(director().id);
      return L.gatePoint;
    }
    const gateUnavailable = a => !a || ['away','off','unknown'].includes(a.status);
    function tickGate() {
      let e=sim.gate,a=e&&actor(e.id);
      if(e && (gateUnavailable(a)||work(a)||quotaClaim(a)||receptionist(a)||sim.argue?.ids.includes(a.id)))sim.gate=e=null;
      if(e && distance(a,gateTarget(e))<1) {
        const change=phase=>{e.phase=phase;e.phaseAt=sim.time;};
        if(e.phase==='pickup') {e.arrived ??=sim.time;if(sim.time-e.arrived>=.6)change('approaching');}
        else if(e.phase==='approaching') {
          change('signal');
          if(!e.ok) {
            const nearby=sim.actors.find(b=>b.id!==a.id&&!gateUnavailable(b)&&distance(b,L.gatePoint)<100);
            if(nearby)sim.eventBubbles.push({id:nearby.id,text:'又被拦了',until:sim.time+3});
          }
        } else if(e.phase==='signal' && sim.time-e.phaseAt>=4)change(e.ok?'delivering':'returning');
        else if(e.phase==='delivering') {
          sim.gateFolder={id:director().id,until:sim.time+12};e.placed=true;change('returning');
        } else if(e.phase==='returning')change('sitting');
        else if(e.phase==='sitting' && sim.time-e.phaseAt>=2)sim.gate=null;
      }
      const q=sim.eventQueues.gate;
      while(q.length && gateUnavailable(actor(q[0].id)))q.shift();
      if(!sim.gate && q.length) {
        a=actor(q[0].id);
        if(!work(a)&&!quotaClaim(a)&&!receptionist(a)&&!sim.argue?.ids.includes(a.id)) {
          sim.gate={...q.shift(),phase:'pickup',phaseAt:sim.time};
          for(const kind of ['snack','souvenir','radar'])if(sim[kind]?.id===a.id)sim[kind]=null;
        }
      }
    }
    function tickEvents() {
      if(!sim.eventsEnabled)return;
      pruneEvents(); sim.eventBubbles=sim.eventBubbles.filter(b=>b.until>sim.time);
      for(const [k,f] of Object.entries(sim.deskFood))if(f.until<=sim.time)delete sim.deskFood[k];
      const q=sim.eventQueues;
      if(!radarCardNow())sim.radarCard=null;
      if(sim.quotaEvent && (!(sim.quota[sim.quotaEvent.id]>signalNow()) || !actor(sim.quotaEvent.id)))sim.quotaEvent=null;
      q.quota=q.quota.filter(e=>sim.quota[e.id]===e.until && e.until>signalNow());
      if(!sim.quotaEvent && q.quota.length && !work(actor(q.quota[0].id)))sim.quotaEvent=q.quota.shift();
      if(sim.argue) {
        const e=sim.argue,m=sim.scene.meeting;
        if(!m || m.since!==e.since || m.round!==e.round || e.ids.some(id=>!m.members.includes(id)||receptionist(actor(id))||actor(id).status==='waiting'||(actor(id)===director()&&boothCall())))sim.argue=null;
        else {
          const atTargets=e.ids.every((id,i)=>distance(actor(id),e.phase==='returning'?meetingTarget(id):['joining','smoke'].includes(e.phase)?cloudPoint():argumentPoint(i))<.1);
          if(e.phase==='arriving' && atTargets){e.phase='talking';e.phaseAt=sim.time;}
          else if(e.phase==='talking' && sim.time-e.phaseAt>=4){e.phase='joining';}
          else if(e.phase==='joining' && atTargets){e.phase='smoke';e.phaseAt=sim.time;}
          else if(e.phase==='smoke' && sim.time-e.phaseAt>=2.5){e.phase='huff';e.phaseAt=sim.time;}
          else if(e.phase==='huff' && sim.time-e.phaseAt>=3){e.phase='returning';}
          else if(e.phase==='returning' && atTargets)sim.argue=null;
        }
      }
      if(!sim.argue && q.argue.length) {
        const e=q.argue[0],m=sim.scene.meeting,cc=director();
        if(!m || m.since!==e.since || m.round!==e.round)q.argue.shift();
        else if(cc && m.members.includes(cc.id)) {
          const reviewers=e.members.filter(id=>id!==cc.id && m.members.includes(id)).sort();
          const other=actor(reviewers[stableHash(e.key)%reviewers.length]);
          const ids=other?[cc.id,other.id]:[];
          if(ids.length && ids.every(id=>!receptionist(actor(id)) && actor(id).status!=='waiting' && !(actor(id)===cc&&boothCall()))) {q.argue.shift();sim.argue={...e,ids,phase:'arriving',phaseAt:sim.time};}
        }
      }
      tickGate();
      tickReturn('souvenir'); tickReturn('radar');
      if(sim.snack) {
        const e=sim.snack,a=actor(e.id);
        if(!a || work(a)||quotaClaim(a)||receptionist(a)||sim.gate?.id===a.id||['away','off'].includes(a.status))sim.snack=null;
        else if(e.phase==='returning') {if(distance(a,home(a.i))<1)sim.snack=null;}
        else if(distance(a,foodTarget(e.ids[e.index]))<1) {
          const id=e.ids[e.index];if(occupied().includes(id))food('biscuit',id);
          if(++e.index===e.ids.length) {if(a.status==='idle')sim.snack=null;else e.phase='returning';}
        }
      }
      if(!sim.snack && q.snack.length) {
        const e=q.snack[0],a=actor(e.id);
        if(!a)q.snack.shift();
        else if(!work(a)&&!quotaClaim(a)&&!receptionist(a)&&sim.gate?.id!==a.id&&sim.souvenir?.id!==a.id&&sim.radar?.id!==a.id&&['done','idle'].includes(a.status)) {q.snack.shift();sim.snack={...e,ids:occupied(),index:0,phase:'delivering'};}
      }
      if(!sim.supper && q.supper.length) {
        const e=q.supper.shift();sim.supper={...e,ids:e.ids.filter(id=>actor(id)),index:0,phase:'delivering',borrowed:!sim.guard};
        if(!sim.guard)sim.guard={id:'night-guard',i:30,color:'#526a83',status:'guard',...door,path:[],dest:null,lap:0,waypoint:1};
        if(!sim.supper.ids.length)sim.supper.phase='returning';
      }
      const source=melonSource();
      if(source?.key!==sim.melonKey) {sim.melonKey=source?.key || null;if(source)queueEvent('melon',source.key,{source});}
      if(sim.melon) {
        const e=sim.melon;e.ids=e.ids.filter(id=>{const a=actor(id);return a?.status==='idle'&&!work(a)&&!quotaClaim(a)&&!receptionist(a)&&sim.gate?.id!==id&&sim.snack?.id!==id&&sim.souvenir?.id!==id&&sim.radar?.id!==id;});
        if(source){e.source=source;e.ended=null;}else e.ended ??= sim.time;
        if(e.ids.length<2 || e.ended!==null && sim.time-e.ended>=3)sim.melon=null;
      }
      if(!sim.melon && q.melon.length) {
        const e=q.melon[0];
        if(!source || source.key!==e.source.key)q.melon.shift();
        else {
          const ids=sim.actors.filter(a=>a.status==='idle'&&!isCourier(a)&&!work(a)&&!quotaClaim(a)&&!receptionist(a)&&sim.gate?.id!==a.id&&sim.snack?.id!==a.id&&sim.souvenir?.id!==a.id&&sim.radar?.id!==a.id&&a.gameSlot!=null&&distance(a,games[a.gameSlot])<1).sort((a,b)=>a.i-b.i).slice(0,3).map(a=>a.id);
          if(ids.length>=2){q.melon.shift();sim.melon={...e,ids,ended:null};}
        }
      }
    }
    function tickSupper(dt) {
      const e=sim.supper,a=sim.guard;
      if(!a)return;
      const target=e.phase==='returning'?door:foodTarget(e.ids[e.index]);
      moveTo(a,target);travel(a,dt);
      if(distance(a,target)<1) {
        if(e.phase==='returning') {if(e.borrowed)sim.guard=null;sim.supper=null;}
        else {food('noodles',e.ids[e.index]);if(++e.index===e.ids.length)e.phase='returning';}
      }
    }
    function eventSpeech() {
      const result=sim.eventBubbles.filter(b=>b.until>sim.time).map(b=>({...b})),e=sim.argue;
      if(sim.gate?.phase==='signal')result.push({id:sim.gate.id,text:sim.gate.ok?'这回过了':'我再改改'});
      if(e?.phase==='talking') {const lines=e.rejected>=3?['这条不对','你再看看第三行','证据呢','我不同意','再核一遍']:['这条不对','你再看看第三行','证据呢','我不同意'];const n=Math.min(lines.length-1,Math.floor((sim.time-e.phaseAt)*lines.length/4));result.push({id:e.ids[n%2],text:lines[n]});}
      if(e?.phase==='huff')for(const id of e.ids)result.push({id,text:'哼'});
      if(sim.melon){const n=Math.floor(sim.time/1.5),id=sim.melon.ids[n%sim.melon.ids.length];result.push({id,text:n%3===2?'':n%3?'咋了咋了':'啧啧',icon:n%3===2?'melon':null});}
      if(L.kitchen && sim.clockKnown && mealTime(signalNow()) && sim.time%12<3 && sim.actors.some(a=>a.status==='idle' && [37,38,39,40].includes(a.gameSlot) && gameActivity(a))) {
        const eaters=sim.actors.filter(a=>a.status==='idle' && [37,38,39,40].includes(a.gameSlot) && gameActivity(a)), n=Math.floor(sim.time/12), guest=eaters[n%eaters.length];
        for(const a of sim.actors) if(chefActivity(a)==='cook') result.push({id:a.id,text:n%2?`${guest.name}的${dishOf(guest.id)[1]}好了`:['开饭啦','加个菜？','小心烫'][n%3]});
      }
      // Diners name what they ordered now and then; hotpot and skewers downstairs at night.
      if(L.kitchen && sim.clockKnown && sim.time%12>=6 && sim.time%12<8.5) for(const a of sim.actors) {
        if(a.status!=='idle' || !gameActivity(a)) continue;
        if(a.gameSlot===39 || a.gameSlot===40) result.push({id:a.id,text:`${dishOf(a.id)[0]}真香`});
        if(a.gameSlot===35) result.push({id:a.id,text:['涮毛肚！','七上八下','再来一串'][Math.floor(sim.time/12)%3]});
      }
      return result;
    }
    const kitchenStaff = a => !!L.kitchen && !sim.classicLeisure && a.awayPost==='kitchen';
    const chefTarget = a => kitchenStaff(a) && a.status==='away' ? (sim.clockKnown && isBBQTime(signalNow()) ? games[34] : games[37]) : null;
    const chefActivity = a => { const p=chefTarget(a); return p && a.activity==='chef' && !a.path.length && distance(a,p)<1 ? p.kind : null; };
    // Layouts without the pool or cat tree simply skip those slots, so they never eat a colleague's turn.
    const pickSlots=(n,order,turn=0,res=[])=>leisureSlots(n,order,turn,res,slot=>!!games[slot]);
    let gameMembers = '';
    function assignGames() {
      if (legacy) return;
      const idle=sim.actors.filter(a=>a.status==='idle' && !handoffActor(a) && !isCourier(a) && !cosmeticClaim(a) && !receptionist(a) && !meetingTarget(a.id) && !(a===director() && boothCall()) && !(!legacy && feastSpot(a))).sort((a,b)=>a.i-b.i);
      // Only a page that told us the real clock (live feed, demo, replay) has breakfast; bare simulations never do.
      const breakfast=typeof sim.forceBreakfast==='boolean' ? sim.forceBreakfast : !!sim.clockKnown && (isBreakfast(signalNow()) || (isFunTime(signalNow()) ? 'fun' : false));
      const meal=!!L.kitchen && !sim.classicLeisure && sim.clockKnown ? (mealTime(signalNow()) ? 'kitchen' : isBBQTime(signalNow()) ? 'bbq' : '') : '';
      const reserved=sim.actors.map(chefTarget).filter(Boolean).map(p=>games.indexOf(p));
      const feast=!!feasting();
      const rotation=!legacy && !sim.classicLeisure && sim.clockKnown ? Math.floor(signalNow()/1200000) : 0;
      const party=playing('party') ? 'party' : playing('song') ? 'song' : '';
      const key=meal+'|'+reserved.join(',')+'|'+breakfast+'|'+feast+'|'+!!sim.funFirst+'|'+party+'|'+rotation+'|'+idle.map(a=>a.id).join(','); if(key===gameMembers) return; gameMembers=key;
      const slots=sim.classicLeisure ? (idle.length===1 ? [4] : idle.length===3 ? [0,1,4] : games.slice(0,Math.min(10,idle.length)).map((_,i)=>i)) : feast ? pickSlots(idle.length,LEISURE_ORDER.filter(slot=>(slot<16||slot>19)&&!reserved.includes(slot))).filter(slot=>games[slot]) : party==='song' ? pickSlots(idle.length,[22,23,24,29,30,31,32,33,25,26,27,28,...LEISURE_ORDER.filter(i=>i<22)]).filter(slot=>games[slot]) : sim.funFirst || party ? pickSlots(idle.length,[22,23,24,25,26,27,28,29,30,31,32,33,...LEISURE_ORDER.filter(i=>i<22)]).filter(slot=>games[slot]) : pickSlots(idle.length,meal==='kitchen'?KITCHEN_ORDER:meal==='bbq'?(isBreakfast(signalNow())?BBQ_ORDER:[34,35,36,...LEISURE_ORDER.filter(i=>i<34||i>36)]):breakfast,rotation,reserved).filter(slot=>games[slot]);
      for(const a of sim.actors) if(!idle.includes(a) || !slots.includes(a.gameSlot)) a.gameSlot=null;
      const pending=idle.filter(a=>a.gameSlot==null);
      for(const slot of slots) if(!idle.some(a=>a.gameSlot===slot) && pending.length) pending.shift().gameSlot=slot;
    }
    function gameActivity(a) {
      if(legacy || a.status!=='idle' || a.activity || a.gameSlot==null || a.path.length || distance(a,games[a.gameSlot])>=1) return null;
      const p=games[a.gameSlot];
      const pair=p.kind==='pingpong' ? [0,1] : p.kind==='chess' ? [2,3] : null;
      if(pair && !pair.every(slot=>sim.actors.some(b=>b.gameSlot===slot && b.status==='idle' && !b.activity && !b.path.length && distance(b,games[slot])<1))) return null;
      // The two old beanbags are massage chairs on the office page (the published film keeps nap/read).
      return ['nap','read'].includes(p.kind) && !sim.classicLeisure ? 'massage' : p.kind;
    }
    function pingPongBall() {
      if(!sim.actors.some(a=>gameActivity(a)==='pingpong')) return null;
      const phase=(sim.time%1.6)/.8, travel=phase<=1?phase:2-phase;
      return {x:154+Math.round(Math.sin(sim.time*Math.PI/1.6)*7),y:279+Math.round(travel*30),size:3};
    }
    function tickGuard(dt) {
      if (sim.eventsEnabled && sim.supper) { tickSupper(dt); return; }
      if (!sim.night || !sim.scene.guard) { sim.guard = null; return; }
      if (!sim.guard) sim.guard = {id:'night-guard',i:30,color:'#526a83',status:'guard',...door,path:[],dest:null,lap:0,waypoint:1};
      const a = sim.guard;
      if (sim.reception?.mode==='closed' || sim.scene.guard.phase === 'done' || a.lap) moveTo(a,door);
      else {
        moveTo(a,patrol[a.waypoint]);
        if (distance(a,patrol[a.waypoint]) < 1) { if (++a.waypoint === patrol.length) { a.lap++; a.waypoint = 0; } }
      }
      travel(a,dt*.42);
    }
    function moveTo(a, p) {
      if (a.dest && distance(a.dest, p) < 1) return;
      a.dest = { ...p }; a.path = route(a, p, L);
    }
    function setStatus(id, status, since) {
      const a = sim.actors.find(a => a.id === id);
      if (!a) return;
      if (a.status !== status) { a.status = status; a.changed = sim.time; a.doneArrived = null; a.dest = null; }
      if (since) a.statusSince = since;
    }
    function notice(n) {
      sim.notices.push({ ...n }); sim.notices = sim.notices.slice(-20);
      sim.deliveries.push({ ...n });
    }
    function travel(a, dt) {
      let budget = dt * 59;
      while (a.path.length && budget > 0) {
        const p = a.path[0], d = distance(a, p);
        if (d < budget) { a.x = p.x; a.y = p.y; budget -= d; a.path.shift(); }
        else { a.x += (p.x - a.x) / d * budget; a.y += (p.y - a.y) / d * budget; budget = 0; }
      }
    }
    // Night: nobody goes home (7×24). Colleagues with no work nap in the office: two beanbags and the yoga mat first,
    // everyone else head-down at their own desk; a real signal wakes them straight back to work. Away still leaves.
    const napper = b => b.status==='off' && !kitchenStaff(b) && !legacy && !sim.classicLeisure && !feastSpot(b) && !quotaClaim(b);
    // Each napper keeps the spot it got until it wakes; a free spot goes to the next one (lowest desk first).
    sim.napSeats = {};
    function napSpot(a) {
      const spots=[...(L.beds||[]),games[6],games[7],games[15]], charge=sim.quotaEvent && chargeBed() ? (L.beds||[]).indexOf(chargeBed()) : -1;
      for (const id of Object.keys(sim.napSeats)) { const b=actor(id); if (!b || !napper(b) || sim.napSeats[id]===charge) delete sim.napSeats[id]; }
      if (!napper(a)) return home(a.i);
      if (sim.napSeats[a.id] === undefined) {
        for (const b of sim.actors.filter(b=>napper(b) && sim.napSeats[b.id]===undefined).sort((x,y)=>x.i-y.i)) {
          const taken=new Set(Object.values(sim.napSeats));
          const free=spots.findIndex((p,i)=>p && i!==charge && !taken.has(i));
          sim.napSeats[b.id]=free;
        }
      }
      return spots[sim.napSeats[a.id]] || home(a.i);
    }
    const napping = a => napper(a) && !a.path.length && distance(a,napSpot(a))<1;
    const inBed = a => napping(a) && napSpot(a).kind==='bed';
    // Dim sum from the boss (or a visitor): for two minutes everyone free — idle or napping — eats at the teahouse.
    const feasting = () => sim.feast && sim.time < sim.feast.until && !legacy && !sim.classicLeisure && L.tea;
    function feastSpot(a) {
      if(!feasting() || a.status==='off' && kitchenStaff(a) || !['idle','off'].includes(a.status) || meetingTarget(a.id) || handoffActor(a) || (a===director()&&boothCall()) || receptionist(a) || cosmeticClaim(a) || (isCourier(a) && sim.delivery)) return null;
      const order=sim.actors.filter(b=>!(b.status==='off' && kitchenStaff(b)) && ['idle','off'].includes(b.status) && !meetingTarget(b.id) && !handoffActor(b) && !(b===director()&&boothCall()) && !receptionist(b) && !cosmeticClaim(b) && !(isCourier(b) && sim.delivery)).sort((x,y)=>x.i-y.i);
      return [...L.tea,...(L.feastStand||[])][order.indexOf(a)] || null;
    }
    const feastEating = a => { const p=feastSpot(a); return !!p && !a.path.length && distance(a,p)<1; };
    function tick(dt) {
      sim.time += dt; sim.flights = sim.flights.filter(f => sim.time - f.at < 1); tickHandoff(); tickEvents(); tickGuard(dt); assignGames();
      const waiting = sim.actors.filter(a => a.status === 'waiting' && (!isCourier(a) || !sim.delivery));
      if (!sim.delivery && sim.deliveries.length && courier) {
        sim.delivery = { ...sim.deliveries.shift(), phase: 'walking', arrived: null };
        if (courier) courier.dest = null;
      }
      for (const a of sim.actors) {
        let target;
        const cosmetic=cosmeticClaim(a);
        a.activity = a === director() && boothCall() ? 'call' : meetingTarget(a.id) ? 'meeting' : null;
        if(handoffActor(a)) {
          a.activity=a===director()?'handoff-walk':'handoff-receive';
          target=a!==director() || ['pickup','returning'].includes(sim.handoffWalk.phase)?home(a.i):handoffPoint(sim.actors.find(b=>b.id===sim.handoffWalk.id));
        }
        else if (cosmetic) {a.activity=cosmetic.kind; target=cosmetic.target;}
        else if (a.activity === 'call') target = booth;
        else if (a.activity === 'meeting') target = meetingTarget(a.id);
        else if (receptionist(a) && (sim.reception.mode==='normal' ? freeForReception(a) : !sim.delivery)) { a.activity='reception'; target=receptionTarget(a); }
        else if (isCourier(a) && sim.delivery) target = sim.delivery.phase === 'returning' ? home(a.i) : handoff;
        else if (a.status === 'busy' || a.status === 'unknown' || a.status === 'done' && (!legacy || a.doneArrived == null || sim.time - a.doneArrived < 2)) target = home(a.i);
        else if (a.status === 'waiting') target = queuePoint(Math.max(0, waiting.indexOf(a)));
        else if (chefTarget(a)) {a.activity='chef'; target=chefTarget(a);}
        else if (feastSpot(a)) target = feastSpot(a);
        else if (a.status === 'away' || a.status === 'off' && (legacy || sim.classicLeisure || kitchenStaff(a))) target = door;
        else if (a.status === 'off') target = napSpot(a);
        else if (a.status === 'idle' && (isCourier(a) || legacy && [4, 5, 9].includes(a.i))) target = home(a.i);
        else target = legacy ? { x: mvRest[a.i][0], y: mvRest[a.i][1] } : games[a.gameSlot] || home(a.i);
        moveTo(a, target); travel(a, dt*(handoffActor(a)?sim.handoffWalk.speed:1));
        if (a.status === 'done' && a.doneArrived == null && distance(a, home(a.i)) < 1) a.doneArrived = sim.time;
      }
      if (sim.delivery) {
        const d = sim.delivery;
        if (d.phase === 'walking' && courier && !courier.activity && distance(courier, handoff) < 1 && distance(sim.boss, bossDesk) < 1) { d.phase = 'holding'; d.arrived = sim.time; }
        if (d.phase === 'holding' && sim.time - d.arrived >= 8) { d.phase = 'returning'; courier.dest = null; sim.delivered++; }
        if (d.phase === 'returning' && courier && distance(courier, home(courier.i)) < 1) sim.delivery = null;
      }
      // A scripted walk (the MV opening the door in the morning, turning the lights off at night) overrides the rest.
      if (sim.bossTarget) moveTo(sim.boss, sim.bossTarget);
      else if (waiting.length || sim.delivery) moveTo(sim.boss, bossDesk);
      else if (sim.eventsEnabled && sim.radar?.phase==='showing') moveTo(sim.boss,bossRadarPoint);
      // Someone is in for a check-up: the boss goes up to the clinic as the doctor (she trained in medicine).
      else if (L.clinicDoctor && sim.actors.some(a => gameActivity(a) === 'checkup')) moveTo(sim.boss, L.clinicDoctor);
      else if (sim.time >= sim.nextWander) {
        moveTo(sim.boss, [tour[0],pantry,bossDesk,tour[3]][Math.floor(random() * 4)]);
        sim.nextWander = sim.time + 7 + random() * 5;
      }
      travel(sim.boss, dt * (sim.bossTarget || waiting.length || sim.delivery || sim.radar?.phase==='showing' ? 1 : 0.5));
    }
    // Visitors: people looking at the public page. Each comes in through the door, strolls between a few spots the
    // host also uses (all known walkable), lingers, and leaves through the door when the count drops. Five at most.
    sim.visitors = []; sim.visitorTarget = 0; sim.visitorSeq = 0; sim.hello = null;
    // Treats: a visitor picks something from the menu; a visitor figure carries it to the pantry spot, everyone at
    // work says thanks for a few seconds, and a cup sits on every occupied desk for a while.
    const TREATS = ['milktea', 'coffee', 'cake', 'melon', 'dimsum'];
    sim.playState = null;
    const PLAY_SECONDS = {party:120, song:90, cheer:4, cat:60};
    const playing = kind => !!sim.playState && sim.playState.kind === kind && sim.time < sim.playState.until;
    // A visitor taps 一起玩: only that page performs it (no server write). Party/song bring a guest downstairs.
    function play(kind) {
      if (legacy || sim.classicLeisure || !L.fun || !PLAY_SECONDS[kind]) return false;
      sim.playState = {kind, at:sim.time, until:sim.time + PLAY_SECONDS[kind]};
      sim.hello = {at:sim.time, visitor:null, kind:'play-' + kind, x:door.x, y:door.y};
      if ((kind === 'party' || kind === 'song') && !sim.visitors.some(v => v.partyGuest)) {
        const seq = ++sim.visitorSeq;
        sim.visitors.push({id:`guest-${seq}`, visitor:true, runner:true, partyGuest:true, i:20 + seq % 4, color:'#5fa8d3', ...door, path:[], dest:null, phase:'touring', until:null, status:'visiting'});
      }
      return true;
    }
    sim.treats = []; sim.thanks = null; sim.deskTreat = null; sim.carrier = null; sim.feast = null; sim.clockKnown = !!sim.clockKnown;
    const dropFor = kind => kind==='dimsum' && L.feastDrop && !legacy ? L.feastDrop : pantry;
    function treat(kind, at) { if (TREATS.includes(kind)) sim.treats.push({ kind, at }); }
    const thanksNow = () => sim.thanks && sim.time - sim.thanks.at < GREET_SECONDS ? sim.thanks : null;
    const deskTreatNow = () => sim.deskTreat && sim.time < sim.deskTreat.until ? sim.deskTreat : null;
    function tickTreats(dt) {
      if (!sim.carrier && sim.treats.length) {
        const next = sim.treats.shift();
        let v = sim.visitors.find(x => x.phase === 'touring' && !x.carry);
        if (!v) {
          const seq = ++sim.visitorSeq;
          v = { id: `runner-${seq}`, visitor: true, runner: true, i: 20 + seq % 4, color: '#c9a35b', x: door.x, y: door.y, path: [], dest: null, phase: 'touring', until: null, status: 'visiting' };
          sim.visitors.push(v);
        }
        v.carry = next.kind; v.dest = null; sim.carrier = v.id;
      }
      const v = sim.carrier && sim.visitors.find(x => x.id === sim.carrier);
      if (!v) { sim.carrier = null; return; }
      if (distance(v, dropFor(v.carry)) < 1) {
        sim.thanks = { at: sim.time, kind: v.carry };
        if (v.carry === 'dimsum' && dropFor('dimsum') !== pantry) sim.feast = { at: sim.time, until: sim.time + 120, night: isNight(signalNow()) };
        else sim.deskTreat = { kind: v.carry, until: sim.time + 120 };
        v.carry = null; sim.carrier = null; v.dest = null; v.until = null;
        if (v.runner) { v.phase = 'leaving'; }
      }
    }
    const GREET_SECONDS = 3;
    const greeting = () => sim.hello && sim.time - sim.hello.at < GREET_SECONDS ? sim.hello : null;
    // A wave on request (a page that got no greeting, or a visitor asking for a photo): everyone turns to the door.
    function wave(kind = 'welcome') { sim.hello = { at: sim.time, visitor: null, kind, x: door.x, y: door.y }; }
    function setVisitors(n) { sim.visitorTarget = Math.max(0, Math.min(5, Math.floor(Number(n) || 0))); }
    function tickVisitors(dt) {
      // Runners (sent with a treat when nobody is visiting) are not counted against the visitor target.
      const touring = () => sim.visitors.filter(v => v.phase === 'touring' && !v.runner).length;
      while (touring() < sim.visitorTarget && sim.visitors.length < 5) {
        const seq = ++sim.visitorSeq;
        sim.visitors.push({ id: `visitor-${seq}`, visitor: true, i: 20 + seq % 4, color: ['#e9a23b', '#d9605a', '#5fa8d3', '#8f6fd6'][seq % 4], x: door.x, y: door.y, path: [], dest: null, phase: 'touring', until: null, status: 'visiting' });
        // Someone just came in: everyone at work looks up from the keyboard and says hello for a few seconds.
        sim.hello = { at: sim.time, visitor: `visitor-${seq}`, x: door.x, y: door.y };
      }
      let extra = touring() - sim.visitorTarget;
      for (const v of sim.visitors) if (extra > 0 && v.phase === 'touring' && !v.runner && !v.carry) { v.phase = 'leaving'; v.dest = null; v.until = null; extra--; }
      const listeners = sim.scene.meeting ? sim.visitors.filter(v => v.phase === 'touring' && !v.runner && !v.carry).slice(0,2) : [];
      for (const v of sim.visitors) {
        const seat = listeners.indexOf(v), wasListening = v.listening;
        v.listening = seat >= 0;
        if (wasListening && !v.listening) { v.dest = null; v.until = null; }
        if (v.listening) { moveTo(v,audience[seat]); travel(v,dt*.7); continue; }
        if (v.phase === 'leaving') { moveTo(v, door); travel(v, dt * 0.8); continue; }
        if (v.partyGuest) { if ((playing('party') || playing('song')) && L.partySpot) moveTo(v, L.partySpot); else { v.phase = 'leaving'; moveTo(v, door); } travel(v, dt * 0.9); continue; }
        if (v.carry) { moveTo(v, dropFor(v.carry)); travel(v, dt * 0.8); continue; }
        if (!v.dest) { moveTo(v, tour[Math.floor(random() * tour.length)]); v.until = null; }
        else if (!v.path.length) {
          if (v.until == null) v.until = sim.time + 4 + random() * 6;
          else if (sim.time >= v.until) { const next = tour.filter(t => distance(t, v) > 1); moveTo(v, next[Math.floor(random() * next.length)]); v.until = null; }
        }
        travel(v, dt * 0.7);
      }
      sim.visitors = sim.visitors.filter(v => !(v.phase === 'leaving' && distance(v, door) < 1));
    }
    function step(ms) { for (let left = ms; left > 0; left -= 20) { const dt = Math.min(left, 20) / 1000; tick(dt); tickReception(dt); tickTreats(dt); tickVisitors(dt); } }
    function relayout(selection) {
      const next=create(sim.actors.map(a=>({...a,desk:a.i})),seed,selection);
      for(const key of ['time','night','eventsEnabled','clockBase','quota','eventQueues','seenEvents','quotaEvent','gate','gateFolder','gateHistoryCounts','argue','snack','souvenir','radar','radarCard','supper','melon','melonKey','deskFood','eventBubbles','notices','deliveries','delivery','delivered','treats','thanks','deskTreat','feast','playState','clockKnown','hello','visitorTarget','visitorSeq','carrier','reception','meetQueue','seenMeets']) next[key]=JSON.parse(JSON.stringify(sim[key]));
      if(next.reception) Object.assign(next.reception.visitor,next.layout.door,{path:[],dest:null});
      next.replaying=sim.replaying;next.replayVisitorsUntil=sim.replayVisitorsUntil;next.funFirst=sim.funFirst;next.forceBreakfast=sim.forceBreakfast;next.classicLeisure=sim.classicLeisure;next.napSeats={...sim.napSeats};
      next.scene=JSON.parse(JSON.stringify(sim.scene));next.dispatchCall=sim.dispatchCall && {...sim.dispatchCall};next.handoffWalk=sim.handoffWalk && {...sim.handoffWalk};next.flights=[];
      for(const a of sim.actors) Object.assign(next.actors.find(b=>b.id===a.id),{status:a.status,statusSince:a.statusSince,changed:a.changed,doneArrived:a.doneArrived,gameSlot:a.gameSlot});
      next.visitors=sim.visitors.map(v=>({...v,...next.layout.door,path:[],dest:null,until:null}));
      next.place();
      if(sim.guard && next.guard && !next.supper) {const waypoint=Math.min(sim.guard.waypoint,next.layout.patrol.length-1);Object.assign(next.guard,sim.guard.lap || sim.scene.guard?.phase==='done'?next.layout.door:next.layout.patrol[waypoint],{lap:sim.guard.lap,waypoint,path:[],dest:null});}
      next.flights=sim.flights.map(f=>{
        const desk=id=>{const a=next.actors.find(a=>a.id===id),p=next.layout.desks[a.i];return {x:p[0]+17,y:p[1]+4};};
        const cc=next.actors.find(a=>a.id===director()?.id);
        return {...f,from:f.returning?desk(f.id):cc.activity?{x:cc.x,y:cc.y-12}:desk(cc.id),to:desk(f.returning?cc.id:f.id)};
      });
      return next;
    }
    function place() {
      tick(0); tickReception(0); tickVisitors(0);
      for(const a of [...sim.actors,...sim.visitors]) if(a.dest) {a.x=a.dest.x;a.y=a.dest.y;a.path=[];}
      const v=sim.reception?.visitor;if(v?.dest) Object.assign(v,v.dest,{path:[]});
      // The host waits at the new desk; delivery phases and their eight-second timer survive rotation.
      Object.assign(sim.boss,bossDesk,{path:[],dest:null});
    }
    return Object.assign(sim, { chefTarget,chefActivity,play,playing,chargeBed,inBed,feastSpot,feastEating,napping,napSpot,leisure:games,layout:L,relayout,place,isCourier,handoffSpeech,boothCall,replayEvent,receiveGate,receiveEventHistory,setQuota,eventSpeech,foodNow,radarCardNow,cosmeticClaim,quotaClaim,pruneEvents, meet,receptionSpeech,receptionTarget, setScene, meetingTarget, meetingStanding, gameActivity, pingPongBall, flightPoints, step, setStatus, notice, setVisitors, greeting, wave, GREET_SECONDS, treat, thanksNow, deskTreatNow, TREATS, pantry });
  }
  function createReplay(history,roster,seed=7,selection=false) {
    const data=validateHistory(history,roster),start=Date.parse(data.day+'T00:00:00+08:00');
    const items=[...data.timeline.map(e=>({type:'status',at:Date.parse(e.at),e})),...data.events.map(e=>({type:'event',at:Date.parse(e.at),e}))].sort((a,b)=>a.at-b.at || (a.type===b.type?0:a.type==='status'?-1:1));
    const end=items.length?Math.min(start+86400000-1,items.at(-1).at+60000):start;
    let index=0,lastChange=null;
    const replay={day:data.day,clock:items.length?Math.max(start,items[0].at-60000):start,speed:240,skips:0,events:[],line:'',noTimeline:!data.timeline.length,truncated:!!data.timelineTruncated,ended:false};
    replay.sim=create(roster,seed,selection);replay.sim.replaying=true;
    for(const a of replay.sim.actors){replay.sim.setStatus(a.id,'unknown',new Date(replay.clock).toISOString());a.badge='';a.workedToday=0;}
    function apply() {
      const sim=replay.sim;
      while(index<items.length && items[index].at<=replay.clock) {
        const item=items[index++];lastChange=item.at;sim.clockBase=item.at-sim.time*1000;
        if(item.type==='status')sim.setStatus(item.e.id,item.e.s,item.e.at);
        else {replay.events.push(item.e);replay.line=eventText(item.e,roster)||'记录了一件事';sim.replayEvent(item.e);}
      }
      sim.clockBase=replay.clock-sim.time*1000;sim.night=isNight(replay.clock);
    }
    replay.next=()=>{
      if(index<items.length) {replay.clock=Math.max(replay.clock,items[index].at-60000);apply();}
    };
    replay.step=ms=>{
      for(let left=ms;left>0;left-=20) {
        const part=Math.min(20,left),next=items[index];
        if(next && lastChange!==null && replay.clock-lastChange>=20*60000 && next.at-replay.clock>60000) {replay.clock=next.at-60000;replay.skips++;}
        replay.clock=Math.min(end,replay.clock+part*replay.speed);apply();
        replay.ended=replay.clock>=end;
        if(replay.sim.replayVisitorsUntil<=replay.sim.time)replay.sim.setVisitors(0);
        replay.sim.step(part);
      }
    };
    apply();return replay;
  }
  const TREAT_NAMES = {milktea:'奶茶',coffee:'咖啡',cake:'蛋糕',melon:'西瓜',dimsum:'点心'};
  const validISO = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Date.parse(v) > 946684800000 && Date.parse(v) < 4102444800000 && new Date(v.slice(0,10)+'T00:00:00Z').toISOString().slice(0,10) === v.slice(0,10);
  // Structured public signals only. Missing extension fields mean an old office, not made-up zeros.
  function validateSceneFields(data) {
    const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
    const int = (v,max=1e9) => Number.isInteger(v) && v >= 0 && v <= max;
    const iso = validISO;
    if(data.noticesToday!==undefined && !int(data.noticesToday)) throw new Error('Invalid scene state');
    const ids = new Set(data.roster.map(a => a.id)), list = v => Array.isArray(v) && v.length <= 11 && v.every(id => ids.has(id)) && new Set(v).size === v.length;
    const fail = () => { throw new Error('Invalid scene state'); };
    if(data.quota!==undefined && !(object(data.quota) && Object.keys(data.quota).length<=11 && Object.entries(data.quota).every(([id,until])=>ids.has(id)&&iso(until)))) fail();
    if(data.meets!==undefined && !(Array.isArray(data.meets) && data.meets.length<=10 && data.meets.every(m=>object(m) && Object.keys(m).length===2 && Object.hasOwn(MEET_NAMES,m.kind) && iso(m.at)))) fail();
    if(data.meetsToday!==undefined && !(object(data.meetsToday) && Object.entries(data.meetsToday).every(([k,v])=>Object.hasOwn(MEET_NAMES,k)&&int(v)))) fail();
    if (data.scene !== undefined) {
      const s = data.scene; if (!object(s) || Object.keys(s).some(k=>!['meeting','dispatched','call','disk','guard','snack','supper','souvenir','radar','gate'].includes(k)) || !list(s.dispatched) || s.dispatched.some(id => id === 'cc' || data.roster.find(a=>a.id===id)?.desk === 0)) fail();
      if(s.gate!==undefined && s.gate!==null && !(object(s.gate) && Object.keys(s.gate).sort().join(',')==='at,id,n,ok' && ids.has(s.gate.id) && iso(s.gate.at) && typeof s.gate.ok==='boolean' && int(s.gate.n) && s.gate.n>=1))fail();
      if(s.snack!==undefined && s.snack!==null && !(object(s.snack) && Object.keys(s.snack).sort().join(',')==='at,id' && ids.has(s.snack.id) && iso(s.snack.at))) fail();
      if(s.supper!==undefined && s.supper!==null && !(object(s.supper) && Object.keys(s.supper).sort().join(',')==='at,ids' && list(s.supper.ids) && s.supper.ids.length>0 && iso(s.supper.at))) fail();
      if(s.souvenir!==undefined && s.souvenir!==null && !(object(s.souvenir) && Object.keys(s.souvenir).join(',')==='at' && iso(s.souvenir.at)))fail();
      if(s.radar!==undefined && s.radar!==null && !(object(s.radar) && Object.keys(s.radar).sort().join(',')==='added,at,n' && iso(s.radar.at) && int(s.radar.n,100000) && int(s.radar.added,100000) && s.radar.added>=1 && s.radar.n>=s.radar.added))fail();
      if(s.meeting?.roundAt!==undefined && !iso(s.meeting.roundAt))fail();
      if (s.meeting !== null) { const m=s.meeting; if (!object(m) || !['review','huddle'].includes(m.kind) || !iso(m.since) || !list(m.members) || !m.members.length || !(m.round === null || int(m.round,10000)) || !(m.slide === null || object(m.slide) && ['adopted','rejected','open'].every(k=>int(m.slide[k],100000)))) fail(); }
      if (s.call !== null && !(object(s.call) && iso(s.call.since))) fail();
      if (s.disk !== null && !(object(s.disk) && Number.isFinite(s.disk.usedPct) && s.disk.usedPct >= 0 && s.disk.usedPct <= 100)) fail();
      if (s.guard !== null && !(object(s.guard) && ['patrol','done'].includes(s.guard.phase) && iso(s.guard.at) && (s.guard.ok === null || typeof s.guard.ok === 'boolean'))) fail();
    }
    if (data.stats !== undefined) {
      const s=data.stats; if (!object(s) || typeof s.since !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s.since) || !iso(s.since+'T00:00:00Z') || new Date(s.since).toISOString().slice(0,10)!==s.since || !['visitorsTotal','treatsTotal','meetingsTotal','handoffsTotal','callsTotal'].every(k=>int(s[k])) || !object(s.today) || !['visitors','treats','meetings','handoffs','calls'].every(k=>int(s.today[k]))) fail();
      for(const k of ['snacks','suppers','souvenirs','radars','gatesBlocked','gatesPassed'])if(s[k+'Total']!==undefined&&!int(s[k+'Total']) || s.today[k]!==undefined&&!int(s.today[k]))fail();
      if((s.meetsTotal!==undefined&&!int(s.meetsTotal)) || (s.today.meets!==undefined&&!int(s.today.meets))) fail();
    }
    if (data.events !== undefined) {
      const keys = ['at','kind','ids','round','minutes','treat','n','ok','review','rejected','clear','added','id'];
      if (!Array.isArray(data.events) || data.events.length > 500) fail();
      for (const e of data.events) {
        if (!object(e) || Object.keys(e).some(k=>!keys.includes(k)) || !iso(e.at) || typeof e.kind !== 'string' || !/^[a-z-]{1,16}$/.test(e.kind) || (e.ids !== undefined && !list(e.ids)) || (e.round !== undefined && !int(e.round,10000)) || (e.minutes !== undefined && !int(e.minutes,1440)) || (e.n !== undefined && !int(e.n,100000)) || (e.treat !== undefined && !Object.hasOwn(TREAT_NAMES,e.treat)) || (e.ok !== undefined && typeof e.ok !== 'boolean') || (e.review !== undefined && typeof e.review !== 'boolean') || (e.clear !== undefined && typeof e.clear !== 'boolean') || (e.rejected!==undefined && !int(e.rejected,100000))) fail();
        if(e.id!==undefined && !ids.has(e.id))fail();
        if(e.kind==='gate' && (Object.keys(e).sort().join(',')!=='at,id,kind,ok' || !ids.has(e.id) || typeof e.ok!=='boolean'))fail();
        if(e.kind==='souvenir' && Object.keys(e).sort().join(',')!=='at,kind')fail();
        if(e.added!==undefined && !int(e.added,100000))fail();
        if(e.kind==='radar' && (Object.keys(e).sort().join(',')!=='added,at,kind,n' || !int(e.n,100000) || !int(e.added,100000) || e.added<1 || e.added>e.n))fail();
        if ((['snack','quota'].includes(e.kind) && e.ids?.length!==1) || (e.kind==='quota' && typeof e.clear!=='boolean') || (e.kind==='supper' && !e.ids?.length) || (e.kind==='argue' && (e.round===undefined || !(e.rejected>=1))))fail();
        if ((e.kind === 'handoff' && e.ids?.length !== 2) || (e.kind === 'return' && e.ids?.length !== 1) || (e.kind === 'meeting' && !e.ids?.length) || (e.kind === 'round' && e.round === undefined) || (e.kind === 'meeting-end' && e.minutes === undefined) || (e.kind === 'treat' && e.treat === undefined) || (e.kind === 'visitor' && e.n === undefined) || (e.kind === 'guard' && e.ok === undefined)) fail();
      }
    }
    return data;
  }
  const validDay = day => typeof day==='string' && /^\d{4}-\d{2}-\d{2}$/.test(day) && validISO(day+'T00:00:00Z');
  function validateHistory(data,roster,expectedDay=data?.day) {
    const object=v=>v!==null && typeof v==='object' && !Array.isArray(v);
    const fail=()=>{throw new Error('Invalid history');};
    const keys=['visitors','treats','meets','snacks','suppers','souvenirs','radars','meetings','handoffs','calls','notes','gatesBlocked','gatesPassed'];
    if(!object(data) || Object.keys(data).some(k=>!['day','events','stats','timeline','timelineTruncated'].includes(k)) || !validDay(data.day) || data.day!==expectedDay || !Array.isArray(data.events) || !object(data.stats) || Object.keys(data.stats).join(',')!=='today' || !object(data.stats.today) || Object.entries(data.stats.today).some(([k,v])=>!keys.includes(k)||!Number.isInteger(v)||v<0||v>1e9))fail();
    validateSceneFields({roster,events:data.events,stats:{since:data.day,visitorsTotal:0,treatsTotal:0,meetingsTotal:0,handoffsTotal:0,callsTotal:0,today:data.stats.today}});
    const sameDay=at=>validISO(at) && new Date(Date.parse(at)+8*3600000).toISOString().slice(0,10)===data.day;
    if(!data.events.every(e=>sameDay(e.at)))fail();
    const ids=new Set(roster.map(a=>a.id)),timeline=data.timeline ?? [];
    if(data.timeline===null || !Array.isArray(timeline) || timeline.length>3000 || timeline.some(e=>!object(e)||Object.keys(e).sort().join(',')!=='at,id,s'||!sameDay(e.at)||!ids.has(e.id)||!['busy','waiting','done','idle','away','off','unknown'].includes(e.s)))fail();
    if(data.timelineTruncated!==undefined && typeof data.timelineTruncated!=='boolean')fail();
    return {day:data.day,events:data.events.map(e=>({...e,...(e.ids?{ids:[...e.ids]}:{})})),stats:{today:{...data.stats.today}},timeline:timeline.map(({at,id,s})=>({at,id,s})),...(data.timelineTruncated!==undefined?{timelineTruncated:data.timelineTruncated}:{})};
  }
  function validateHistoryList(data) {
    if(!data || Object.keys(data).join(',')!=='days' || !Array.isArray(data.days) || data.days.length>14 || data.days.some((e,i)=>!e||Object.keys(e).sort().join(',')!=='day,events,timeline'||!validDay(e.day)||!Number.isInteger(e.events)||e.events<0||e.events>500||!Number.isInteger(e.timeline)||e.timeline<0||e.timeline>3000||i>0&&data.days[i-1].day<=e.day))throw new Error('Invalid history list');
    return data.days.map(({day,events,timeline})=>({day,events,timeline}));
  }
  function eventText(e,roster) {
    const name = id => roster.find(a=>a.id===id)?.name || '', names = (e.ids || []).map(name);
    switch(e.kind) {
      case 'handoff': return `${names[0]} 把一份活递给 ${names[1]}`;
      case 'return': return `${names[0]} 交回来了`;
      case 'meeting': return `CC 叫上 ${names.filter(n=>n!=='CC').join('、')}${e.review ? ' 开互审会' : ' 碰了个头'}`;
      case 'round': return `互审进到第 ${e.round} 轮`;
      case 'meeting-end': return `散会，开了 ${e.minutes} 分钟`;
      case 'call': return 'CC 去电话亭打长途（问外面的顾问）';
      case 'call-end': return '电话打完了';
      case 'treat': return `有人送来${['milktea','coffee'].includes(e.treat)?'一杯':e.treat==='cake'?'一块':'一份'}${TREAT_NAMES[e.treat]}`;
      case 'visitor': return `来了 ${e.n} 位客人`;
      case 'gate': return e.ok ? `${name(e.id)} 的活过了安检门` : e.id==='cc' || name(e.id)==='CC' ? 'CC 被安检门拦下' : `${name(e.id)} 交的活在安检门被拦下，回去返工`;
      case 'souvenir': return 'Grok Bot 从云上回来，给大家带了云朵棉花糖';
      case 'radar': return `豆包雷达回来了，带回 ${e.added} 个选题`;
      case 'snack': return `${names[0]} 交了大活，请大家吃点心`;
      case 'supper': return `保安给 ${names.join('、')} 送了夜宵`;
      case 'quota': return `${names[0]} ${e.clear?'额度恢复，回座位':'撞额度，回休息室充电'}`;
      case 'argue': return `会议室吵起来了（第 ${e.round} 轮，反驳 ${e.rejected} 条）`;
      case 'reception': return '接待了一拨来谈事的客人';
      case 'guard': return `夜班保安巡完一圈，备份${e.ok?' ✓':'没过'}`;
      default: return null;
    }
  }
  // Springs for the drawing only: mass 1, x'' = -k(x - target) - c v, in fixed 1/240 s steps so 30 and 120 fps agree
  // (the memory-fade integrator). Reduced motion lifts the damping ratio to 1, which never overshoots. Every pose
  // below is a function of the event's age, so a still actor integrates nothing and the MV recorder can seek.
  function spring(stiffness, ratio, reduced = false) { return { k: stiffness, c: Math.max(ratio, reduced ? 1 : 0) * 2 * Math.sqrt(stiffness), x: 0, v: 0, target: 0 }; }
  function springStep(s, dt) {
    const h = 1 / 240;
    let left = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 3) : 0;
    while (left > 1e-9) {
      const step = Math.min(h, left);
      s.v += (-s.k * (s.x - s.target) - s.c * s.v) * step;
      s.x += s.v * step;
      left -= step;
    }
    if (!Number.isFinite(s.x) || !Number.isFinite(s.v)) { s.x = Number.isFinite(s.target) ? s.target : 0; s.v = 0; }
    return s;
  }
  function springAt(stiffness, ratio, age, { from = 0, to = 1, v = 0 } = {}, reduced = false) {
    const s = spring(stiffness, ratio, reduced); s.x = from; s.target = to; s.v = v;
    return springStep(s, age).x;
  }
  // Done: a crouch, four hops that get lower, a squash on every landing that springs back. squash > 0 is that many
  // logical rows shorter (and a little wider), < 0 stretched; whole pixels only, so the art never smears.
  const HOPS = [[.12, .42, 6], [.52, .82, 6], [.92, 1.22, 5], [1.32, 1.62, 4]], HOP_SECONDS = 2;
  function hopAt(age, reduced = false) {
    if (!(age >= 0) || age >= HOP_SECONDS) return { lift: 0, squash: 0, widen: 0 };
    let lift = 0;
    for (const [start, end, height] of HOPS) if (age >= start && age < end) { const p = (age - start) / (end - start); lift = Math.round(height * 4 * p * (1 - p)); }
    if (reduced) return { lift, squash: 0, widen: 0 };
    const s = spring(600, .35); s.target = 2;
    let t = 0;
    const until = at => { const to = Math.min(at, age); springStep(s, to - t); t = to; return t < age; };
    for (let i = 0; i < HOPS.length; i++) {
      const [start, end, height] = HOPS[i];
      if (!until(start)) break;
      s.target = 0; s.v -= 35; // take off: a stretch
      if (!until(end)) break;
      s.v += height * 10; s.target = i < HOPS.length - 1 ? 1.5 : 0; // land: a squash
    }
    until(age);
    const squash = Math.max(-2, Math.min(3, Math.round(s.x))) + 0; // + 0: no -0
    return { lift, squash, widen: Math.max(-1, Math.min(2, Math.round(squash * .6))) + 0 };
  }
  // Called by a visitor, a treat or a photo: perk up a step, the waving arm springs past the top and settles,
  // the word pops up from the head. arm 0 is down, 1 up.
  function greetPose(age, reduced = false) {
    if (!(age >= 0)) return { arm: 1, perk: 0, pop: 0 };
    const t = Math.min(age, 1.5);
    return { arm: springAt(260, .48, t, {}, reduced), perk: Math.round(springAt(300, .4, t, { to: 0, v: 70 }, reduced)) + 0, pop: Math.round(5 * (1 - springAt(420, .5, t, {}, reduced))) + 0 };
  }
  // A sheet just pinned to the notice board swings on its pin twice and stops: whole-pixel offset of its bottom row.
  const SWAY_SECONDS = 2.5;
  function swayAt(age, reduced = false) { return age >= 0 && age < SWAY_SECONDS ? Math.round(springAt(120, .16, age, { to: 0, v: 32 }, reduced)) + 0 : 0; }

  const api = { spring, springStep, springAt, hopAt, HOP_SECONDS, greetPose, swayAt, SWAY_SECONDS, createReplay,validateHistory,validateHistoryList,validDay,meetingBoardText,ACTIVITY_PRIORITY,stableHash,MEET_NAMES,MEET_LINES,layouts,getLayout,noticeBoard,lookIndex, plateName, nameplates, games, leisureSlots, isBreakfast, isFunTime, teaTime, mealTime, dishOf, CUISINES, isBBQTime, LEISURE_ORDER, BREAKFAST_ORDER, KITCHEN_ORDER, BBQ_ORDER, leisure:L=>{L=getLayout(L);return L.id==='legacy'?L.games.slice(0,10):[...L.games,...(L.gym||[]),...(L.tea||[]),...machineSpots,...(L.fun||[]),...(L.kitchen||[]),...(L.pool||[]),...(L.catSpot?[L.catSpot]:[]),...(L.clinic||[])];}, gameWatch:tower.gameWatch, standing:tower.standing, podium:tower.podium, seats:tower.seats, booth:tower.booth, audience:tower.audience, patrol:tower.patrol, classicSeats:seats, emptyScene, diskLayers, isNight, validateSceneFields, eventText, TREAT_NAMES, W, H, desks, mvDesks, rest, home, door, handoff, bossDesk, pantry, blocked, queuePoint, create, distance, route };
  if (typeof module !== 'undefined') module.exports = api;
  root.OfficeCore = api;
})(typeof window === 'undefined' ? globalThis : window);
