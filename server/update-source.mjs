export const defaultUpdateSource=Object.freeze({
 repository:'undefim/undefim-lite-blog',
 branch:'main',
 url:'https://github.com/undefim/undefim-lite-blog'
});
const legacyRepository='qumingla/undefim-lite-blog';
export const canonicalUpdateRepository=repository=>repository===legacyRepository?defaultUpdateSource.repository:repository;
export function updateSource(worker){
 const repository=canonicalUpdateRepository(worker?.repository||defaultUpdateSource.repository);
 return {repository,branch:worker?.branch||defaultUpdateSource.branch,url:`https://github.com/${repository}`};
}
export function matchesUpdateRemote(remote,repository){
 const canonical=canonicalUpdateRepository(repository);
 const repositories=canonical===defaultUpdateSource.repository?[canonical,legacyRepository]:[canonical];
 return repositories.some(name=>remote===`https://github.com/${name}`||remote===`https://github.com/${name}.git`);
}
