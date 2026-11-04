import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import {createHash} from "node:crypto";
import {audienceFilters,eligibleCustomer,normalizedPhone,validateCampaign,previewMessage} from "../lib/patty-campaign-rules.js";

const now=new Date("2026-11-04T12:00:00.000Z");
const f=audienceFilters({inactiveDays:90,minVisits:2,birthdayMonth:11,maxRecipients:80});
const client={name:"Ana",phone:"(48) 99999-9999",visits:4,lastVisit:"2026-07-01",birthDate:"1992-11-12",
  marketingOptIn:true,consentRecordedAt:{toDate:()=>new Date("2026-10-01")}};
assert.equal(normalizedPhone(client.phone),"5548999999999");
assert.equal(eligibleCustomer(client,f,now),true);
assert.equal(eligibleCustomer({...client,marketingOptIn:false},f,now),false,"Missing opt-in must always block");
assert.equal(eligibleCustomer({...client,marketingOptOut:true},f,now),false,"Opt-out must always block");
assert.equal(eligibleCustomer({...client,consentRecordedAt:null},f,now),false,"No consent record must always block");
assert.equal(eligibleCustomer({...client,phone:"11999"},f,now),false,"Invalid phone must always block");
assert.equal(eligibleCustomer({...client,lastVisit:"2026-10-10"},f,now),false,"Recent visit must not match inactive segment");
assert.equal(eligibleCustomer({...client,visits:1},f,now),false,"Visit minimum must be enforced");
assert.equal(eligibleCustomer({...client,birthDate:"1980-09-01"},f,now),false,"Birthday filter must be enforced");
assert.equal(eligibleCustomer({...client,lastVisit:"2026-02-31"},f,now),false,"Impossible dates must be excluded");
assert.throws(()=>audienceFilters({maxRecipients:501}),/Filtros/);
const future=new Date(Date.now()+86400000).toISOString();
const c=validateCampaign({title:"Volta em novembro",templateName:"patty_retorno_90_dias",language:"pt_BR",
  bodyPreview:"Olá, {nome}! Venha novamente à Patty Centro de Beleza.",segment:f,scheduledAt:future,useCustomerName:true});
assert.equal(c.status,"draft");
assert.equal(c.channel,"whatsapp_official");
assert.equal(c.segment.maxRecipients,80);
assert.equal(previewMessage(c.bodyPreview,"Ana"),"Olá, Ana! Venha novamente à Patty Centro de Beleza.");
assert.throws(()=>validateCampaign({...c,templateName:"Modelo com espaços"}),/modelo aprovado/i);
assert.throws(()=>validateCampaign({...c,scheduledAt:"2024-01-01T12:00:00Z"}),/Agendamento/);
assert.throws(()=>validateCampaign({...c,segment:{maxRecipients:10000}}),/Filtros/);

const codes={
 campaigns:readFileSync("api/crm/campaigns.js","utf8"),
 send:readFileSync("api/crm/marketing-send.js","utf8"),
 webhook:readFileSync("api/crm/meta-webhook.js","utf8"),
 operations:readFileSync("api/crm/operations.js","utf8")
};
const strip=s=>s.replace(/^import .*;\s*$/gm,"").replace(/export const config=/,"const config=")
 .replace("export default async function handler","async function handler");
const compose=(source,overrides={})=>{
 const context=vm.createContext({console,process:{env:{CRM_MANAGER_EMAILS:"manager@example.test"}},Date,URL,URLSearchParams,Number,
  requireStaff:async()=>({email:"manager@example.test"}),db:()=>({}),firebaseAdmin:()=>({firestore:{FieldValue:{serverTimestamp:()=>123}}}),
  send:(_,status,body)=>({status,body}),safeText: (s,max=200)=>typeof s==="string"?s.trim().slice(0,max):"",
  validateCampaign,eligibleCustomer,normalizedPhone,audienceFilters,createHash,Buffer,
  fetch:async()=>{throw Error("Unexpected network request")},...overrides});
 vm.runInContext(strip(source),context);
 return async request=>{context.request=request;return await vm.runInContext("handler(request,{setHeader(){},status(c){return {send(t){return {status:c,text:t}}}}})",context)};
};
let created=null,writes=0;
const campaigns=compose(codes.campaigns,{
 db:()=>({collection:name=>{
   assert.equal(name,"patty_campaigns");
   return {doc:()=>({id:"campaign1234",create:async data=>{writes++;created=data;}})};
 }}),
 firebaseAdmin:()=>({firestore:{FieldValue:{serverTimestamp:()=>123}}})
});
let result=await campaigns({method:"POST",headers:{},body:{action:"create",...c}});
assert.equal(result.status,201);
assert.equal(created.status,"draft");
assert.equal(created.stagedCount,0);
assert.equal(created.deliveryMode,"single_explicit_manager_action");
assert.equal(writes,1);
result=await campaigns({method:"GET",query:{mode:"connection"}});
assert.equal(result.body.sendingEnabled,false);
assert.equal(result.body.configured,false);
// Preparação em lotes: deduplica telefone, confirma opt-in e não reescreve o mesmo contato.
const store=new Map([["patty_campaigns/campaign1234",{status:"draft",segment:{inactiveDays:0,minVisits:0,birthdayMonth:0,maxRecipients:3},stagedCount:0}]]);
const customerDocs=[
 ["gendo-1",{...client,lastVisit:"2026-07-01"}],
 ["gendo-2",{...client,name:"Bia",phone:"5548998887777",marketingOptIn:false}],
 ["gendo-3",{...client,name:"Clara",phone:"5548999996666",marketingOptOut:true}],
 ["gendo-4",{...client,name:"Duplicada",phone:client.phone}]
].map(([id,data])=>({id,data:()=>data,ref:{_collection:"patty_customers",id}}));
for(const customer of customerDocs)store.set("patty_customers/"+customer.id,customer.data());
const snapshot=(ref)=>({id:ref.id,ref,exists:store.has(ref._collection+"/"+ref.id),
 data:()=>store.get(ref._collection+"/"+ref.id)});
