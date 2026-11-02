// DOM-free helpers for the Kiln mascot: hill geometry and action choice. Kept pure so tests can cover them.
export type Hill={left:number;width:number;height:number;profile:number[]};
export type Action='wander'|'warm'|'climb'|'imagine'|'doze'|'gaze';

// Height of the drawn hill (in px above the ground) under a given x position on the stage.
export function hillHeightAt(hill:Hill,x:number){
 const columns=hill.profile.length;if(!columns||hill.width<=0)return 0;
 const column=Math.floor((x-hill.left)/(hill.width/columns));
 if(column<0||column>=columns)return 0;
 return hill.profile[column]/Math.max(...hill.profile)*hill.height;
}

// Evenly spaced footholds from one x position to another, each lifted to the slope beneath it.
export function climbPath(hill:Hill,from:number,to:number,steps:number){
 return Array.from({length:Math.max(1,steps)},(_,i)=>{const x=from+(to-from)*(i+1)/Math.max(1,steps);return {x,lift:hillHeightAt(hill,x)}});
}

export const actionWeights:Record<Action,number>={wander:3,warm:2,climb:2,imagine:2,doze:1.5,gaze:1};

// Weighted choice that avoids repeating the previous scene action (plain wandering may repeat).
export function pickAction(random:number,previous?:Action):Action{
 const options=(Object.keys(actionWeights) as Action[]).filter(a=>a==='wander'||a!==previous);
 const total=options.reduce((sum,a)=>sum+actionWeights[a],0);
 let roll=Math.min(Math.max(random,0),.999999)*total;
 for(const action of options){roll-=actionWeights[action];if(roll<0)return action}
 return options[options.length-1];
}
