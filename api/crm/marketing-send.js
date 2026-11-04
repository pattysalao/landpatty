import {db,requireStaff,firebaseAdmin,send} from "../../lib/firebase.js";
import {createHash} from "node:crypto";
import {eligibleCustomer,normalizedPhone} from "../../lib/patty-campaign-rules.js";

const manager=email=>(process.env.CRM_MANAGER_EMAILS||"").split(",").some(e=>e.trim().toLowerCase()===(email||"").toLowerCase());
const error=(message,status=400)=>Object.assign(new Error(message),{status});
const hash=x=>createHash("sha256").update(x).digest("hex").slice(0,32);
const stamp=()=>firebaseAdmin().firestore.FieldValue.serverTimestamp();
const origin=()=>`https://graph.facebook.com/${process.env.PATTY_META_GRAPH_VERSION}`;
const authorization=()=>({Authorization:`Bearer ${process.env.PATTY_META_ACCESS_TOKEN}`});
const ready=()=>process.env.PATTY_META_SEND_ENABLED==="true"&&
  [process.env.PATTY_META_ACCESS_TOKEN,process.env.PATTY_META_PHONE_NUMBER_ID,
   process.env.PATTY_META_GRAPH_VERSION,process.env.PATTY_META_WABA_ID,
   process.env.PATTY_META_APP_SECRET,process.env.PATTY_META_WEBHOOK_VERIFY_TOKEN].every(Boolean)&&
   /^v\d{1,2}\.\d{1,2}$/.test(process.env.PATTY_META_GRAPH_VERSION);
