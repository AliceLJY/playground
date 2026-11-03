// Shared test driver: emits the same boolean intents as keys/touch, never changes game state.
function drive(C,s,{autoPedal=false,drift=true,hold=.4,offset=2}={}){
 const r=s.riders[0],n=C.nearest(r.x,r.z),p=C.at(n.s+7+r.speed*.25);
 const error=C.wrap(Math.atan2(-(p.x-r.x),-(p.z-r.z))-r.heading);
 const bend=C.LICENSE.bends[Math.min(s.license.stamps,2)];
 const sliding=drift&&!s.license.mini&&r.progress>bend.from+offset&&r.drift<hold;
 return {forward:!autoPedal,autoPedal,left:sliding||error>.035,right:!sliding&&error<-.035,drift:sliding};
}
module.exports=drive;
