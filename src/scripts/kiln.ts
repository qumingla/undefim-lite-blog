// Kiln theme interactions. Everything here is progressive: without JS the page is complete and static.
// Motion respects prefers-reduced-motion and stops scheduling while the page is hidden.
import {climbPath,pickAction,type Action,type Hill} from './mascot-scene';
const motion=matchMedia('(prefers-reduced-motion: reduce)');
const finePointer=matchMedia('(pointer: fine)');
const random=(min:number,max:number)=>min+Math.random()*(max-min);
const pick=<T,>(items:T[])=>items[Math.floor(Math.random()*items.length)];
const idleLines=['在写新东西吗','慢慢读，不着急','点我也没有彩蛋','火不会灭的','今天也要好好吃饭'];
const poseLines:Record<string,string[]>={warm:['这里很暖和','再添点柴吧'],climb:['快到山顶了'],summit:['风景不错','到山顶了'],imagine:['别打断我的灵感','在想下一篇写什么'],gaze:['今晚星星很多'],walk:['去那边看看']};
const ideaLines:Record<string,string>={bulb:'有个点子',star:'写点好东西',code:'先写个原型',moon:'夜深适合写作'};

function later(fn:()=>void,min:number,max:number){
 // Re-check visibility when the timer fires instead of piling up work for a background tab.
 window.setTimeout(()=>{if(document.hidden){document.addEventListener('visibilitychange',()=>later(fn,min,max),{once:true});return}fn()},random(min,max));
}

// A cancellable scene: sleeps resolve early once cancelled so an interrupted action unwinds quickly.
type Scene={cancelled:boolean;wakers:Set<()=>void>};
const scene=():Scene=>({cancelled:false,wakers:new Set()});
const cancel=(s:Scene)=>{s.cancelled=true;for(const wake of s.wakers)wake();s.wakers.clear()};
const sleep=(ms:number,s?:Scene)=>new Promise<void>(resolve=>{if(s?.cancelled)return resolve();const done=()=>{clearTimeout(id);s?.wakers.delete(done);resolve()};const id=window.setTimeout(done,ms);s?.wakers.add(done)});

type Mascot=ReturnType<typeof controller>;
function controller(walker:HTMLElement){
 const button=walker.querySelector<HTMLButtonElement>('.mascot')!,bubble=walker.querySelector<HTMLElement>('.mascot-bubble')!,eyes=walker.querySelector<SVGGElement>('.mascot-look')!;
 let held:[number,number]|null=null,pointer:[number,number]=[0,0],hideBubble=0;
 const apply=()=>{const [x,y]=held||pointer;eyes.style.transform=`translate(${x.toFixed(2)}px,${y.toFixed(2)}px)`};
 return {
  walker,button,
  get pose(){return walker.dataset.pose||'idle'},
  set pose(value:string){walker.dataset.pose=value},
  // Scripted gaze wins over the pointer until released.
  look(x:number,y:number){held=[x,y];apply()},
  release(){held=null;apply()},
  follow(x:number,y:number){pointer=[x,y];if(!held)apply()},
  hop(){if(motion.matches)return;button.classList.remove('is-hopping');void button.offsetWidth;button.classList.add('is-hopping')},
  say(text:string,ms=2400){bubble.textContent=text;bubble.classList.add('is-visible');clearTimeout(hideBubble);hideBubble=window.setTimeout(()=>bubble.classList.remove('is-visible'),ms)}
 };
}

