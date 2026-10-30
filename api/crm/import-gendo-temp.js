import { timingSafeEqual } from "node:crypto";
import { db, firebaseAdmin, send } from "../../lib/firebase.js";

// Temporary, restricted migration route. Remove after importing the October Gendo export.
// Never enables marketing, never modifies existing client records or revenue.
const expires=Date.parse("2026-10-30T18:30:00.000Z");
const raw=(v,n=140)=>typeof v==="string"?v.trim().slice(0,n):"";
const validDate=v=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+"T12:00:00Z"))&&new Date(v+"T12:00:00Z").toISOString().startsWith(v);
function authorized(req){
  const expected=process.env.PATTY_GENDO_IMPORT_TOKEN||"";
  const provided=req.headers["x-patty-import-token"]||"";
  if(Date.now()>expires||expected.length<50||typeof provided!=="string"||provided.length!==expected.length)return false;
  return timingSafeEqual(Buffer.from(provided),Buffer.from(expected));
}
function normalize(x){
 const code=raw(x.gendoCode,25);
 const name=raw(x.name,120);
 if(!/^\d{1,15}$/.test(code)||name.length<2)return null;
 const digits=raw(x.phone,35).replace(/\D/g,"");
 const full=digits.length===10||digits.length===11?"55"+digits:digits;
 const phone=full.length===12||full.length===13?full:null;
 const money=v=>v===null||v===undefined?null:Number.isSafeInteger(v)&&Math.abs(v)<=1e12?v:null;
 return {
   gendoCode:code,name,phone,
   originalPhone:phone?null:raw(x.phone,35),phoneNeedsReview:!phone,
   email:raw(x.email,150).toLowerCase(),
   birthDate:validDate(x.birthDate)?x.birthDate:null,
   lastVisit:validDate(x.lastVisit)?x.lastVisit:null,
   visits:Number.isSafeInteger(x.visits)&&x.visits>=0&&x.visits<1000000?x.visits:0,
   historicalBilledCents:money(x.historicalBilledCents),
   historicalBalanceCents:money(x.historicalBalanceCents)
 };
}
export default async function handler(req,res){
 if(!["GET","POST"].includes(req.method))return send(res,405,{error:"Método não permitido"});
 if(!authorized(req))return send(res,403,{error:"Migração não autorizada ou expirada"});
 try{
   const coll=db().collection("patty_customers");
   if(req.method==="GET"){
     const [a,b]=await Promise.all([coll.count().get(),db().collection("patty_leads").count().get()]);
     return send(res,200,{customers:a.data().count,leads:b.data().count,mode:"migration-audit"});
   }
   if(Number(req.headers["content-length"]||0)>250000)return send(res,413,{error:"Lote maior que limite"});
   const body=typeof req.body==="string"?JSON.parse(req.body):req.body||{};
   if(!Array.isArray(body.records)||body.records.length<1||body.records.length>200)return send(res,400,{error:"Máximo 200 clientes por lote"});
   const seen=new Set(),items=[];let invalid=0,repeated=0;
   for(const x of body.records){
     const item=normalize(x);
     if(!item){invalid++;continue}
     if(seen.has(item.gendoCode)){repeated++;continue}
     seen.add(item.gendoCode);items.push(item);
   }
   const refs=items.map(x=>coll.doc("gendo-"+x.gendoCode));
   const current=refs.length?await db().getAll(...refs):[];
   const pending=items.filter((x,i)=>!current[i].exists);
   const existing=items.length-pending.length;
   if(!pending.length)return send(res,200,{received:body.records.length,created:0,existing,invalid,repeated});
   const batch=db().batch();
   const now=firebaseAdmin().firestore.FieldValue.serverTimestamp();
   for(const item of pending)batch.create(coll.doc("gendo-"+item.gendoCode),{
     ...item,source:"gendo",marketingOptIn:false,consentRecordedAt:null,
     legacyTotalsNotCurrentRevenue:true,importedAt:now,importedBy:"approved-gendo-migration-2026-10-30"
   });
   await batch.commit();
   return send(res,200,{received:body.records.length,created:pending.length,existing,invalid,repeated});
 }catch(e){
   if(e instanceof SyntaxError)return send(res,400,{error:"JSON inválido"});
   console.error("Migração Gendo:",e.message);
   return send(res,500,{error:"Falha ao importar lote; nenhum registro do lote foi parcialmente sobrescrito"});
 }
}
