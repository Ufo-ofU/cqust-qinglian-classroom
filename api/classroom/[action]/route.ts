import {config,db,identity,token,cookie,getSession,view,json,digest,type Session} from '../../../../lib/classroom-server';
export async function GET(req:Request,{params}:{params:Promise<{action:string}>}){
 try{const {action}=await params;const code=new URL(req.url).searchParams.get('code')??'';
 if(action==='teacher'){if(!await identity(req,'teacher'))return json({error:'请先输入教师口令'},401);const s=await db().prepare('SELECT * FROM sessions ORDER BY created DESC LIMIT 1').first<Session>();return json({session:s?await view(s,true):null})}
 if(!/^\d{6}$/.test(code))return json({error:'请输入六位课堂码'},400);
 // Short-lived shared cache limits repeated database reads from large classrooms.
 const cache = (globalThis.caches as unknown as {default?:Cache})?.default;
 const cacheKey = new Request(new URL('/api/classroom/state?code='+code,req.url));
 if(action==='state' && cache){const cached=await cache.match(cacheKey);if(cached){const headers=new Headers(cached.headers);headers.set('Cache-Control','no-store');return new Response(cached.body,{headers})}}
 const s=await getSession(code);if(!s)return json({error:'没有找到这间课堂，请核对课堂码'},404);
 if(action==='state'){const payload={session:await view(s)};if(cache)try{await cache.put(cacheKey,Response.json(payload,{headers:{'Cache-Control':'public, max-age=2'}}))}catch{}return json(payload)};
 if(action==='mine'){const id=await identity(req,'student');if(!id)return json({choice:null});const row=await db().prepare('SELECT choice FROM votes WHERE session = ? AND question = ? AND participant = ?').bind(s.id,s.question,id).first<{choice:number}>();return json({choice:row?.choice??null,question:s.question})}
 return json({error:'页面不存在'},404);
 }catch(e){console.error('classroom read failed',e);return json({error:'课堂连接暂时不可用，请稍后重试'},503)}
}
export async function POST(req:Request,{params}:{params:Promise<{action:string}>}){
 try{const origin=req.headers.get('origin');if(!origin||origin!==new URL(req.url).origin)return json({error:'请求来源无效'},403);
 if(Number(req.headers.get('content-length')??0)>4096)return json({error:'请求过大'},413);
 const {action}=await params;let p:any;try{p=await req.json()}catch{return json({error:'请求格式无效'},400)}
 if(action==='login'){
  if(!config().TEACHER_KEY||!config().SESSION_SECRET)return json({error:'教师入口尚未配置，请联系活动负责人'},503);
  const key=await digest(req.headers.get('cf-connecting-ip')??'local');const now=Date.now();
  await db().prepare('INSERT INTO login_attempts (key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires < ? THEN 1 ELSE count+1 END, expires=CASE WHEN expires < ? THEN ? ELSE expires END').bind(key,now+600000,now,now,now+600000).run();
  const attempts=await db().prepare('SELECT count FROM login_attempts WHERE key=?').bind(key).first<{count:number}>();if((attempts?.count??0)>10)return json({error:'尝试次数过多，请10分钟后再试'},429);
  if(typeof p.key!=='string'||p.key.length>200||await digest(p.key)!==await digest(config().TEACHER_KEY!))return json({error:'教师口令不正确'},401);
  await db().prepare('DELETE FROM login_attempts WHERE key=?').bind(key).run();return json({ok:true},200,{'Set-Cookie':cookie(req,'teacher',await token('teacher','instructor'))});
 }
 if(action==='join'){
  if(typeof p.code!=='string'||!/^\d{6}$/.test(p.code))return json({error:'请输入六位课堂码'},400);const s=await getSession(p.code);if(!s)return json({error:'没有找到这间课堂，请核对课堂码'},404);
  const existing=await identity(req,'student');const id=existing??crypto.randomUUID();return json({session:await view(s)},200,{'Set-Cookie':cookie(req,'student',await token('student',id))});
 }
 if(action==='vote'){
  const id=await identity(req,'student');if(!id)return json({error:'请重新进入课堂'},401);
  if(typeof p.code!=='string'||!/^\d{6}$/.test(p.code)||!Number.isInteger(p.question)||p.question<0||p.question>2||!Number.isInteger(p.choice)||p.choice<0||p.choice>2)return json({error:'请选择有效选项'},400);
  const s=await getSession(p.code);if(!s)return json({error:'课堂不存在'},404);
  await db().prepare("INSERT INTO votes (session,question,participant,choice,created) SELECT id,question,?,?,? FROM sessions WHERE id=? AND question=? AND phase='open' ON CONFLICT(session,question,participant) DO NOTHING").bind(id,p.choice,Date.now(),s.id,p.question).run();
  const row=await db().prepare('SELECT choice FROM votes WHERE session=? AND question=? AND participant=?').bind(s.id,p.question,id).first<{choice:number}>();if(!row)return json({error:'本题已收题或尚未开始，答案未提交'},409);return json({choice:row.choice});
 }
 if(!await identity(req,'teacher'))return json({error:'请先登录教师端'},401);
 if(action==='logout')return json({ok:true},200,{'Set-Cookie':cookie(req,'teacher','',0)});
 if(action==='create'){
  const active=await db().prepare("SELECT id FROM sessions WHERE phase <> 'ended' LIMIT 1").first();if(active)return json({error:'请先结束当前课堂，再创建新课堂'},409);
  const id=crypto.randomUUID();const random=crypto.getRandomValues(new Uint32Array(1))[0];const code=String(100000+random%900000);await db().prepare("INSERT INTO sessions (id,code,question,phase,created,revision) VALUES (?,?,0,'waiting',?,0)").bind(id,code,Date.now()).run();return json({session:await view((await getSession(code))!,true)});
 }
 if(action==='control'){
  const s=typeof p.code==='string'?await getSession(p.code):null;if(!s)return json({error:'课堂不存在'},404);
  const allowed:Record<string,{from:string[];to:string}>={open:{from:['waiting'],to:'open'},close:{from:['open'],to:'closed'},reveal:{from:['closed'],to:'revealed'},next:{from:['revealed'],to:'waiting'},end:{from:['waiting','open','closed','revealed'],to:'ended'}};
  const a=typeof p.command==='string'?allowed[p.command]:null;
  if(!a||!a.from.includes(s.phase)||p.revision!==s.revision||(p.command==='next'&&s.question>=2))return json({error:'课堂状态已变化，请刷新后重试'},409);
  const result=await db().prepare('UPDATE sessions SET phase=?,question=?,revision=revision+1 WHERE id=? AND revision=?').bind(a.to,p.command==='next'?s.question+1:s.question,s.id,s.revision).run();if(!result.meta.changes)return json({error:'课堂状态已变化，请刷新后重试'},409);
  return json({session:await view((await getSession(s.code))!,true)});
 }
 return json({error:'操作不存在'},404);
 }catch(e){console.error('classroom write failed',e);return json({error:'操作暂未完成，请稍后重试'},503)}
}
