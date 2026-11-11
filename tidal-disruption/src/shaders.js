export const fullscreenVertex = `
precision highp float;
in vec3 position;
out vec2 vUv;
void main() { vUv = position.xy * .5 + .5; gl_Position = vec4(position, 1.); }
`;
export const orbitFunctions = `
const float PI = 3.14159265359;
const float TAU = 6.28318530718;
float sat(float x) { return clamp(x,0.,1.); }
float hash(float x) { return fract(sin(x*127.1+uSeed*17.13)*43758.5453123); }
mat2 rot(float a) { float c=cos(a),s=sin(a); return mat2(c,s,-s,c); }
vec3 stellar(float t) {
  float f=-2.1+2.06*smoothstep(0.,40.,t);
  float r=6.5/(1.+.94*cos(f));
  return vec3(r*cos(f+2.1),0.,r*sin(f+2.1));
}
vec4 particle(float id, float t) {
  float q=hash(id+1.), b=hash(id+19.), c=hash(id+81.);
  float a=7.+8.*q;
  float e=1.-(3.35+.10*(b-.5))/a;
  float m=7.*(t-33.)/pow(a,1.5)+((q-.5)*1.8+(b-.5)*.055)*smoothstep(24.,50.,t);
  float E=m;
  for(int j=0;j<6;j++) E-=(E-e*sin(E)-m)/(1.-e*cos(E));
  vec2 p=vec2(a*(cos(E)-e),a*sqrt(1.-e*e)*sin(E));
  p=rot(2.1+.30*m)*p;
  float tail=smoothstep(.85,1.,q)*smoothstep(36.,58.,t);
  vec2 escaped=rot(2.1+(t-33.)*.065)*vec2(3.5+max(t-33.,0.)*.7,0.);
  p=mix(p,escaped,tail);
  float f=-2.1+2.06*smoothstep(0.,40.,t);
  float longitude=TAU*b;
  float latitude=2.*c-1.;
  float sphere=sqrt(1.-latitude*latitude)*pow(q,.3333);
  vec2 offset=rot(f+2.1)*vec2(cos(longitude)*sphere*(.72+2.05*smoothstep(17.,36.,t)),sin(longitude)*sphere*(.72-.51*smoothstep(17.,39.,t)));
  vec3 cloud=stellar(t)+vec3(offset.x,latitude*pow(q,.3333)*.55,offset.y);
  vec3 stream=vec3(p.x,(c-.5)*.12,p.y);
  vec3 pos=mix(cloud,stream,smoothstep(24.,46.,t));
  float disk=smoothstep(68.,90.,t);
  float radius=3.05+6.5*pow(q,1.45);
  float angle=atan(pos.z,pos.x)+disk*max(t-68.,0.)*5.5/pow(radius,1.5);
  float circularRadius=mix(length(pos.xz),radius,disk);
  pos=vec3(cos(angle)*circularRadius,mix(pos.y,(c-.5)*.10,disk),sin(angle)*circularRadius);
  float temperature=.22+.45*disk+.25*(1.-sat((length(pos.xz)-3.)/12.));
  return vec4(pos,temperature);
}
`;
export const computeFragment = `
precision highp float;
uniform float uTime, uSide, uSeed;
layout(location=0) out vec4 outState;
${orbitFunctions}
void main() {
  float id=floor(gl_FragCoord.x)+floor(gl_FragCoord.y)*uSide;
  outState=particle(id,uTime);
}
`;
export const atlasVertex = `
precision highp float;
in vec3 position;
uniform sampler2D uState;
uniform float uSide, uAtlas, uTime, uSeed;
out vec3 vColor;
out vec2 vVelocity;
out float vWeight;
${orbitFunctions}
void main() {
  float id=position.x;
  vec2 uv=(vec2(mod(id,uSide),floor(id/uSide))+.5)/uSide;
  vec4 state=texture(uState,uv);
  vec3 future=particle(id,uTime+.05).xyz;
  vec3 past=particle(id,uTime-.05).xyz;
  vVelocity=(future.xz-past.xz)*10.;
  vColor=mix(vec3(1.,.16,.025),vec3(1.,.68,.29),state.w);
  vWeight=smoothstep(33.,43.,uTime)*(1.-.6*smoothstep(93.,108.,uTime));
  gl_Position=vec4(state.x/24.,state.z/24.,0.,1.);
  gl_PointSize=clamp(uAtlas/150.,2.5,6.);
}
`;
export const atlasFragment = `
precision highp float;
in vec3 vColor;
in vec2 vVelocity;
in float vWeight;
uniform float uSide;
layout(location=0) out vec4 outColor;
layout(location=1) out vec4 outMoments;
void main() {
  vec2 p=gl_PointCoord*2.-1.;
  float w=exp(-dot(p,p)*3.)*vWeight*9216./(uSide*uSide);
  if(dot(p,p)>1.) discard;
  outColor=vec4(vColor*w,w);
  outMoments=vec4(vVelocity*w,dot(vVelocity,vVelocity)*w,w);
}
`;
export const traceFragment = `
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uDensity, uMoments;
uniform vec3 uCamera, uForward, uRight, uUp, uStar;
uniform vec4 uStarShape;
uniform float uTime, uAspect, uSeed, uBending, uDiskOnly;
uniform int uSteps;
const float PI=3.14159265359;
float hash21(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7))+uSeed)*43758.5453); }
float noise(vec2 p) {
 vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
 return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+1.),f.x),f.y);
}
vec3 temperature(float t) {
 return mix(mix(vec3(1.,.075,.006),vec3(1.,.48,.13),smoothstep(.1,.55,t)),vec3(.65,.83,1.),smoothstep(.66,1.15,t));
}
vec3 sky(vec3 d) {
 vec2 uv=vec2(atan(d.z,d.x)/(2.*PI)+.5,asin(clamp(d.y,-1.,1.))/PI+.5);
 vec2 grid=uv*vec2(900.,450.);
 vec2 cell=floor(grid),f=fract(grid);
 vec2 jitter=vec2(hash21(cell),hash21(cell+72.));
 float dist=length((f-jitter)*vec2(1.,1.));
 float power=pow(hash21(cell+13.),18.);
 float star=exp(-dist*dist*520.)*power;
 float dust=noise(uv*vec2(17.,9.));
 float band=exp(-pow((d.y+.18*d.x-.12*d.z)*3.4,2.));
 vec3 color=vec3(.0016,.0023,.0048)+vec3(.003,.0038,.006)*dust*band;
 color+=mix(vec3(.60,.76,1.),vec3(1.,.73,.48),hash21(cell+44.))*star*.8;
 return color;
}
vec3 diskEmission(vec3 p,vec3 direction) {
 float r=length(p.xz);
 if(r<2.95||r>23.5) return vec3(0.);
 vec2 uv=p.xz/48.+.5;
 vec4 density=texture(uDensity,uv), moments=texture(uMoments,uv);
 float w=max(density.a,.001);
 vec2 meanV=moments.rg/max(moments.a,.001);
 float variance=max(0.,moments.b/max(moments.a,.001)-dot(meanV,meanV));
 float shock=smoothstep(50.,60.,uTime)*(1.-smoothstep(72.,91.,uTime))*smoothstep(.09,.6,variance);
 float formed=smoothstep(68.,90.,uTime);
 float decay=1.-.62*smoothstep(90.,108.,uTime);
 float angle=atan(p.z,p.x);
 float phase=angle-uTime*5.5/pow(r,1.5);
 float turbulent=noise(vec2(r*3.2,phase*9.));
 float filament=.50+.50*sin(r*20.+noise(vec2(phase*8.,r*3.))*4.);
 float broad=pow(3.05/r,2.0)*smoothstep(2.95,3.5,r)*(1.-smoothstep(7.,10.,r));
 float disk=broad*formed*decay*(.5+.55*turbulent+.40*filament);
 // The pre-existing, dim inner gas makes lensing visible before disruption.
 disk+=.018*broad;
 float stream=1.-exp(-density.a*.45);
 float heat=.22+.60*pow(3./r,1.35);
 vec3 emission=temperature(heat)*disk*3.4;
 emission+=density.rgb/w*stream*1.75*(1.-.92*formed);
 emission+=temperature(1.2)*shock*stream*3.5;
 float beta=min(.58,sqrt(.5/max(r-1.,.1)));
 vec3 tangent=vec3(-p.z,0.,p.x)/r;
 float doppler=sqrt(1.-1./r)*sqrt(1.-beta*beta)/(1.-beta*dot(tangent,-direction));
 emission*=pow(doppler,3.);
 emission=mix(emission,emission*vec3(.60,.88,1.28),clamp((doppler-1.)*1.6,0.,.7));
 return emission;
}
float erfApprox(float x) {
 float square=x*x;
 return sign(x)*sqrt(max(0.,1.-exp(-square*(1.27323954+.147*square)/(1.+.147*square))));
}
vec3 localStar(vec3 start,vec3 end) {
 if(uStarShape.w<.001||uDiskOnly>.5) return vec3(0.);
 vec3 radial=vec3(cos(uStarShape.z),0.,sin(uStarShape.z));
 vec3 tangent=vec3(-radial.z,0.,radial.x);
 vec3 delta=start-uStar, segment=end-start;
 vec3 a=vec3(dot(delta,radial)/uStarShape.x,delta.y/uStarShape.y,dot(delta,tangent)/uStarShape.y);
 vec3 b=vec3(dot(segment,radial)/uStarShape.x,segment.y/uStarShape.y,dot(segment,tangent)/uStarShape.y);
 float bb=max(dot(b,b),.00001);
 float along=-dot(a,b)/bb;
 vec3 q=a+b*along;
 float taper=mix(1.,clamp(1.+.60*q.x,.25,1.35),smoothstep(17.,36.,uTime));
 float radius=length(vec3(q.x,q.yz/taper));
 if(radius>3.) return vec3(0.);
 float root=sqrt(3.5*bb);
 float core=exp(-3.5*radius*radius)*.8862269/root*(erfApprox(root*(1.-along))-erfApprox(-root*along));
 root=sqrt(1.1*bb);
 float corona=exp(-1.1*radius*radius)*.8862269/root*(erfApprox(root*(1.-along))-erfApprox(-root*along));
 float surface=noise((start.xz+segment.xz*clamp(along,0.,1.))*12.+uTime*.1);
 float path=length(segment)/max(uStarShape.y,.1);
 return temperature(.74+surface*.10)*(core*(5.+surface)+corona*.10)*path*uStarShape.w;
}
void main() {
 vec2 screen=vUv*2.-1.;
 screen.x*=uAspect;
 screen.x-=uAspect*(uAspect>1. ? .10 : 0.);
 screen.y-=uAspect>1. ? .07 : .13;
 screen*=max(1.,.98/uAspect);
 vec3 p=uCamera;
 vec3 v=normalize(uForward+screen.x*.50*uRight+screen.y*.50*uUp);
 vec3 angular=cross(p,v);
 float l2=dot(angular,angular);
 vec3 radiance=vec3(0.);
 float transmission=1.;
 bool captured=false;
 for(int i=0;i<192;i++) {
  if(i>=uSteps) break;
  float r=length(p);
  if(r<1.025) { captured=true; break; }
  if(r>48. && dot(p,v)>0.) break;
  float stepScale=144./float(uSteps);
  float h=clamp((r-1.)*.16,.045,2.7)*stepScale;
  float force=-1.5*l2/pow(r,5.)*uBending;
  vec3 acceleration=force*p;
  vec3 next=p+v*h+.5*acceleration*h*h;
  float nr=max(length(next),.6);
  vec3 nextAcceleration=-1.5*l2*next/pow(nr,5.)*uBending;
  vec3 nextV=v+.5*(acceleration+nextAcceleration)*h;
  radiance+=localStar(p,next)*transmission;
  if(p.y*next.y<=0. && abs(p.y-next.y)>.000001) {
   float crossing=p.y/(p.y-next.y);
   vec3 hit=mix(p,next,crossing);
   vec3 emission=diskEmission(hit,normalize(mix(v,nextV,crossing)));
   radiance+=emission*transmission;
   transmission*=.78;
  }
  p=next; v=nextV;
 }
 if(!captured && length(p)>40.) radiance+=sky(normalize(v))*transmission;
 outColor=vec4(radiance,1.);
}
`;
export const compositeFragment = `
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uScene;
uniform vec2 uTexel;
vec3 film(vec3 x) { return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.); }
void main() {
 vec3 base=texture(uScene,vUv).rgb;
 vec3 bloom=vec3(0.);
 for(int i=0;i<8;i++) {
  float a=float(i)*.785398;
  vec2 d=vec2(cos(a),sin(a))*uTexel;
  bloom+=texture(uScene,vUv+d*4.).rgb*.065;
  bloom+=texture(uScene,vUv+d*11.).rgb*.028;
 }
 vec3 color=film((base+bloom*.32)*1.23);
 color=pow(color,vec3(1./2.2));
 float vignette=1.-.30*pow(length(vUv-.5),1.3);
 outColor=vec4(color*vignette,1.);
}
`;
