import { getChatGPTUser } from "@/app/chatgpt-auth";
import { emptyProfile,sanitizeProfile,ValidationError } from "@/lib/server/core";
import { database,isSameOrigin,jsonError } from "@/lib/server/store";
import { feedInput,queryFeed,FeedExpiredError } from "@/lib/server/feed-query";
import { refreshStaleSources } from "@/lib/server/refresh";
import { waitUntil } from "cloudflare:workers";
import { readSources } from "@/lib/server/catalog";

export const dynamic = "force-dynamic";
async function respond(request:Request,posted:boolean) {
  if(posted&&!isSameOrigin(request))return jsonError('This request must come from readzz',403);
  const query=new URL(request.url).searchParams;
  const pageSize=Number(query.get('pageSize')||24);
  if(!Number.isInteger(pageSize)||pageSize<1||pageSize>100)return jsonError('Use a pageSize from 1 to 100',400);
  if((query.get('q')||'').length>200||(query.get('company')||'').length>2000||(query.get('company')||'').split(',').length>100||(query.get('topic')||'').length>1000||(query.get('topic')||'').split(',').length>30||(query.get('signal')||'').length>80||(query.get('exclude')||'').length>2500||(query.get('exclude')||'').split(',').length>30||(query.get('ids')||'').length>41000||(query.get('ids')||'').split(',').length>500)return jsonError('Filter is too long',400);
  const requested=query.get('snapshot');
  if(requested&&(!Number.isFinite(Date.parse(requested))||Date.parse(requested)>Date.now()+60000))return jsonError('Invalid feed snapshot',400);
  try {
    const db=database();
    const catalog=await readSources(db);
    const user=await getChatGPTUser();
    let profile=emptyProfile();
    if(posted){
      if(!request.headers.get('content-type')?.includes('application/json'))return jsonError('Send JSON feed preferences',415);
      const body=await request.text();if(body.length>500000)return jsonError('Feed preferences are too large',413);
      const data=JSON.parse(body) as Record<string,unknown>;
      if(!data||typeof data!=='object'||Array.isArray(data))return jsonError('Feed preferences are required',400);
      if(user?data.owner!==user.userId:data.owner!==undefined&&data.owner!==null)return jsonError('Your reading account changed. Reload before requesting a personal feed.',409);
      profile=sanitizeProfile(data.profile??{},emptyProfile(),new Set(catalog.map(s=>s.id)));
    } else if(user){
      const row=await db.prepare('SELECT data FROM profiles WHERE user_id=?').bind(user.userId).first<{data:string}>();
      if(row)profile=sanitizeProfile(JSON.parse(row.data),profile,new Set(catalog.map(s=>s.id)));
    }
    const input=feedInput(query,profile,requested||new Date().toISOString());
    const result=await queryFeed(db,input,catalog,{pageSize,cursor:query.get('cursor')==='0'?null:query.get('cursor'),owner:user?`account:${user.userId}`:'guest'});
    waitUntil(refreshStaleSources().catch(()=>undefined));
    return Response.json(result,{headers:{'Cache-Control':'private, no-store','Vary':'Cookie'}});
  }catch(error){
    if(error instanceof FeedExpiredError)return jsonError(error.message,409);
    if(error instanceof ValidationError||error instanceof SyntaxError)return jsonError(error.message,400);
    console.error('readzz.feed',error instanceof Error?error.message:'Unavailable');
    return jsonError('Your feed is temporarily unavailable. Please try again.',503);
  }
}
export async function GET(request:Request){return respond(request,false);}
export async function POST(request:Request){return respond(request,true);}
