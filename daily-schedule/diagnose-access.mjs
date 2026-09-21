// Read-only diagnosis. Never emit credential values or raw response bodies.
const token=process.env.VERCEL_TOKEN;
if(!token) throw new Error('MISSING_VERCEL_TOKEN');
const team='team_44tkvxP20I5s9SUmlxfUEQM1';
const project='prj_C4Gll6J7LNgmwPoOg6Qf1nABUn0A';
const request=JSON.parse(await (await import('node:fs/promises')).readFile(new URL('./request.json',import.meta.url),'utf8'));
for(const [label,route] of [['project','/v9/projects/'+project],['production-alias','/v4/aliases/magicoffice-data.vercel.app'],['deployment-id','/v13/deployments/'+request.expectedDeploymentId],['deployment-host','/v13/deployments/magicoffice-data.vercel.app']]) {
 const u=new URL(route,'https://api.vercel.com');u.searchParams.set('teamId',team);
 const r=await fetch(u,{headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(30000)});
 const body=await r.json().catch(()=>({}));
 const message=String(body.error?.message||body.message||'').toLowerCase();
 const result={check:label,status:r.status,code:String(body.error?.code||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,60)};
 if(!r.ok)result.flags={mentionsToken:/token/.test(message),expired:/expir/.test(message),invalid:/invalid/.test(message),accessDenied:/access|permission|authoriz|scope/.test(message),notFound:/not found|does not exist|could not find/.test(message),deployment:/deployment/.test(message),team:/team/.test(message)};
 if(r.ok) {result.projectMatches=body.projectId===project||body.project?.id===project||body.id===project;result.state=body.readyState;result.expectedDeploymentMatches=body.deploymentId===request.expectedDeploymentId||body.deployment?.id===request.expectedDeploymentId||body.id===request.expectedDeploymentId;}
 console.log(JSON.stringify(result));
}
