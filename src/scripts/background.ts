// Decorative canvas layer shared by all themes: local, below the content, suspended off-screen.
// Each theme supplies a scene; the lifecycle (30 FPS cap, DPR cap, hidden/reduced-motion pause) stays common.
type Scene={reset(width:number,height:number):void;draw(ctx:CanvasRenderingContext2D,delta:number,time:number):void};
const random=(min:number,max:number)=>min+Math.random()*(max-min);

// Dream's reference theme uses drifting stars and short diagonal comet trails.
function dreamScene():Scene{
 type Star={x:number;y:number;size:number;speed:number;phase:number;giant:boolean};
 type Comet={x:number;y:number;age:number;life:number;speed:number};
 let width=0,height=0,nextComet=4,stars:Star[]=[],comets:Comet[]=[];
 return {
  reset(w,h){
   width=w;height=h;
   stars=Array.from({length:Math.min(300,Math.round(width*.216))},()=>({x:random(0,width),y:random(0,height),size:random(.7,1.8),speed:random(9,24),phase:random(0,Math.PI*2),giant:Math.random()<.03}));
   comets=[];
  },
  draw(ctx,delta,time){
   for(const star of stars){
    star.x+=star.speed*delta;star.y-=star.speed*delta;
    if(star.x>width+3)star.x=-3;if(star.y<-3)star.y=height+3;
    const opacity=.15+.5*(.5+.5*Math.sin(time*.6+star.phase));
    ctx.fillStyle=`rgba(${star.giant?'180,184,240':'226,225,142'},${opacity})`;
    if(star.giant){ctx.beginPath();ctx.arc(star.x,star.y,1.8,0,Math.PI*2);ctx.fill()}
    else ctx.fillRect(star.x,star.y,star.size,star.size);
   }
   if(time>=nextComet){
    if(comets.length<2)comets.push({x:random(0,width*.8),y:random(height*.25,height),age:0,life:random(1.4,2.4),speed:random(180,330)});
    nextComet=time+random(5,10);
   }
   for(const comet of comets){
    comet.age+=delta;comet.x+=comet.speed*delta;comet.y-=comet.speed*delta;
    const opacity=Math.sin(Math.min(comet.age/comet.life,1)*Math.PI)*.6;
    const tail=ctx.createLinearGradient(comet.x,comet.y,comet.x-65,comet.y+65);
    tail.addColorStop(0,`rgba(226,225,224,${opacity})`);tail.addColorStop(1,'rgba(226,225,224,0)');
    ctx.strokeStyle=tail;ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(comet.x,comet.y);ctx.lineTo(comet.x-65,comet.y+65);ctx.stroke();
   }
   comets=comets.filter(c=>c.age<c.life&&c.x<width+70&&c.y>-70);
  }
 };
}

// Kiln: sparse embers rise from the bottom, sway, cool from coral to ash and fade out near the top.
function kilnScene():Scene{
 type Ember={x:number;y:number;size:number;rise:number;sway:number;phase:number;heat:number};
 let width=0,height=0,embers:Ember[]=[];
 const spawn=(anywhere:boolean):Ember=>({x:random(0,width),y:anywhere?random(0,height):height+random(4,40),size:random(.8,2.2),rise:random(10,26),sway:random(6,18),phase:random(0,Math.PI*2),heat:random(.55,1)});
 return {
  reset(w,h){width=w;height=h;embers=Array.from({length:Math.min(90,Math.round(width*.06))},()=>spawn(true))},
  draw(ctx,delta,time){
   for(let i=0;i<embers.length;i++){
    const e=embers[i];
    e.y-=e.rise*delta;e.x+=Math.sin(time*.7+e.phase)*e.sway*delta;
    if(e.y<-6){embers[i]=spawn(false);continue}
    const life=Math.max(0,Math.min(1,e.y/height));
    const flicker=.75+.25*Math.sin(time*3.1+e.phase*5);
    const alpha=(.12+.5*life)*e.heat*flicker;
    const g=Math.round(119+60*(1-life)),b=Math.round(87+70*(1-life));
    ctx.fillStyle=`rgba(217,${g},${b},${alpha})`;
    ctx.beginPath();ctx.arc(e.x,e.y,e.size,0,Math.PI*2);ctx.fill();
    if(e.size>1.8){ctx.fillStyle=`rgba(217,119,87,${alpha*.18})`;ctx.beginPath();ctx.arc(e.x,e.y,e.size*3.2,0,Math.PI*2);ctx.fill()}
   }
  }
 };
}

const scenes:Record<string,()=>Scene>={dream:dreamScene,kiln:kilnScene};

export function startBackground(canvas: HTMLCanvasElement, theme='dream') {
 const ctx=canvas.getContext('2d');if(!ctx)return;
 const motion=matchMedia('(prefers-reduced-motion: reduce)');
 const scene=(scenes[theme]||dreamScene)();
 let width=0,height=0,frame=0,last=0,time=0;
 function resize(){
  width=window.innerWidth;height=window.innerHeight;
  const ratio=Math.min(window.devicePixelRatio||1,2);
  canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);
  ctx!.setTransform(ratio,0,0,ratio,0,0);
  scene.reset(width,height);
  if(motion.matches)ctx!.clearRect(0,0,width,height);
 }
 function pause(){cancelAnimationFrame(frame);frame=0;last=0;canvas.dataset.motion=motion.matches?'reduced':'paused'}
 function draw(now:number){
  frame=0;if(document.hidden||motion.matches)return pause();
  // Limit to 30 FPS; movement uses elapsed time instead of monitor refresh rate.
  if(last&&now-last<1000/30){frame=requestAnimationFrame(draw);return}
  const delta=last?Math.min((now-last)/1000,.1):0;last=now;time+=delta;
  ctx!.clearRect(0,0,width,height);
  scene.draw(ctx!,delta,time);
  canvas.dataset.motion='running';frame=requestAnimationFrame(draw);
 }
 function resume(){pause();if(!document.hidden&&!motion.matches)frame=requestAnimationFrame(draw)}
 function motionChanged(){ctx!.clearRect(0,0,width,height);resume()}
 resize();resume();
 window.addEventListener('resize',resize,{passive:true});
 document.addEventListener('visibilitychange',resume);
 motion.addEventListener('change',motionChanged);
 window.addEventListener('pagehide',pause);window.addEventListener('pageshow',resume);
 return ()=>{pause();window.removeEventListener('resize',resize);document.removeEventListener('visibilitychange',resume);motion.removeEventListener('change',motionChanged);window.removeEventListener('pagehide',pause);window.removeEventListener('pageshow',resume)};
}
