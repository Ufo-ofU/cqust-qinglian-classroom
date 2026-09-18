const fs=require('fs'),crypto=require('crypto'),assert=require('assert');
(async()=>{
const config=Object.fromEntries(fs.readFileSync(process.argv[2]+'/.dev.vars','utf8').trim().split(/\r?\n/).map(s=>s.replace(/^\uFEFF/,'').split('=')));
const base='http://localhost:5173';const post=async(action,data,cookie='')=>{const r=await fetch(base+'/api/classroom/'+action,{method:'POST',headers:{'Content-Type':'application/json',Origin:base,Cookie:cookie},body:JSON.stringify(data)});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]}};
let r=await post('login',{key:config.TEACHER_KEY});assert.equal(r.status,200);const teacher=r.cookie;
let state=await (await fetch(base+'/api/classroom/teacher',{headers:{Cookie:teacher}})).json();let s=state.session;
if(s&&s.phase!=='ended'){r=await post('control',{code:s.code,revision:s.revision,command:'end'},teacher);assert.equal(r.status,200)}
r=await post('create',{},teacher);assert.equal(r.status,200);s=r.data.session;r=await post('control',{code:s.code,revision:s.revision,command:'open'},teacher);assert.equal(r.status,200);
const n=4700,concurrency=50;let index=0,ok=0;const latencies=[],errors=[];const start=Date.now();const cookies=[];
async function worker(){while(index<n){const i=index++;const raw='student.'+crypto.randomUUID()+'.'+(Date.now()+3600000);const t=raw+'.'+crypto.createHmac('sha256',config.SESSION_SECRET).update(raw).digest('hex');const cookie='ql_student='+t;cookies.push(cookie);const begun=Date.now();try{const response=await post('vote',{code:s.code,question:0,choice:i%3},cookie);latencies.push(Date.now()-begun);if(response.status===200&&response.data.choice===i%3)ok++;else errors.push({i,status:response.status,data:response.data})}catch(e){errors.push({i,error:e.message})}}}
await Promise.all(Array.from({length:concurrency},worker));const elapsed=Date.now()-start;
state=await (await fetch(base+'/api/classroom/teacher',{headers:{Cookie:teacher}})).json();assert.equal(state.session.total,n);
await Promise.all(cookies.slice(0,100).map(cookie=>post('vote',{code:s.code,question:0,choice:2},cookie)));
state=await (await fetch(base+'/api/classroom/teacher',{headers:{Cookie:teacher}})).json();assert.equal(state.session.total,n);latencies.sort((a,b)=>a-b);
const result={environment:'local development worker and local D1; not production or campus network',requests:n,concurrency,accepted:ok,errors:errors.length,elapsedMs:elapsed,p95Ms:latencies[Math.floor(latencies.length*.95)],duplicateRetries:100,totalAfterRetries:state.session.total,counts:state.session.counts};fs.writeFileSync('work/load-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));assert.equal(errors.length,0);
r=await post('control',{code:s.code,revision:state.session.revision,command:'close'},teacher);assert.equal(r.status,200);
r=await post('vote',{code:s.code,question:0,choice:1},'ql_student='+(()=>{const v='student.'+crypto.randomUUID()+'.'+(Date.now()+100000);return v+'.'+crypto.createHmac('sha256',config.SESSION_SECRET).update(v).digest('hex')})());assert.equal(r.status,409);
console.log('PASS: closed submission rejected after load.');
})().catch(e=>{console.error(e);process.exit(1)});
