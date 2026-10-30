import { createHash } from "node:crypto";
import { db, firebaseAdmin, requireStaff, send } from "../../lib/firebase.js";

const statuses = new Set(["agendado","confirmado","chegou","em_atendimento","finalizado","cancelado","faltou"]);
const dateValid = v => typeof v==="string" && /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !Number.isNaN(Date.parse(v+"T12:00:00Z")) && new Date(v+"T12:00:00Z").toISOString().startsWith(v);
const timeValid = v => typeof v==="string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const str=(v,n=100)=>typeof v==="string"?v.trim().slice(0,n):"";
const minute=t=>Number(t.slice(0,2))*60+Number(t.slice(3,5));
const shape=d=>{const x=d.data();return {id:d.id,recordType:x.recordType||"appointment",
  customerCode:x.customerCode||"",name:x.name||"",phone:x.phone||"",service:x.service||"",
  professional:x.professional||"",date:x.date||"",appointmentTime:x.appointmentTime||"",
  durationMin:x.durationMin||60,status:x.status||"agendado",notes:x.notes||"",
  source:x.source||"crm",createdAt:x.createdAt?.toDate?.()?.toISOString()||null};};
const sendError=(res,e)=>{
 if(e?.status)return send(res,e.status,{error:e.message});
 if(e?.code===8||/RESOURCE_EXHAUSTED|Quota exceeded/i.test(e?.message||""))
  return send(res,429,{error:"Cota gratuita do Firestore esgotada. Dados existentes foram preservados. Tente novamente após a renovação da cota."});
 console.error("Erro agendamento Patty:",e?.message);
 return send(res,500,{error:"Não foi possível salvar ou consultar a agenda"});
};
export default async function handler(req,res){
 if(!["GET","POST","PATCH"].includes(req.method))return send(res,405,{error:"Método não permitido"});
 try{
  const staff=await requireStaff(req);
  const coll=db().collection("patty_appointments");
  if(req.method==="GET"){
   const date=str(req.query?.date,10);
   if(!dateValid(date))return send(res,400,{error:"Informe uma data válida"});
   const snap=await coll.where("date","==",date).limit(401).get();
   return send(res,200,{appointments:snap.docs.slice(0,400).map(shape),partial:snap.size>400,
     notice:"Agendamentos registrados no CRM; não há sincronização com o Gendo."});
  }
  if(req.method==="POST"){
   const b=typeof req.body==="string"?JSON.parse(req.body):req.body||{};
   const recordType=b.recordType==="block"?"block":"appointment";
   const date=str(b.date,10),appointmentTime=str(b.appointmentTime,5);
   const professional=str(b.professional,80),durationMin=Number(b.durationMin);
   const name=str(b.name,120),service=str(b.service,120),phone=str(b.phone,30).replace(/\D/g,"");
   const customerCode=str(b.customerCode,32),notes=str(b.notes,500);
   if(!dateValid(date)||!timeValid(appointmentTime)||professional.length<2||
      !Number.isInteger(durationMin)||durationMin<15||durationMin>300||
      minute(appointmentTime)<9*60||minute(appointmentTime)+durationMin>19*60)
     return send(res,400,{error:"Confira profissional, data, horário entre 9h e 19h e duração (15–300 min)."});
   if(recordType==="appointment"&&(name.length<2||service.length<2))
     return send(res,400,{error:"Informe o nome da cliente e o serviço."});
   if(phone&&(phone.length<10||phone.length>13))
     return send(res,400,{error:"Telefone inválido. Deixe em branco se não estiver disponível."});
   const refCode=createHash("sha256").update(professional.toLocaleLowerCase("pt-BR")).digest("hex").slice(0,14);
   const key="appt-"+date.replace(/-/g,"")+"-"+refCode+"-"+appointmentTime.replace(":","");
   const before=await coll.where("date","==",date).limit(401).get();
   if(before.size>400)return send(res,409,{error:"Agenda com muitos registros para verificar disponibilidade."});
   const start=minute(appointmentTime),end=start+durationMin;
   const occupied=before.docs.some(doc=>{
     const x=doc.data();
     if(x.professional?.toLocaleLowerCase("pt-BR")!==professional.toLocaleLowerCase("pt-BR")
       ||x.status==="cancelado"||!timeValid(x.appointmentTime))return false;
     const otherStart=minute(x.appointmentTime);
     return start<otherStart+(Number(x.durationMin)||60) && end>otherStart;
   });
   if(occupied)return send(res,409,{error:"Horário ocupado ou bloqueado nessa agenda. Escolha outro horário."});
   const now=firebaseAdmin().firestore.FieldValue.serverTimestamp();
   try{
    await coll.doc(key).create({recordType,name:recordType==="block"?"Horário bloqueado":name,
      service:recordType==="block"?"Bloqueio":service,professional,date,appointmentTime,durationMin,
      status:recordType==="block"?"bloqueio":"agendado",phone:recordType==="block"?"":phone,
      customerCode:recordType==="block"?"":customerCode,notes,source:"crm",
      marketingOptIn:false,createdAt:now,updatedAt:now,createdBy:staff.email,
      history:[{at:new Date(),by:staff.email,status:recordType==="block"?"bloqueio":"agendado"}]});
   }catch(e){
     if(e.code===6||e.code==="already-exists")return send(res,409,{error:"Já existe um horário registrado nesse início. Se foi cancelado, crie no próximo horário ou peça a liberação."});
     throw e;
   }
   return send(res,201,{ok:true,id:key,recordType});
  }
  const b=typeof req.body==="string"?JSON.parse(req.body):req.body||{};
  const id=str(b.id,100),status=str(b.status,30);
  if(!/^appt-\d{8}-[a-f0-9]{14}-\d{4}$/.test(id))
    return send(res,400,{error:"Identificador de agenda inválido."});
  if(!statuses.has(status)&&status!=="liberado")return send(res,400,{error:"Situação inválida."});
  const doc=await coll.doc(id).get();
  if(!doc.exists)return send(res,404,{error:"Agendamento não encontrado."});
  const previous=doc.data();
  if(previous.recordType==="block"&&status!=="liberado")return send(res,400,{error:"Use Liberar para remover o bloqueio."});
  if(previous.recordType!=="block"&&status==="liberado")return send(res,400,{error:"Não é possível liberar um atendimento."});
  await coll.doc(id).update({status:status==="liberado"?"cancelado":status,
    updatedBy:staff.email,updatedAt:firebaseAdmin().firestore.FieldValue.serverTimestamp(),
    history:firebaseAdmin().firestore.FieldValue.arrayUnion({at:new Date(),by:staff.email,status})});
  return send(res,200,{ok:true,id,status});
 }catch(e){return sendError(res,e)}
}