const recRef=(collection,id)=>({_collection:collection,id,get:async()=>snapshot({_collection:collection,id}),
 collection(name){return {doc:docId=>recRef(collection+"/"+id+"/"+name,docId)}}});
const mockDb={
 collection:name=>({
  doc:id=>recRef(name,id||"campaign1234"),
  orderBy:()=>({limit:()=>({get:async()=>({docs:customerDocs,size:customerDocs.length})})})
 }),
 runTransaction:async fn=>fn({
  get:async ref=>snapshot(ref),
  create:(ref,value)=>store.set(ref._collection+"/"+ref.id,value),
  update:(ref,values)=>{
   const previous=store.get(ref._collection+"/"+ref.id);
   const updated={...previous};
   for(const [k,v] of Object.entries(values))updated[k]=v&&typeof v==="object"&&v.incr?Number(previous[k]||0)+v.incr:v;
   store.set(ref._collection+"/"+ref.id,updated);
  }
 })
};
const stage=compose(codes.campaigns,{db:()=>mockDb,
 firebaseAdmin:()=>({firestore:{FieldPath:{documentId:()=>"_id"},FieldValue:{serverTimestamp:()=>123,increment:n=>({incr:n})}}})});
let stageResult=await stage({method:"POST",headers:{},body:{action:"stage",id:"campaign1234"}});
assert.equal(stageResult.status,200);
assert.equal(stageResult.body.staged,1,"Only opted-in unique phone may be staged");
assert.equal(store.get("patty_campaigns/campaign1234").stagedCount,1);
stageResult=await stage({method:"POST",headers:{},body:{action:"stage",id:"campaign1234"}});
assert.equal(stageResult.status,200);
assert.equal(stageResult.body.staged,0,"Repeated staging must be idempotent");
assert.equal(store.get("patty_campaigns/campaign1234").stagedCount,1);

const forbidden=compose(codes.campaigns,{requireStaff:async()=>({email:"staff@example.test"})});
result=await forbidden({method:"POST",headers:{},body:{action:"create",...c}});
assert.equal(result.status,403,"Staff cannot create campaigns");
let sentCalls=0;
const guardedSend=compose(codes.send,{fetch:async()=>{sentCalls++;throw Error("Network should not be reached")}});
result=await guardedSend({method:"POST",headers:{},body:{action:"send_one",confirm:"CONFIRMO_ENVIO_REAL"}});
assert.equal(result.status,503,"Sending must remain disabled without Meta integration");
assert.equal(sentCalls,0);

assert.match(codes.send,/status:"sending"/,"Send attempts need a transaction lock");
assert.match(codes.send,/lastReservedAt/,"Send frequency lock must be persisted");
assert.match(codes.send,/templateIsApproved/,"Template must be approved on Meta");
assert.match(codes.send,/CONFIRMO_ENVIO_REAL/,"No send without explicit per-contact confirmation");
assert.match(codes.webhook,/timingSafeEqual/,"Webhook requires signed request");
assert.match(codes.webhook,/marketingOptOut:true/,"Incoming STOP must disable marketing");
assert.match(codes.operations,/marketingOptOut:!consent/,"Manager opt-out must persist");
const ui=readFileSync("crm-campanhas.html","utf8");
assert.match(ui,/Marketing → Campanhas/);
assert.match(ui,/send_one/);
assert.match(ui,/stageTen/);
assert.match(ui,/sessionStorage/);
assert.match(ui,/optoutButton/);
assert.match(readFileSync("patty-crm-ui.js","utf8"),/crm-campanhas\.html/);
console.log("Patty marketing regression passed: segmentation, opt-in, opt-out, scheduling, draft creation, manager permission, disabled real send, Meta signature and UI.");
