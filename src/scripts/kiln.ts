// Kiln theme interactions. Everything here is progressive: without JS the page is complete and static.
// Motion respects prefers-reduced-motion and stops scheduling while the page is hidden.
const motion=matchMedia('(prefers-reduced-motion: reduce)');
const finePointer=matchMedia('(pointer: fine)');
const random=(min:number,max:number)=>min+Math.random()*(max-min);
const lines=['在写新东西吗','慢慢读，不着急','这里很暖和','按 / 可以搜索文章','点我也没有彩蛋','火不会灭的'];

function later(fn:()=>void,min:number,max:number){
 // Re-check visibility when the timer fires instead of piling up work for a background tab.
 window.setTimeout(()=>{if(document.hidden){document.addEventListener('visibilitychange',()=>later(fn,min,max),{once:true});return}fn()},random(min,max));
}

function mascots(){
 const all=[...document.querySelectorAll<HTMLElement>('.mascot-walker')];
 let line=Math.floor(Math.random()*lines.length);
 for(const walker of all){
  const button=walker.querySelector<HTMLButtonElement>('.mascot')!,bubble=walker.querySelector<HTMLElement>('.mascot-bubble')!;
  let hideBubble=0;
  button.addEventListener('click',()=>{
   if(!motion.matches){button.classList.remove('is-hopping');void button.offsetWidth;button.classList.add('is-hopping')}
   bubble.textContent=lines[line++%lines.length];bubble.classList.add('is-visible');
   clearTimeout(hideBubble);hideBubble=window.setTimeout(()=>bubble.classList.remove('is-visible'),2400);
  });
  button.addEventListener('animationend',e=>{if(e.animationName==='kiln-hop')button.classList.remove('is-hopping')});
  const blink=()=>{if(!motion.matches){walker.classList.add('is-blinking');window.setTimeout(()=>walker.classList.remove('is-blinking'),140)}later(blink,2500,6500)};
  later(blink,800,4000);
  if(walker.classList.contains('is-wanderer'))wander(walker);
 }
 if(!all.length)return;
 // Eyes follow the pointer by at most one pixel of the 22x16 grid.
 let pending=0,px=0,py=0;
 window.addEventListener('pointermove',e=>{
  if(!finePointer.matches||motion.matches)return;px=e.clientX;py=e.clientY;
  if(pending)return;pending=requestAnimationFrame(()=>{pending=0;for(const walker of all){
   const box=walker.getBoundingClientRect();if(!box.width)continue;
   const dx=Math.max(-1,Math.min(1,(px-box.left-box.width/2)/180)),dy=Math.max(-1,Math.min(1,(py-box.top-box.height/2)/180));
   walker.querySelector<SVGGElement>('.mascot-look')!.style.transform=`translate(${dx.toFixed(2)}px,${dy.toFixed(2)}px)`;
  }});
 },{passive:true});
}

function wander(walker:HTMLElement){
 const stage=walker.parentElement!;let x=0;
 walker.addEventListener('transitionend',e=>{if(e.propertyName==='transform')walker.classList.remove('is-walking')});
 const step=()=>{
  if(!motion.matches){
   const room=stage.clientWidth-walker.offsetWidth-Number(stage.dataset.reserve||0);
   if(room>20){
    const target=Math.round(random(0,room));const distance=Math.abs(target-x);
    if(distance>12){walker.style.transitionDuration=`${(distance/28).toFixed(2)}s`;walker.classList.add('is-walking');walker.style.transform=`translateX(${target}px)`;x=target}
   }
  }
  later(step,4000,9000);
 };
 later(step,1500,3500);
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
