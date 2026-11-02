import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {updateSource} from './update-source.mjs';

export const updateIntervals=[1,6,12,24,168];
export const defaultUpdateConfig={mode:'manual',intervalHours:24};
export const updateError=(statusCode,message)=>Object.assign(new Error(message),{statusCode});
export function validateUpdateConfig(input){
 if(!input||Object.keys(input).some(k=>!['mode','intervalHours'].includes(k))||!['manual','auto'].includes(input.mode)||!updateIntervals.includes(input.intervalHours))throw updateError(400,'更新设置无效，请选择手动或定时模式及有效间隔');
 return {mode:input.mode,intervalHours:input.intervalHours};
}
export async function readUpdateFile(file,fallback=null){
 try{return JSON.parse(await fs.readFile(file,'utf8'))}catch(e){if(e.code==='ENOENT')return fallback;throw e}
}
export async function writeUpdateFile(file,value){
 await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});
 const temp=`${file}.${randomUUID()}.tmp`;
 try{await fs.writeFile(temp,JSON.stringify(value),{mode:0o600});await fs.rename(temp,file)}finally{await fs.rm(temp,{force:true})}
}
export async function publishUpdateRequest(directory,request){
 await fs.mkdir(directory,{recursive:true,mode:0o700});
 const temp=path.join(directory,`${request.id}.tmp`);
 try{await fs.writeFile(temp,JSON.stringify(request),{mode:0o600});await fs.link(temp,path.join(directory,'request.json'))}catch(e){if(e.code==='EEXIST')throw updateError(409,'已有更新任务，请等待结束');throw e}finally{await fs.rm(temp,{force:true})}
}
export function createSystemUpdate(dataDir,{clock=Date.now}={}){
 const directory=path.join(dataDir,'system-update');
 const file=name=>path.join(directory,name+'.json');
 const online=state=>Boolean(state?.heartbeatAt&&clock()-Date.parse(state.heartbeatAt)>=0&&clock()-Date.parse(state.heartbeatAt)<45000);
 return {
  async status(){
   const [config,worker,pending,checkRequest]=await Promise.all([readUpdateFile(file('config'),defaultUpdateConfig),readUpdateFile(file('status')),readUpdateFile(file('request')),readUpdateFile(file('check-request'))]);
   return {config:validateUpdateConfig(config),source:updateSource(worker),online:online(worker),check:worker?.check||null,checking:Boolean(checkRequest),worker,pending};
  },
  async requestCheck(){
   const state=await this.status();
   if(!state.online)throw updateError(503,'更新执行器未连接，暂时无法检查更新');
   await writeUpdateFile(file('check-request'),{id:randomUUID(),requestedAt:new Date(clock()).toISOString()});
   return {checking:true};
  },
  async configure(input){const config=validateUpdateConfig(input);await writeUpdateFile(file('config'),config);return config},
  async request(){
   const state=await this.status();
   if(!state.online)throw updateError(503,'更新执行器未连接，请先按运维文档在宿主机启用');
   if(state.pending||state.worker?.job?.status==='running')throw updateError(409,'已有更新任务，请等待结束');
   const request={id:randomUUID(),requestedAt:new Date(clock()).toISOString(),trigger:'manual'};
   await publishUpdateRequest(directory,request);
   return request;
  },
  async maintenance(){const state=await readUpdateFile(file('status'));return state?.job?.maintenance===true}
 };
}
