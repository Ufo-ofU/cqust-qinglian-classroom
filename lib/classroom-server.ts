import {env} from 'cloudflare:workers';
import {questions,questionSummaries} from './questions';
type Config={DB:D1Database;TEACHER_KEY?:string;SESSION_SECRET?:string};
export type Session={id:string;code:string;question:number;phase:string;created:number;revision:number};
export const config=()=>env as unknown as Config;
export const db=()=>config().DB;
const enc=new TextEncoder();
function hex(b:ArrayBuffer){return Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('')}
export async function digest(s:string){return hex(await crypto.subtle.digest('SHA-256',enc.encode(s)))}
async function mac(s:string){const secret=config().SESSION_SECRET;if(!secret)throw Error('Signing key unavailable');const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',key,enc.encode(s)))}
function equal(a:string,b:string){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0}
export async function token(role:string,id:string){const raw=role+'.'+id+'.'+(Date.now()+12*3600000);return raw+'.'+await mac(raw)}
export async function identity(req:Request,role:string){const name=role==='teacher'?'ql_teacher':'ql_student';const val=req.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1);if(!val)return null;const parts=val.split('.');if(parts.length!==4||parts[0]!==role||Number(parts[2])<Date.now())return null;return equal(await mac(parts.slice(0,3).join('.')),parts[3])?parts[1]:null}
export function cookie(req:Request,role:string,val:string,maxAge=43200){return (role==='teacher'?'ql_teacher':'ql_student')+'='+val+'; HttpOnly; SameSite=Strict; Path=/; Max-Age='+maxAge+(new URL(req.url).protocol==='https:'?'; Secure':'')}
export async function getSession(code:string){return await db().prepare('SELECT * FROM sessions WHERE code = ?').bind(code).first<Session>()}
export async function view(s:Session,teacher=false){const q=questions[s.question];const data:any={id:s.id,code:s.code,question:s.question,phase:s.phase,revision:s.revision,title:q.title,tag:q.tag,scene:q.scene,prompt:q.prompt,options:q.options,summaries:questionSummaries};if(teacher||s.phase==='revealed'||s.phase==='ended'){const result=await db().prepare('SELECT choice, COUNT(*) AS n FROM votes WHERE session = ? AND question = ? GROUP BY choice').bind(s.id,s.question).all<{choice:number;n:number}>();data.counts=[0,0,0];for(const r of result.results)data.counts[r.choice]=r.n;data.total=data.counts.reduce((a:number,b:number)=>a+b,0)}if(s.phase==='revealed'||s.phase==='ended'){data.correct=q.correct;data.explanation=q.explanation;data.action=q.action}return data}
export function json(data:unknown,status=200,headers:Record<string,string>={}){return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}})}
