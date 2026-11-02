import {themeOf} from '../../server/themes.mjs';

export const SKIN_KEY='admin-skin';
type SkinHost={read:()=>string|undefined;write:(id:string)=>void;remember:(id:string)=>void};

// The saved choice is kept separately from the preview, including when browser storage is blocked.
// The host supplies DOM/storage access; tests use an isolated in-memory host.
export function createSkinController(host:SkinHost){
 let saved=themeOf(host.read()).id;
 return {
  apply(id?:string){const skin=themeOf(id).id;saved=skin;host.write(skin);try{host.remember(skin)}catch{}},
  preview(id:string){host.write(themeOf(id).id)},
  restore(){host.write(saved)}
 };
}