function mascots(){
 const all=[...document.querySelectorAll<HTMLElement>('.mascot-walker')].map(controller);
 const interrupts=new Map<Mascot,()=>void>();
 for(const m of all){
  m.button.addEventListener('animationend',e=>{if(e.animationName==='kiln-hop')m.button.classList.remove('is-hopping')});
  m.button.addEventListener('click',()=>{
   if(m.pose==='doze'){
    // Woken up: the current scene is abandoned and the mascot jumps awake.
    interrupts.get(m)?.();m.pose='startled';m.hop();m.say('我没睡着');
    window.setTimeout(()=>{if(m.pose==='startled')m.pose='idle'},1100);return;
   }
   m.hop();const lines=poseLines[m.pose]||idleLines;m.say(pick(finePointer.matches?[...lines,...(lines===idleLines?['按 / 可以搜索文章']:[])]:lines));
  });
  const blink=()=>{if(!motion.matches&&!['doze','stretch','warm','summit'].includes(m.pose)){m.walker.classList.add('is-blinking');window.setTimeout(()=>m.walker.classList.remove('is-blinking'),140)}later(blink,2500,6500)};
  later(blink,800,4000);
  const stage=m.walker.parentElement;
  if(m.walker.classList.contains('is-wanderer')&&stage)direct(m,stage,interrupts);
  else if(!m.walker.closest('.search-heading'))fidget(m,interrupts);
 }
 if(!all.length)return;
 // Eyes follow the pointer by at most one pixel of the 22x16 grid.
 let pending=0,px=0,py=0;
 window.addEventListener('pointermove',e=>{
  if(!finePointer.matches||motion.matches)return;px=e.clientX;py=e.clientY;
  if(pending)return;pending=requestAnimationFrame(()=>{pending=0;for(const m of all){
   const box=m.walker.getBoundingClientRect();if(!box.width)continue;
   m.follow(Math.max(-1,Math.min(1,(px-box.left-box.width/2)/180)),Math.max(-1,Math.min(1,(py-box.top-box.height/2)/180)));
  }});
 },{passive:true});
}

// Stationary mascots (footer, 404) look around, gaze upward or nap now and then.
function fidget(m:Mascot,interrupts:Map<Mascot,()=>void>){
 const step=async()=>{
  if(!motion.matches&&m.pose==='idle'){
   const s=scene();interrupts.set(m,()=>cancel(s));const roll=Math.random();
   if(roll<.55){m.look(pick([-1,1]),0);await sleep(700,s);m.look(pick([-1,1]),pick([-1,0]));await sleep(600,s);m.release()}
   else if(roll<.8){m.pose='gaze';await sleep(2200,s);if(m.pose==='gaze')m.pose='idle'}
   else{m.pose='doze';await sleep(random(5000,8000),s);if(!s.cancelled&&m.pose==='doze'){m.pose='stretch';await sleep(900);if(m.pose==='stretch')m.pose='idle'}}
   interrupts.delete(m);
  }
  later(step,5000,11000);
 };
 later(step,3000,7000);
}

