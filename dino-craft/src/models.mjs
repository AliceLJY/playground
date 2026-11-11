// Articulated +Z-facing silhouettes, rendered together in one instanced box draw.
export function rexParts(palette) {
  const parts = [], {skin,dark,belly,eye}=palette.rex;
  const add = (...part) => parts.push(part);
  add(0,2.25,-.25,1.65,1.55,3.35,skin,'body');
  add(0,2.05,.8,1.35,.9,1.7,belly,'body');
  add(0,2.95,1.18,1.1,1.3,1.2,skin,'head');
  add(0,3.26,2.18,1.55,.95,1.7,skin,'head');
  add(0,3.12,3.05,1.45,.65,1.0,skin,'head');
  add(0,2.76,2.67,1.4,.2,1.95,'#3c3027','jaw');
  add(0,2.61,2.67,1.3,.2,1.95,belly,'jaw');
  for (const side of [-1,1]) {
    const x = side * .71;
    add(x,3.55,2.03,.19,.15,.62,dark,'head');
    add(x*1.105,3.43,2.23,.055,.2,.24,eye,'head');
    add(x*1.15,3.43,2.27,.04,.16,.08,'#171f19','head');
    add(x*.95,3.2,3.5,.075,.13,.15,'#263729','head');
    for (let z=2.02; z<3.55; z+=.25) {
      add(x,2.85,z,.11,.25,.11,'#fff0c9','head');
      add(x*.93,2.86,z+.07,.1,.18,.1,'#ddcfa5','jaw');
    }
    add(side*.94,1.35,-.9,.75,1.65,.95,skin,'leg',side);
    add(side*.98,.55,-.58,.5,.8,.52,dark,'leg',side);
    add(side*1.02,.22,-.1,.6,.3,1.25,dark,'foot',side);
    for (const dx of [-.18,0,.18]) add(side*1.02+dx,.17,.61,.1,.13,.33,'#e5d1a5','foot',side);
    add(side*.91,2.27,1.05,.22,.48,.25,skin,'arm',side);
    add(side*.96,2.05,1.28,.18,.18,.5,dark,'arm',side);
    for (const dx of [-.07,.07]) add(side*.96+dx,2,1.55,.065,.1,.22,'#e5d1a5','arm',side);
  }
  for (let i=0; i<7; i++) {
    add(0,2.3-i*.08,-2.1-i*.57,1.1-i*.14,1.05-i*.13,.95,i%2?dark:skin,'tail',i);
  }
  for (let i=0; i<5; i++) add(0,3.03-i*.035,.35-i*.53,1.32,.12,.22,dark,'body');
  return parts;
}

export function grazerParts(palette) {
  const {skin,head,dark,plate,tail}=palette.grazer;
  const a = [[0,1.15,-.25,1.35,1.2,2.7,skin,'body'],[0,1.1,1.45,.55,.55,.95,head,'head'],[0,.94,2,.55,.3,.55,head,'head']];
  for (const x of [-.62,.62]) {
    for (const z of [-1,.6]) a.push([x,.52,z,.32,1.02,.38,dark,'leg',(x<0?-1:1)*(z<0?-1:1)]);
    a.push([x*.48,1.26,1.88,.06,.1,.15,'#263c2c','head']);
  }
  for(const side of [-1,1])for(let i=0;i<3;i++)a.push([side*.681,1.3,-1.05+i*.8,.025,.75,.18,dark,'body']);
  for (let i=0;i<7;i++) {
    a.push([(i%2?-.16:.16),1.9,-1.15+i*.37,.16,.55+Math.sin(i/6*Math.PI)*.55,.48,plate,'plate']);
  }
  for (let i=0;i<4;i++) a.push([0,1.06-i*.09,-1.9-i*.56,.6-i*.14,.55-i*.12,.9,tail,'tail',i]);
  for (const x of [-.25,.25]) a.push([x,1,-3.4,.12,.65,.13,'#ded0a0','tail',4]);
  return a;
}

export function pteroParts(palette) {
  const {skin,head,beak,crest,wing,wingDark,spar}=palette.ptero;
  const a = [[0,0,0,.42,.42,1.45,skin,'body'],[0,.17,.8,.36,.4,.65,head,'head'],[0,.1,1.55,.2,.18,1.1,beak,'head'],[0,.48,.44,.16,.62,.55,crest,'head'],[0,0,-1.08,.15,.15,1,wingDark,'tail']];
  for (const side of [-1,1]) {
    a.push([side*.19,.26,1,.045,.1,.14,'#24251c','head']);
    // Tapered, swept-back segments keep a triangular wing silhouette.
    for (let i=0;i<5;i++) a.push([side*(.53+i*.62),.02,-.08-i*.16,.7,.09,1.65-i*.3,i%2?wing:wingDark,'wing',side]);
    a.push([side*1.45,.08,.48,2.6,.09,.1,spar,'wing',side]);
    a.push([side*.25,-.33,-.6,.1,.5,.12,'#61543e','leg',side]);
  }
  return a;
}
