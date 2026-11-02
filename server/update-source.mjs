export const defaultUpdateSource=Object.freeze({
 repository:'undefim/undefim-lite-blog',
 branch:'main',
 url:'https://github.com/undefim/undefim-lite-blog'
});
export function updateSource(worker){
 const repository=worker?.repository||defaultUpdateSource.repository;
 return {repository,branch:worker?.branch||defaultUpdateSource.branch,url:`https://github.com/${repository}`};
}
export function matchesUpdateRemote(remote,repository){
 return [`https://github.com/${repository}`,`https://github.com/${repository}.git`].includes(remote);
}
