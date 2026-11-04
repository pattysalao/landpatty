// Regras puras usadas na prévia e preparação de campanhas da Patty.
export const safeText=(value,max=200)=>typeof value==="string"?value.trim().slice(0,max):"";
export const validDate=value=>typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&
  !Number.isNaN(Date.parse(value+"T12:00:00Z"))&&new Date(value+"T12:00:00Z").toISOString().startsWith(value);
export const normalizedPhone=value=>{
  const digits=String(value||"").replace(/\D/g,"");
  const full=digits.length===10||digits.length===11?"55"+digits:digits;
  return /^55\d{10,11}$/.test(full)?full:null;
};
export function audienceFilters(raw={}){
  const days=Number(raw.inactiveDays??0),visits=Number(raw.minVisits??0),
    birthday=Number(raw.birthdayMonth??0),limit=Number(raw.maxRecipients??100);
  if(![0,30,60,90,120,180,365].includes(days)||!Number.isInteger(visits)||visits<0||visits>100||
     !Number.isInteger(birthday)||birthday<0||birthday>12||
     !Number.isInteger(limit)||limit<1||limit>500)throw Object.assign(new Error("Filtros de público inválidos"),{status:400});
  return {inactiveDays:days,minVisits:visits,birthdayMonth:birthday,maxRecipients:limit};
}
export function eligibleCustomer(customer,filters,now=new Date()){
  if(!customer||customer.marketingOptIn!==true||customer.marketingOptOut===true||
     !customer.consentRecordedAt||!normalizedPhone(customer.phone)||!safeText(customer.name,120))return false;
  if((customer.visits||0)<filters.minVisits)return false;
  if(filters.inactiveDays){
    if(!validDate(customer.lastVisit))return false;
    const threshold=new Date(now.getTime()-filters.inactiveDays*86400000).toISOString().slice(0,10);
    if(customer.lastVisit>threshold)return false;
  }
  if(filters.birthdayMonth){
    if(!validDate(customer.birthDate)||Number(customer.birthDate.slice(5,7))!==filters.birthdayMonth)return false;
  }
  return true;
}
export function validateCampaign(raw={}){
  const title=safeText(raw.title,100),templateName=safeText(raw.templateName,100),
    language=safeText(raw.language,15)||"pt_BR",bodyPreview=safeText(raw.bodyPreview,800),
    segment=audienceFilters(raw.segment||{});
  if(title.length<3||!/^[a-z0-9_]{3,100}$/.test(templateName)||
     !/^[a-z]{2}_[A-Z]{2}$/.test(language)||bodyPreview.length<10)
    throw Object.assign(new Error("Informe título, modelo aprovado da Meta, idioma e prévia da mensagem"),{status:400});
  let scheduledAt=null;
  if(raw.scheduledAt){
    const date=new Date(raw.scheduledAt);
    if(!Number.isFinite(date.getTime())||date.getTime()<Date.now()+60000||
       date.getTime()>Date.now()+90*86400000)
      throw Object.assign(new Error("Agendamento deve estar entre 1 minuto e 90 dias no futuro"),{status:400});
    scheduledAt=date.toISOString();
  }
  const useCustomerName=raw.useCustomerName===true;
  return {title,templateName,language,bodyPreview,segment,scheduledAt,useCustomerName,
    channel:"whatsapp_official",status:"draft"};
}
export function previewMessage(template,customerName){
  const name=safeText(customerName,120)||"cliente";
  return String(template||"").replace(/\{nome\}/gi,name).slice(0,800);
}
