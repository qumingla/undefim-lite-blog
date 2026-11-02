import React,{useEffect,useState} from 'react';
import {Download,RefreshCw,Save} from 'lucide-react';
import {defaultUpdateSource} from '../../server/update-source.mjs';

type Props={api:(url:string,options?:any)=>Promise<any>,notify:(message:string,error?:boolean)=>void};
const states:Record<string,string>={running:'更新中',success:'更新成功',failed:'更新失败',unchanged:'已是最新版'};
const date=(value?:string)=>value?new Date(value).toLocaleString('zh-CN'):'尚无记录';
const short=(value?:string)=>value?.slice(0,7)||'—';
export default function SystemUpdate({api,notify}:Props){
 const [data,setData]=useState<any>(null),[config,setConfig]=useState({mode:'manual',intervalHours:24}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let active=true;const load=()=>api('/system/update').then(next=>{if(active){setData(next);setError('')}}).catch(e=>{if(active)setError(e.message)});load();const timer=setInterval(load,5000);return()=>{active=false;clearInterval(timer)}},[api]);
 useEffect(()=>{if(data?.config)setConfig(data.config)},[data?.config?.mode,data?.config?.intervalHours]);
 const action=async(fn:()=>Promise<void>)=>{setBusy(true);try{await fn();setData(await api('/system/update'))}catch(e){notify((e as Error).message,true)}finally{setBusy(false)}};
 const job=data?.worker?.job;
 const running=!!data?.pending||job?.status==='running';
 const check=data?.check,checking=!!data?.checking;
 const source=data?.source||defaultUpdateSource;
 const recheck=()=>action(async()=>{await api('/system/update/check',{method:'POST'})});
 const update=()=>{if(window.confirm('更新会短暂暂停写入并重启博客，更新前会自动完整备份。确定现在更新吗？'))action(async()=>{await api('/system/update/run',{method:'POST'});notify('更新任务已提交。服务重启时可能短暂断线，恢复后会继续显示结果。')})};
 let tone='idle',title='正在检查更新…',detail='正在对比 GitHub 上的最新版本。',canUpdate=false,canCheck=!!data?.online&&!running;
 if(running){tone='running';title='正在更新';detail=job?.message||'更新任务已排队，等待执行器处理。'}
 else if(data&&!data.online){tone='blocked';title='无法检查更新';detail='更新执行器未连接，请检查 Compose 中的 updater 服务是否正常运行。'}
 else if(check?.state==='latest'){tone='latest';title='已是最新版';detail=`当前版本 ${short(check.from)}，与 GitHub ${source.branch} 分支一致。`}
 else if(check?.state==='available'){tone='available';canUpdate=true;title='发现新版本';detail=check.reason==='redeploy'?check.message:`有 ${check.ahead} 项更新：${short(check.from)} 到 ${short(check.to)}。`}
 else if(check?.state==='blocked'){tone='blocked';title='暂时无法自动更新';detail=check.message}
 else if(check?.state==='error'){tone='error';title='检查更新失败';detail=check.message}
 return <>
  <div className="page-heading"><div><h1>系统更新</h1><p>自动对比 GitHub 上的最新版本，保留你的内容与数据。</p></div></div>
  {error&&<p className="inline-error" role="alert">{error}。服务重启期间会自动重试连接。</p>}
  <section className={'panel update-status '+tone} aria-live="polite"><div className="update-status-main"><span className="update-dot" aria-hidden="true"/><div><h2>{title}</h2><p>{detail}</p>{check&&!running&&<small>{checking?'正在重新检查…':`上次检查 ${date(check.checkedAt)}，之后每 10 分钟自动检查`}</small>}</div></div><div className="update-status-actions">{canUpdate&&!running&&<button className="button primary" disabled={busy} onClick={update}><Download size={16}/><span>立即更新</span></button>}{canCheck&&<button className="button" disabled={busy||checking} onClick={recheck}><RefreshCw size={16}/><span>{checking?'检查中…':'重新检查'}</span></button>}</div>{tone==='available'&&check.commits?.length>0&&<ul className="update-commits" aria-label="更新内容">{check.commits.map((c:any)=><li key={c.sha}><code>{c.sha}</code><span>{c.subject}</span></li>)}{check.ahead>check.commits.length&&<li className="muted">另有 {check.ahead-check.commits.length} 项更新未列出</li>}</ul>}</section>
  <section className="panel settings-panel update-panel"><div className="panel-title"><h2>更新来源</h2><span className={'job-status '+(data?.online?'success':'')}>{data?.online?'执行器已连接':'执行器未连接'}</span></div><p className="muted">已预设本博客的开源仓库与 main 分支，无需手动填写。部署端可固定其他来源，后台不接受任意脚本或命令。</p><dl className="update-details"><div><dt>GitHub 仓库</dt><dd><a href={source.url} target="_blank" rel="noopener noreferrer">{source.repository}</a></dd></div><div><dt>跟踪分支</dt><dd>{source.branch}</dd></div><div><dt>本地代码版本</dt><dd><code>{short(data?.worker?.revision)}</code></dd></div><div><dt>GitHub 最新版本</dt><dd><code>{short(check?.to)}</code></dd></div><div><dt>下次自动更新</dt><dd>{data?.config?.mode==='auto'&&!data?.worker?.paused?date(data?.worker?.nextRunAt):'未启用或已暂停'}</dd></div></dl>{data?.worker?.paused&&<p className="inline-error">上次更新异常，自动更新已暂停。请先检查宿主机状态，再手动更新恢复；若回退未完成，写操作仍保持暂停。</p>}</section>
  <section className="panel settings-panel update-panel"><h2>更新方式</h2><p className="muted">默认仅手动。定时模式到点时只在发现新版本后才会备份、构建和重启；更新期间写操作会短暂暂停，不会发布未发布草稿。</p><form onSubmit={e=>{e.preventDefault();action(async()=>{await api('/system/update/config',{method:'PUT',body:config});notify('系统更新设置已保存。')})}}><div className="form-grid"><label className="field"><span>更新模式</span><select value={config.mode} onChange={e=>setConfig({...config,mode:e.target.value})}><option value="manual">仅手动更新</option><option value="auto">定时自动更新</option></select></label><label className="field"><span>检查间隔</span><select disabled={config.mode!=='auto'} value={config.intervalHours} onChange={e=>setConfig({...config,intervalHours:Number(e.target.value)})}>{[[1,'每小时'],[6,'每 6 小时'],[12,'每 12 小时'],[24,'每天'],[168,'每周']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label></div><button className="button" type="submit" disabled={busy||!data}><Save size={16}/><span>保存更新设置</span></button></form></section>
  <section className="panel settings-panel update-panel" aria-live="polite"><div className="panel-title"><h2>最近任务</h2></div>{data?.pending&&job?.id!==data.pending.id&&<p className="muted">任务已排队，等待宿主机执行器。</p>}{job?<><div className="update-result"><span className={'job-status '+job.status}>{states[job.status]||job.status}</span><span className="muted">{job.trigger==='auto'?'定时触发':'手动触发'} · {date(job.startedAt)}</span></div><p>{job.message}</p><p className="muted">{short(job.from)} 到 {short(job.to)}</p>{job.backup&&<p className="muted">更新前备份：{job.backup}</p>}{job.rollback&&<p className="muted">{job.rollback}</p>}</>:!data?.pending&&<p className="muted">尚无更新任务。</p>}<p className="muted">这里只显示经过筛选的阶段与结果，不展示可能含凭据的 Git、Docker 原始输出。完整故障排查应在宿主机进行。</p></section>
 </>;
}
