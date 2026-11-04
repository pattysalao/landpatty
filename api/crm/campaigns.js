import {db,requireStaff,firebaseAdmin,send} from "../../lib/firebase.js";
import {createHash} from "node:crypto";
import {audienceFilters,eligibleCustomer,normalizedPhone,safeText,validateCampaign} from "../../lib/patty-campaign-rules.js";

const manager=email=>(process.env.CRM_MANAGER_EMAILS||"").split(",").some(e=>e.trim().toLowerCase()===(email||"").toLowerCase());
const stamp=()=>firebaseAdmin().firestore.FieldValue.serverTimestamp();
const bad=(message,status=400)=>Object.assign(new Error(message),{status});
const hash=s=>createHash("sha256").update(s).digest("hex").slice(0,32);
const validId=s=>/^[\w-]{8,100}$/.test(s);
const iso=t=>t?.toDate?.()?.toISOString?.()||t||null;
const view=d=>{const x=d.data();return {id:d.id,...x,createdAt:iso(x.createdAt),updatedAt:iso(x.updatedAt),approvedAt:iso(x.approvedAt),lastStagedAt:iso(x.lastStagedAt)}};
const maxPage=80;
function customerQuery(database,cursor){
  let q=database.collection("patty_customers").orderBy(firebaseAdmin().firestore.FieldPath.documentId()).limit(maxPage+1);
  if(cursor)q=q.startAfter(cursor);
  return q;
}
async function getCampaign(database,id){
  if(!validId(id))throw bad("Campanha inválida");
  const doc=await database.collection("patty_campaigns").doc(id).get();
  if(!doc.exists)throw bad("Campanha não localizada",404);
  return doc;
}
export default async function handler(req,res){
 if(!["GET","POST"].includes(req.method))return send(res,405,{error:"Método não permitido"});
 try{
  const staff=await requireStaff(req);
  if(!manager(staff.email))return send(res,403,{error:"Campanhas restritas à administração do salão"});
  const database=db(),campaigns=database.collection("patty_campaigns");
  if(req.method==="GET"){
    const mode=safeText(req.query?.mode,25)||"list";
    if(mode==="connection"){
      const configured=!!(process.env.PATTY_META_ACCESS_TOKEN&&process.env.PATTY_META_PHONE_NUMBER_ID&&process.env.PATTY_META_WABA_ID&&process.env.PATTY_META_GRAPH_VERSION&&process.env.PATTY_META_APP_SECRET&&process.env.PATTY_META_WEBHOOK_VERIFY_TOKEN);
      return send(res,200,{provider:"meta_cloud_api",configured,sendingEnabled:configured&&process.env.PATTY_META_SEND_ENABLED==="true",
        note:"Prévia e preparação não enviam mensagens. Somente envio explícito por gerente, com modelo aprovado, opt-in e conexão Meta habilitada."});
    }
    if(mode==="list"){
      const snap=await campaigns.orderBy("createdAt","desc").limit(51).get();
      return send(res,200,{campaigns:snap.docs.slice(0,50).map(view),partial:snap.size>50});
    }
    if(mode==="detail"){
      const doc=await getCampaign(database,safeText(req.query?.id,100));
      return send(res,200,{campaign:view(doc)});
    }
    if(mode==="recipients"){
      const doc=await getCampaign(database,safeText(req.query?.id,100));
      const cursor=safeText(req.query?.cursor,100);
      let q=doc.ref.collection("recipients").orderBy(firebaseAdmin().firestore.FieldPath.documentId()).limit(51);
      if(cursor)q=q.startAfter(cursor);
      const snap=await q.get(),page=snap.docs.slice(0,50);
      return send(res,200,{recipients:page.map(view),nextCursor:snap.size>50?page.at(-1).id:null,partial:snap.size>50});
    }
    if(mode==="audience"){
      const segment=audienceFilters({inactiveDays:req.query?.inactiveDays,minVisits:req.query?.minVisits,
        birthdayMonth:req.query?.birthdayMonth,maxRecipients:req.query?.maxRecipients});
      const cursor=safeText(req.query?.cursor,100);
      const snap=await customerQuery(database,cursor).get(),docs=snap.docs.slice(0,maxPage);
      const unique=new Set(),eligible=[];
      for(const doc of docs){
        const row=doc.data(),phone=normalizedPhone(row.phone);
        if(!eligibleCustomer(row,segment)||unique.has(phone))continue;
        unique.add(phone);eligible.push({id:doc.id,name:row.name,phone,visits:row.visits||0,lastVisit:row.lastVisit||null,
          birthdayMonth:row.birthDate?.slice?.(5,7)||null});
      }
      return send(res,200,{audience:eligible.slice(0,25),eligibleInPage:eligible.length,scanned:docs.length,
        nextCursor:snap.size>maxPage?docs.at(-1).id:null,partial:snap.size>maxPage,
        note:"Amostra paginada de até 80 cadastros por consulta; não é o total da base. Somente clientes com consentimento documentado."});
    }
    return send(res,400,{error:"Consulta inválida"});
  }
  if(Number(req.headers?.["content-length"]||0)>15000)return send(res,413,{error:"Requisição muito grande"});
  const b=typeof req.body==="string"?JSON.parse(req.body):req.body||{},action=safeText(b.action,32);
  if(action==="create"){
    const entry=validateCampaign(b);
    const ref=campaigns.doc();
    await ref.create({...entry,stagedCount:0,acceptedCount:0,createdAt:stamp(),updatedAt:stamp(),createdBy:staff.email,
      deliveryMode:"single_explicit_manager_action",externalProviderConfigured:false});
    return send(res,201,{ok:true,id:ref.id,status:"draft",note:"Rascunho salvo. Nenhuma mensagem foi enviada."});
  }
  if(action==="stage"){
    const id=safeText(b.id,100),cursor=safeText(b.cursor,100);
    const doc=await getCampaign(database,id),config=doc.data();
    if(config.status!=="draft")return send(res,409,{error:"Prepare o público apenas enquanto a campanha é rascunho"});
    const snap=await customerQuery(database,cursor).get(),page=snap.docs.slice(0,maxPage);
    const seen=new Set(),selected=[];
    for(const customer of page){
      const data=customer.data(),phone=normalizedPhone(data.phone);
      if(!eligibleCustomer(data,config.segment)||seen.has(phone))continue;
      seen.add(phone);
      selected.push({customer,phone,ref:doc.ref.collection("recipients").doc(hash(phone))});
    }
    const out=await database.runTransaction(async tx=>{
      const latest=await tx.get(doc.ref);
      if(!latest.exists||latest.data().status!=="draft")throw bad("Campanha alterada durante a preparação",409);
      const allowed=Math.max(0,latest.data().segment.maxRecipients-(latest.data().stagedCount||0));
      const found=await Promise.all(selected.map(x=>tx.get(x.ref)));
      const verified=await Promise.all(selected.map(x=>tx.get(x.customer.ref)));
      const fresh=[];
      for(let i=0;i<selected.length;i++){
        if(found[i].exists||!eligibleCustomer(verified[i].data(),config.segment)||fresh.length>=allowed)continue;
        const c=verified[i].data(),s=selected[i];
        fresh.push({ref:s.ref,record:{customerId:s.customer.id,name:safeText(c.name,120),phone:s.phone,
          status:"staged",consentSource:c.consentSource||"",createdAt:stamp()}});
      }
      for(const entry of fresh)tx.create(entry.ref,entry.record);
      if(fresh.length)tx.update(doc.ref,{stagedCount:firebaseAdmin().firestore.FieldValue.increment(fresh.length),
        lastStagedAt:stamp(),updatedAt:stamp()});
      return {staged:fresh.length,remaining:Math.max(0,allowed-fresh.length)};
    });
    const nextCursor=snap.size>maxPage?page.at(-1).id:null;
    return send(res,200,{ok:true,...out,scanned:page.length,eligibleInPage:selected.length,
      nextCursor:out.remaining===0?null:nextCursor,finished:out.remaining===0||!nextCursor,
      note:"Destinatárias preparadas e deduplicadas, sem disparo."});
  }
  if(action==="status"){
    const id=safeText(b.id,100),status=safeText(b.status,20);
    if(!["approved","paused","cancelled"].includes(status))throw bad("Status inválido");
    const ref=campaigns.doc(id);
    await database.runTransaction(async tx=>{
      const current=await tx.get(ref);
      if(!current.exists)throw bad("Campanha não localizada",404);
      const previous=current.data().status;
      if(status==="approved"&&previous!=="draft"&&previous!=="paused")throw bad("Campanha não pode ser aprovada neste estado",409);
      if(status==="approved"&&!(current.data().stagedCount>0))throw bad("Adicione destinatárias antes de aprovar",409);
      if(status==="approved"&&b.confirm!=="CONFIRMO_PUBLICO_E_CONSENTIMENTO")throw bad("Revise o público e confirme explicitamente",400);
      if(status==="paused"&&previous!=="approved")throw bad("Somente campanhas aprovadas podem ser pausadas",409);
      if(status==="cancelled"&&!["draft","approved","paused"].includes(previous))throw bad("Campanha já encerrada",409);
      tx.update(ref,{status,updatedAt:stamp(),updatedBy:staff.email,
        ...(status==="approved"?{approvedAt:stamp(),approvedBy:staff.email}:{})});
    });
    return send(res,200,{ok:true,status,note:"Status registrado. Nenhum envio automático executado."});
  }
  if(action==="exclude"){
    const id=safeText(b.id,100),recipientId=safeText(b.recipientId,100);
    if(!validId(id)||!/^[a-f0-9]{32}$/.test(recipientId))throw bad("Destinatária inválida");
    const campaign=await getCampaign(database,id),ref=campaign.ref.collection("recipients").doc(recipientId);
    await database.runTransaction(async tx=>{
      const current=await tx.get(ref);
      if(!current.exists)throw bad("Destinatária não encontrada",404);
      if(["accepted","sent","delivered","read","sending"].includes(current.data().status))
        throw bad("Esta mensagem já está em processamento",409);
      tx.update(ref,{status:"excluded",excludedAt:stamp(),excludedBy:staff.email});
    });
    return send(res,200,{ok:true});
  }
  return send(res,400,{error:"Ação inválida"});
 }catch(e){
  if(e.status)return send(res,e.status,{error:e.message});
  if(e instanceof SyntaxError)return send(res,400,{error:"JSON inválido"});
  if(e.code===8||/RESOURCE_EXHAUSTED|Quota exceeded/i.test(e.message||""))return send(res,429,{error:"Cota Firebase atingida. Retome a preparação sem reiniciar a campanha."});
  console.error("Patty campanhas:",e.message);
  return send(res,500,{error:"Não foi possível concluir a operação de campanhas"});
 }
}
