import {db,requireStaff,firebaseAdmin,send} from "../../lib/firebase.js";
import {createHash} from "node:crypto";

const safe=(v,max=150)=>typeof v==="string"?v.trim().slice(0,max):"";
const dateOK=v=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+"T12:00:00Z"));
const timeOK=v=>typeof v==="string"&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const isManager=email=>(process.env.CRM_MANAGER_EMAILS||"").split(",").map(s=>s.trim().toLowerCase()).includes((email||"").toLowerCase());
const stamp=()=>firebaseAdmin().firestore.FieldValue.serverTimestamp();
const serial=d=>{const x=d.data();return {id:d.id,...x,createdAt:x.createdAt?.toDate?.()?.toISOString()||null,updatedAt:x.updatedAt?.toDate?.()?.toISOString()||null,recoveredAt:x.recoveredAt?.toDate?.()?.toISOString()||null};};
const defaults={name:"Patty Centro de Beleza",phone:"",timezone:"America/Sao_Paulo",openHour:9,closeHour:19,slotMinutes:15,workDays:[0,1,2,3,4,5,6],address:"",reminderHours:24};
const clipWait=x=>({clientName:safe(x.clientName,120),phone:safe(x.phone,25).replace(/\D/g,""),customerCode:safe(x.customerCode,32),service:safe(x.service,120),professional:safe(x.professional,80),date:dateOK(x.date)?x.date:null,requestedTime:timeOK(x.requestedTime)?x.requestedTime:null,flexible:x.flexible===true,notes:safe(x.notes,300)});
const kindSet=new Set(["retorno","sumidos","pos_atendimento","avaliacao","lembrete","vaga_disponivel"]);
const digest=(...parts)=>createHash("sha256").update(parts.join("|")).digest("hex").slice(0,32);
const periodStart=days=>new Date(Date.now()-days*86400000);
const DATE_FMT=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"});
const localToday=()=>{const p=DATE_FMT.formatToParts(new Date());const f=k=>p.find(x=>x.type===k)?.value;return [f("year"),f("month"),f("day")].join("-");};
export default async function handler(req,res){
 if(!["GET","POST","PATCH"].includes(req.method))return send(res,405,{error:"Método não permitido"});
 try{
  const staff=await requireStaff(req),manager=isManager(staff.email);
  const mode=safe(req.query?.mode,30);
  const dbi=db(), wait=dbi.collection("patty_waitlist"), recovery=dbi.collection("patty_recovery_events");
  if(req.method==="GET"){
   if(mode==="settings"){
    const d=await dbi.collection("patty_settings").doc("business").get();
    const x=d.exists?d.data():{};
    return send(res,200,{settings:{...defaults,...x,updatedAt:undefined},manager});
   }
   if(mode==="waitlist"){
    const date=safe(req.query?.date,10);
    let q=wait.where("status","==","waiting").limit(101);
    const snap=await q.get();
    let items=snap.docs.slice(0,100).map(serial);
    if(dateOK(date))items=items.filter(x=>!x.date||x.date===date||x.flexible);
    return send(res,200,{items,partial:snap.size>100});
   }
   if(mode==="inactive"){
    if(!manager)return send(res,403,{error:"Clientes inativos: acesso reservado à administração"});
    const days=Number(req.query?.days||60),visits=Number(req.query?.visits||1);
    if(![30,60,90,120,180,365].includes(days)||!Number.isInteger(visits)||visits<0||visits>1000)
     return send(res,400,{error:"Filtros inválidos"});
    const before=new Date(Date.now()-days*86400000).toISOString().slice(0,10);
    let q=dbi.collection("patty_customers").where("lastVisit","<=",before).orderBy("lastVisit","desc").limit(101);
    if(req.query?.cursor){const cur=await dbi.collection("patty_customers").doc(safe(req.query.cursor,100)).get();if(!cur.exists)return send(res,400,{error:"Cursor inválido"});q=q.startAfter(cur);}
    const snap=await q.get(), docs=snap.docs.slice(0,100);
    return send(res,200,{customers:docs.filter(d=>(d.data().visits||0)>=visits).map(d=>{const x=d.data();return{id:d.id,name:x.name||"",phone:x.phone||"",gendoCode:x.gendoCode||"",visits:x.visits||0,lastVisit:x.lastVisit||null,marketingOptIn:x.marketingOptIn===true};}),
      nextCursor:snap.size>100?docs.at(-1).id:null,partial:snap.size>100,periodDays:days,visitsFilter:visits,filterAppliedAfterPage:true});
   }
   if(mode==="recovery"){
    const days=[7,30,90,365].includes(Number(req.query?.days))?Number(req.query.days):30;
    // Two bounded indexed scans; only completed outcomes are revenue.
    const since=firebaseAdmin().firestore.Timestamp.fromDate(periodStart(days));
    const [contacted,success]=await Promise.all([
      recovery.where("createdAt",">=",since).limit(501).get(),
      recovery.where("recoveredAt",">=",since).limit(501).get()
    ]);
    const contacts=contacted.docs.slice(0,500).map(serial);
    const converted=success.docs.slice(0,500).map(serial).filter(x=>x.status==="recovered");
    const unique=new Map();
    converted.forEach(x=>{const key=x.customerCode||x.phone||x.customerName||x.id;if(!unique.has(key))unique.set(key,x);});
    const rows=[...unique.values()];
    return send(res,200,{days,contactsPrepared:contacts.filter(x=>x.status==="prepared"||x.status==="recovered").length,
      clientsRecovered:rows.length,realizedRevenueCents:rows.reduce((s,x)=>s+(Number.isSafeInteger(x.realizedCents)?x.realizedCents:0),0),
      withoutValue:rows.filter(x=>!Number.isSafeInteger(x.realizedCents)).length,partial:contacted.size>500||success.size>500,
      note:"Recuperação confirmada manualmente após atendimento/pagamento; links WhatsApp preparados não comprovam entrega."});
   }
   return send(res,400,{error:"Consulta não reconhecida"});
  }
  const b=typeof req.body==="string"?JSON.parse(req.body):req.body||{};
  const action=safe(b.action,30);
  if(action==="settings"){
   if(!manager)return send(res,403,{error:"Somente a administração altera a empresa"});
   const v=b.settings||{},openHour=Number(v.openHour),closeHour=Number(v.closeHour),slotMinutes=Number(v.slotMinutes);
   if(!Number.isInteger(openHour)||openHour<0||openHour>23||!Number.isInteger(closeHour)||closeHour<1||closeHour>24||closeHour<=openHour||![5,10,15,20,30,60].includes(slotMinutes))
    return send(res,400,{error:"Horários inválidos: escolha abertura 0–23h e fechamento posterior até 24h."});
   const settings={name:safe(v.name,120)||defaults.name,phone:safe(v.phone,35),address:safe(v.address,200),
    openHour,closeHour,slotMinutes,timezone:"America/Sao_Paulo",workDays:Array.isArray(v.workDays)?v.workDays.filter(n=>Number.isInteger(n)&&n>=0&&n<=6).slice(0,7):defaults.workDays,
    updatedAt:stamp(),updatedBy:staff.email};
   await dbi.collection("patty_settings").doc("business").set(settings,{merge:true});
   return send(res,200,{ok:true});
  }
  if(action==="waitlist"){
   const x=clipWait(b);
   if(x.clientName.length<2||x.service.length<2||(x.phone.length&&![10,11,12,13].includes(x.phone.length))||(!x.flexible&&!x.date))
    return send(res,400,{error:"Informe cliente, serviço e uma data ou a opção de horário flexível"});
   const ref=wait.doc();
   await ref.create({...x,status:"waiting",createdAt:stamp(),updatedAt:stamp(),createdBy:staff.email});
   return send(res,201,{ok:true,id:ref.id});
  }
  if(action==="waitlist_status"){
   const id=safe(b.id,100),status=safe(b.status,20);
   if(!/^[\w-]{8,100}$/.test(id)||!["offered","scheduled","cancelled","waiting"].includes(status))return send(res,400,{error:"Situação inválida"});
   const doc=await wait.doc(id).get();if(!doc.exists)return send(res,404,{error:"Pedido não localizado"});
   await doc.ref.update({status,updatedAt:stamp(),updatedBy:staff.email});
   return send(res,200,{ok:true});
  }
  if(action==="consent"){
   if(!manager)return send(res,403,{error:"Registro de consentimento reservado à administração"});
   const customerCode=safe(b.customerCode,32),source=safe(b.source,100),consent=b.consent===true;
   if(!/^\d{1,15}$/.test(customerCode)||!source||!["formulario","whatsapp","presencial","outro"].includes(source))
     return send(res,400,{error:"Informe código válido e origem comprovável do consentimento"});
   const ref=dbi.collection("patty_customers").doc("gendo-"+customerCode),old=await ref.get();
   if(!old.exists)return send(res,404,{error:"Cliente não localizada"});
   await ref.update({marketingOptIn:consent,consentSource:source,consentRecordedAt:stamp(),consentRecordedBy:staff.email});
   return send(res,200,{ok:true,consent});
  }
  if(action==="marketing_prepare"){
   const customerCode=safe(b.customerCode,40),phone=safe(b.phone,25).replace(/\D/g,""),customerName=safe(b.customerName,120),kind=safe(b.kind,30);
   const consent=b.marketingOptIn===true;
   if(!kindSet.has(kind)||customerName.length<2||phone.length<10||phone.length>13)return send(res,400,{error:"Dados de mensagem inválidos"});
   if(!consent&&kind!=="lembrete")return send(res,403,{error:"É necessário consentimento registrado para mensagens promocionais. Não é permitido presumir opt-in."});
   if(customerCode){
    const doc=await dbi.collection("patty_customers").doc("gendo-"+customerCode).get();
    if(!doc.exists)return send(res,404,{error:"Cliente não localizado na base"});
    if(doc.data().phone!==phone)return send(res,409,{error:"Telefone difere do cadastro atual"});
    if(kind!=="lembrete"&&doc.data().marketingOptIn!==true)return send(res,403,{error:"Cliente sem consentimento de marketing cadastrado"});
   }else if(kind!=="lembrete")return send(res,403,{error:"Marketing requer cliente identificado e consentimento registrado"});
   const token=digest(customerCode||phone,kind,new Date().toISOString().slice(0,10));
   const ref=recovery.doc(token);
   await ref.set({customerCode,phone,customerName,kind,status:"prepared",createdAt:stamp(),createdBy:staff.email,
     messageDeliveryConfirmed:false,source:"crm_prep_manual",marketingOptIn:consent},{merge:true});
   return send(res,200,{ok:true,id:token,note:"Mensagem preparada, não enviada. Abra o WhatsApp e confirme o envio manualmente."});
  }
  if(action==="mark_recovered"){
   if(!manager)return send(res,403,{error:"Confirmação financeira reservada à administração"});
   const id=safe(b.id,100),amount=b.realizedCents;
   if(!/^[a-f0-9]{32}$/.test(id)||amount!==null&&(!Number.isSafeInteger(amount)||amount<0||amount>100000000))
    return send(res,400,{error:"Registro ou valor inválido"});
   const ref=recovery.doc(id),old=await ref.get();
   if(!old.exists)return send(res,404,{error:"Contato de recuperação não encontrado"});
   if(old.data().status==="recovered")return send(res,409,{error:"Recuperação já contabilizada"});
   await ref.update({status:"recovered",realizedCents:amount,recoveredAt:stamp(),recoveredBy:staff.email,updatedAt:stamp()});
   return send(res,200,{ok:true});
  }
  return send(res,400,{error:"Ação não reconhecida"});
 }catch(e){
   if(e.status)return send(res,e.status,{error:e.message});
   if(e.code===8||/RESOURCE_EXHAUSTED|Quota exceeded/i.test(e.message||""))return send(res,429,{error:"Cota Firestore atingida"});
   console.error("Operações Patty:",e.message);
   return send(res,500,{error:"Falha na operação do CRM"});
 }
}
