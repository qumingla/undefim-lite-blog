// Dream's reference theme uses drifting stars and short diagonal comet trails.
// Keep this decorative layer local, below the content, and suspend it off-screen.
export function startBackground(canvas: HTMLCanvasElement) {
 const ctx=canvas.getContext('2d');if(!ctx)return;
 const motion=matchMedia('(prefers-reduced-motion: reduce)');
 const random=(min:number,max:number)=>min+Math.random()*(max-min);
 type Star={x:number;y:number;size:number;speed:number;phase:number;giant:boolean};
 type Comet={x:number;y:number;age:number;life:number;speed:number};
 let width=0,height=0,frame=0,last=0,time=0,nextComet=4,stars:Star[]=[],comets:Comet[]=[];
 function resize(){
  width=window.innerWidth;height=window.innerHeight;
  const ratio=Math.min(window.devicePixelRatio||1,2);
  canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);
  ctx!.setTransform(ratio,0,0,ratio,0,0);
  stars=Array.from({length:Math.min(300,Math.round(width*.216))},()=>({x:random(0,width),y:random(0,height),size:random(.7,1.8),speed:random(9,24),phase:random(0,Math.PI*2),giant:Math.random()<.03}));
  comets=[];if(motion.matches)ctx!.clearRect(0,0,width,height);
 }
 function pause(){cancelAnimationFrame(frame);frame=0;last=0;canvas.dataset.motion=motion.matches?'reduced':'paused'}
 function draw(now:number){
  frame=0;if(document.hidden||motion.matches)return pause();
  // Limit to 30 FPS; movement uses elapsed time instead of monitor refresh rate.
  if(last&&now-last<1000/30){frame=requestAnimationFrame(draw);return}
  const delta=last?Math.min((now-last)/1000,.1):0;last=now;time+=delta;
  ctx!.clearRect(0,0,width,height);
  for(const star of stars){
   star.x+=star.speed*delta;star.y-=star.speed*delta;
   if(star.x>width+3)star.x=-3;if(star.y<-3)star.y=height+3;
   const opacity=.15+.5*(.5+.5*Math.sin(time*.6+star.phase));
   ctx!.fillStyle=`rgba(${star.giant?'180,184,240':'226,225,142'},${opacity})`;
   if(star.giant){ctx!.beginPath();ctx!.arc(star.x,star.y,1.8,0,Math.PI*2);ctx!.fill()}
   else ctx!.fillRect(star.x,star.y,star.size,star.size);
  }
  if(time>=nextComet){
   if(comets.length<2)comets.push({x:random(0,width*.8),y:random(height*.25,height),age:0,life:random(1.4,2.4),speed:random(180,330)});
   nextComet=time+random(5,10);
  }
  for(const comet of comets){
   comet.age+=delta;comet.x+=comet.speed*delta;comet.y-=comet.speed*delta;
   const opacity=Math.sin(Math.min(comet.age/comet.life,1)*Math.PI)*.6;
   const tail=ctx!.createLinearGradient(comet.x,comet.y,comet.x-65,comet.y+65);
   tail.addColorStop(0,`rgba(226,225,224,${opacity})`);tail.addColorStop(1,'rgba(226,225,224,0)');
   ctx!.strokeStyle=tail;ctx!.lineWidth=1.4;ctx!.beginPath();ctx!.moveTo(comet.x,comet.y);ctx!.lineTo(comet.x-65,comet.y+65);ctx!.stroke();
  }
  comets=comets.filter(c=>c.age<c.life&&c.x<width+70&&c.y>-70);
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