const nowHour=()=>Number(new Intl.DateTimeFormat("en-US",{timeZone:"America/Sao_Paulo",hour:"2-digit",hourCycle:"h23"}).format(new Date()));
async function templateIsApproved(name,language){
 const url=origin()+"/"+encodeURIComponent(process.env.PATTY_META_WABA_ID)+
  "/message_templates?fields=name%2Cstatus%2Clanguage&name="+encodeURIComponent(name)+"&limit=50";
 const response=await fetch(url,{headers:authorization(),signal:AbortSignal.timeout(9000)});
 if(!response.ok)throw error("Não foi possível verificar aprovação do modelo na Meta",503);
 const payload=await response.json();
 return Array.isArray(payload.data)&&payload.data.some(x=>x.name===name&&x.language===language&&x.status==="APPROVED");
}
export default async function handler(req,res){
 if(req.method!=="POST")return send(res,405,{error:"Método não permitido"});
 try{
  const staff=await requireStaff(req);
  if(!manager(staff.email))return send(res,403,{error:"Envios restritos à administração"});
  if(!ready())return send(res,503,{error:"Envio oficial não habilitado. Configure a conta Meta e ative explicitamente o envio somente após testes autorizados."});
  if(nowHour()<9||nowHour()>=19)return send(res,409,{error:"Envios permitidos apenas das 9h às 19h, horário de Brasília"});
  const b=typeof req.body==="string"?JSON.parse(req.body):req.body||{};
  if(b.action!=="send_one"||b.confirm!=="CONFIRMO_ENVIO_REAL")return send(res,400,{error:"O envio exige confirmação explícita por destinatária"});
  const campaignId=String(b.campaignId||""),recipientId=String(b.recipientId||"");
  if(!/^[\w-]{8,100}$/.test(campaignId)||!/^[a-f0-9]{32}$/.test(recipientId))return send(res,400,{error:"Campanha ou destinatária inválida"});
  const database=db(),campaignRef=database.collection("patty_campaigns").doc(campaignId);
  const recRef=campaignRef.collection("recipients").doc(recipientId);
  const campaign=await campaignRef.get(),recipient=await recRef.get();
  if(!campaign.exists||!recipient.exists)throw error("Campanha ou destinatária não localizada",404);
  if(campaign.data().status!=="approved")throw error("Campanha não aprovada",409);
  if(campaign.data().scheduledAt&&new Date(campaign.data().scheduledAt).getTime()>Date.now())
   throw error("Data planejada da campanha ainda não chegou",409);
  if(recipient.data().status!=="staged")throw error("Destinatária já processada ou excluída",409);
  if(!await templateIsApproved(campaign.data().templateName,campaign.data().language))
    throw error("Modelo da campanha ainda não está APROVADO na conta WhatsApp da Meta",409);
  const locked=await database.runTransaction(async tx=>{
    const [currentCampaign,currentRecipient,customer]=await Promise.all([
      tx.get(campaignRef),tx.get(recRef),
      tx.get(database.collection("patty_customers").doc(recipient.data().customerId))
    ]);
    if(!currentCampaign.exists||currentCampaign.data().status!=="approved"||
       !currentRecipient.exists||currentRecipient.data().status!=="staged")
      throw error("Campanha ou destinatária alterada; atualize antes de enviar",409);
    if(currentCampaign.data().scheduledAt&&new Date(currentCampaign.data().scheduledAt).getTime()>Date.now())
      throw error("Campanha ainda não agendada para este horário",409);
    if(!customer.exists||!eligibleCustomer(customer.data(),{inactiveDays:0,minVisits:0,birthdayMonth:0},new Date())||
       normalizedPhone(customer.data().phone)!==currentRecipient.data().phone)
      throw error("Consentimento revogado ou telefone divergente. Envio bloqueado.",403);
    const phone=currentRecipient.data().phone;
    const lockRef=database.collection("patty_marketing_send_locks").doc(hash(phone));
    const lock=await tx.get(lockRef),last=lock.exists?lock.data().lastReservedAt:null;
    const lastMs=last?.toDate?.()?.getTime?.()||0;
    if(lastMs&&Date.now()-lastMs<7*86400000)
      throw error("Limite de frequência: aguarde 7 dias desde a última tentativa para este telefone",409);
    // Reserva antes da chamada externa: previne dois envios concorrentes ou retry por timeout.
    tx.set(lockRef,{lastReservedAt:stamp(),lastCampaignId:campaignId,updatedBy:staff.email},{merge:true});
    tx.update(recRef,{status:"sending",sendAttemptAt:stamp(),sendInitiatedBy:staff.email});
    return {name:currentRecipient.data().name,phone,templateName:currentCampaign.data().templateName,
      language:currentCampaign.data().language,useCustomerName:currentCampaign.data().useCustomerName===true,
      customerId:currentRecipient.data().customerId};
  });
  const template={name:locked.templateName,language:{code:locked.language}};
  if(locked.useCustomerName)template.components=[{type:"body",parameters:[{type:"text",text:String(locked.name||"cliente").slice(0,120)}]}];
  let response,payload;
  try{
    response=await fetch(origin()+"/"+encodeURIComponent(process.env.PATTY_META_PHONE_NUMBER_ID)+"/messages",{
      method:"POST",headers:{...authorization(),"Content-Type":"application/json"},
      body:JSON.stringify({messaging_product:"whatsapp",recipient_type:"individual",to:locked.phone,type:"template",template}),
      signal:AbortSignal.timeout(10000)
    });
    payload=await response.json().catch(()=>({}));
  }catch(e){
    await recRef.update({status:"unknown",sendError:"Resposta da Meta não confirmada. Não reenviar automaticamente.",updatedAt:stamp()});
    return send(res,502,{error:"Envio com resultado incerto. Verifique no WhatsApp Manager antes de qualquer nova tentativa."});
  }
  const wamid=response.ok&&typeof payload.messages?.[0]?.id==="string"?payload.messages[0].id:null;
  if(!wamid){
    const code=typeof payload.error?.code==="number"?payload.error.code:null;
    await recRef.update({status:"failed",sendError:"Meta rejeitou a requisição",metaErrorCode:code,updatedAt:stamp()});
    return send(res,502,{error:"A Meta rejeitou este modelo ou destinatária. Consulte o WhatsApp Manager; nenhuma repetição automática."});
  }
  const messageId=hash(wamid);
  const batch=database.batch();
  batch.update(recRef,{status:"accepted",wamid,messageAcceptedAt:stamp(),updatedAt:stamp()});
  batch.set(database.collection("patty_whatsapp_message_index").doc(messageId),
    {campaignId,recipientId,customerId:locked.customerId,createdAt:stamp()});
  batch.update(campaignRef,{acceptedCount:firebaseAdmin().firestore.FieldValue.increment(1),updatedAt:stamp()});
  await batch.commit();
  return send(res,200,{ok:true,status:"accepted",wamid,note:"Aceita pela Meta, ainda não confirmada como entregue. Aguarde webhook."});
 }catch(e){
  if(e.status)return send(res,e.status,{error:e.message});
  if(e.code===8||/RESOURCE_EXHAUSTED|Quota exceeded/i.test(e.message||""))
    return send(res,429,{error:"Cota Firebase atingida. O envio pode estar incerto; confira o registro antes de repetir."});
  console.error("Campanha WhatsApp Meta Patty:",e.message);
  return send(res,500,{error:"Falha no envio. Verifique o status antes de uma nova tentativa."});
 }
}