// The profile mascot acts out short scenes on its stage: wander, warm up by the fire, set off to climb a hill,
// imagine an idea, doze off or watch the sky. It always faces the reader; eyes show where it is heading.
function direct(m:Mascot,stage:HTMLElement,interrupts:Map<Mascot,()=>void>){
 const walker=m.walker,hillEl=stage.querySelector<SVGSVGElement>('.kiln-hill'),fireEl=stage.querySelector<HTMLElement>('.kiln-campfire');
 let x=0,y=0,previous:Action|undefined;
 const width=()=>walker.offsetWidth;
 // Layout positions ignore the slide-in transforms, so geometry is right even while the scenery moves.
 const hill=():Hill|null=>hillEl?{left:parseFloat(getComputedStyle(hillEl).left)||0,width:hillEl.width.baseVal.value,height:hillEl.height.baseVal.value,profile:(hillEl.dataset.profile||'').split(',').map(Number)}:null;
 const outdoors=()=>stage.dataset.scene==='mountain';
 const bounds=()=>{
  const w=width(),h=outdoors()?hill():null,fireLeft=fireEl?fireEl.offsetLeft:stage.clientWidth;
  const min=h?h.left+h.width-w*.35:6,max=Math.max(min,(outdoors()?stage.clientWidth-8:fireLeft-4)-w);
  return {min,max,fire:Math.max(min,fireLeft-w+2)};
 };
 const place=(nx:number,ny:number)=>{x=nx;y=ny;walker.style.transform=`translate(${nx.toFixed(1)}px,${ny.toFixed(1)}px)`};
 // Web Animations move the walker; the final position is written first so it holds when the animation ends.
 const move=async(nx:number,ny:number,ms:number,easing='linear')=>{
  const from=`translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;place(nx,ny);
  if(ms<=0||motion.matches||!walker.animate)return;
  const animation=walker.animate([{transform:from},{transform:walker.style.transform}],{duration:ms,easing});
  await Promise.race([animation.finished.catch(()=>{}),sleep(ms*3+500)]);
 };
 const walkTo=async(nx:number,s:Scene)=>{
  const distance=nx-x;if(Math.abs(distance)<6||s.cancelled)return;
  m.look(Math.sign(distance),0);m.pose='walk';await move(nx,0,Math.abs(distance)/34*1000);m.pose='idle';m.release();
 };
 // Walking in place while the scenery scrolls the other way reads as travelling across the landscape.
 const travel=async(direction:-1|1,ms:number,s:Scene)=>{m.look(direction,0);m.pose='walk';stage.dataset.travel=direction<0?'left':'right';await sleep(ms,s);delete stage.dataset.travel;m.pose='idle';m.release()};
 const lookAround=async(s:Scene)=>{m.look(-1,0);await sleep(500,s);m.look(1,0);await sleep(500,s);m.look(0,-1);await sleep(400,s);m.release()};
 const doze=async(s:Scene,min:number,max:number)=>{
  m.pose='doze';await sleep(random(min,max),s);
  if(s.cancelled)return;m.pose='stretch';await sleep(900,s);m.pose='idle';
 };
 const actions:Record<Action,(s:Scene)=>Promise<void>>={
  async wander(s){const b=bounds();let target=random(b.min,b.max);if(Math.abs(target-x)<30)target=x<(b.min+b.max)/2?b.max:b.min;await walkTo(target,s);await sleep(random(300,700),s);await lookAround(s)},
  async warm(s){
   await walkTo(bounds().fire,s);if(s.cancelled)return;
   m.pose='warm';m.look(1,0);stage.dataset.stoked='';await sleep(random(4200,6500),s);
   // Sometimes the warmth wins and it nods off right by the fire.
   if(!s.cancelled&&Math.random()<.4){m.release();await doze(s,5000,7500)}
   delete stage.dataset.stoked;
  },
  async climb(s){
   const h=hill(),w=width();if(!h||h.width<60||stage.clientWidth<h.left+h.width+w)return actions.wander(s);
   // Set off: a few steps out, then the camp scrolls away behind and the hill drifts in.
   const b=bounds();await walkTo((b.min+b.max)/2,s);if(s.cancelled)return;
   stage.dataset.scene='mountain';await travel(-1,2100,s);if(s.cancelled)return;
   const base=h.left+h.width+w*.05,peak=h.left+h.width/2;
   await walkTo(base-w/2,s);if(s.cancelled)return;
   walker.dataset.elevated='';m.pose='climb';m.look(-1,-1);
   // Small hops from foothold to foothold up the drawn slope.
   for(const step of climbPath(h,base,peak,6)){
    if(s.cancelled)break;
    await move(step.x-w/2,-step.lift-5,150,'ease-out');await move(step.x-w/2,-step.lift,130,'ease-in');
   }
   if(!s.cancelled){
    m.pose='summit';m.look(-1,-1);await sleep(700,s);m.look(1,-1);await sleep(700,s);m.release();
    await sleep(900,s);m.hop();await sleep(1200,s);
   }
   m.pose='climb';m.look(1,1);
   for(const step of climbPath(h,peak,base+10,3)){await move(step.x-w/2,-step.lift-10,190,'ease-out');await move(step.x-w/2,-step.lift,170,'ease-in')}
   if(y!==0)await move(x,0,120,'ease-in');
   delete walker.dataset.elevated;m.pose='idle';m.release();await sleep(600,s);
   // Head home: the hill scrolls away and the campfire comes back into view.
   delete stage.dataset.scene;await travel(1,2100,s);
  },
  async imagine(s){
   const b=bounds();await walkTo(random(b.min,b.min+(b.max-b.min)*.5),s);if(s.cancelled)return;
   const idea=pick(Object.keys(ideaLines));walker.dataset.idea=idea;m.pose='imagine';
   await sleep(random(3400,4200),s);if(s.cancelled)return;
   m.pose='idle';if(Math.random()<.5){m.hop();m.say(ideaLines[idea])}
  },
  async doze(s){await doze(s,6000,9000)},
  async gaze(s){m.pose='gaze';await sleep(random(2200,3200),s);if(m.pose==='gaze')m.pose='idle'}
 };
 const settle=()=>{delete stage.dataset.stoked;delete stage.dataset.scene;delete stage.dataset.travel;delete walker.dataset.elevated;if(y!==0)place(x,0);if(m.pose!=='startled')m.pose='idle';m.release()};
 walker.style.left='0';
 const start=bounds();place(random(start.min,start.max),0);
 window.addEventListener('resize',()=>{if(y===0&&!walker.dataset.elevated){const b=bounds();place(Math.min(Math.max(x,b.min),b.max),0)}},{passive:true});
 (async()=>{
  await sleep(random(1200,2600));
  for(;;){
   // Off-screen stages (closed drawer, hidden tab) and reduced motion simply wait.
   if(document.hidden||motion.matches||stage.clientWidth<150){await sleep(2500);continue}
   const s=scene();interrupts.set(m,()=>cancel(s));
   const action=pickAction(Math.random(),previous);previous=action;
   try{await actions[action](s)}catch{}
   settle();interrupts.delete(m);
   await sleep(random(1600,3600));
  }
 })();
}

function scrollEffects(){
 const header=document.querySelector<HTMLElement>('.site-header'),backTop=document.querySelector<HTMLElement>('.floating-actions'),progress=document.querySelector<HTMLElement>('.reading-progress');
 const article=document.querySelector<HTMLElement>('.article');let pending=0;
 const update=()=>{pending=0;const y=window.scrollY;
  header?.classList.toggle('is-scrolled',y>8);backTop?.classList.toggle('is-visible',y>window.innerHeight*.8);
  if(progress&&article){const box=article.getBoundingClientRect();const total=box.height-window.innerHeight*.6;progress.style.transform=`scaleX(${Math.max(0,Math.min(1,total>0?-box.top/total:1)).toFixed(4)})`}
 };
 window.addEventListener('scroll',()=>{if(!pending)pending=requestAnimationFrame(update)},{passive:true});
 window.addEventListener('resize',update,{passive:true});update();
}

function reveal(){
 // Only cards that start below the fold wait for the viewport; the first screen animates in immediately.
 if(motion.matches||!('IntersectionObserver' in window))return;
 const cards=[...document.querySelectorAll<HTMLElement>('main > .card, main > .pagination')].filter(c=>c.getBoundingClientRect().top>window.innerHeight);
 const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){entry.target.classList.replace('reveal-pending','revealed');observer.unobserve(entry.target)}},{rootMargin:'0px 0px -8% 0px'});
 for(const card of cards){card.classList.add('reveal-pending');observer.observe(card)}
}

function spotlight(){
 // Pointer-following glow; coordinates are set only on the hovered card.
 let pending=0,target:HTMLElement|null=null,x=0,y=0;
 document.addEventListener('pointermove',e=>{
  if(!finePointer.matches||motion.matches)return;
  target=(e.target as Element).closest?.('.card') as HTMLElement|null;if(!target)return;x=e.clientX;y=e.clientY;
  if(!pending)pending=requestAnimationFrame(()=>{pending=0;if(!target)return;const box=target.getBoundingClientRect();target.style.setProperty('--mx',`${x-box.left}px`);target.style.setProperty('--my',`${y-box.top}px`)});
 },{passive:true});
}

function shortcuts(){
 window.addEventListener('keydown',e=>{
  if(e.key!=='/'||e.metaKey||e.ctrlKey||e.altKey)return;
  const active=document.activeElement as HTMLElement|null;
  if(active&&(active.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName))||document.querySelector('dialog[open]'))return;
  e.preventDefault();document.querySelector<HTMLButtonElement>('.search-trigger')?.click();
 });
 const input=document.querySelector<HTMLInputElement>('#site-search'),helper=document.querySelector<HTMLElement>('.search-heading .mascot-walker');let idle=0;
 input?.addEventListener('input',()=>{helper?.classList.add('is-reading');clearTimeout(idle);idle=window.setTimeout(()=>helper?.classList.remove('is-reading'),700)});
 document.querySelector('.like-button')?.addEventListener('click',e=>{const b=e.currentTarget as HTMLElement;b.classList.remove('is-popped');void b.offsetWidth;b.classList.add('is-popped')});
 const drawer=document.querySelector<HTMLElement>('.mobile-drawer');
 const closeDrawer=()=>{if(drawer&&!drawer.hidden)document.querySelector<HTMLButtonElement>('.mobile-menu')?.click()};
 document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDrawer()});
 // Tapping outside the open drawer closes it, matching common mobile menus.
 document.addEventListener('click',e=>{const t=e.target as Element;if(drawer&&!drawer.hidden&&!drawer.contains(t)&&!t.closest('.mobile-menu'))closeDrawer()});
}

export function startKiln(){mascots();scrollEffects();reveal();spotlight();shortcuts()}
