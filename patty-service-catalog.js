// Pure, shared helpers for preserving the identity of similarly named services.
export function normalizeServiceCatalog(items){
  const byId=new Map();
  for(const item of items||[]){
    if(!item||item.active===false||typeof item.id!=="string"||!item.id.trim())continue;
    const name=String(item.name||"").trim();
    if(!name)continue;
    byId.set(item.id,{
      id:item.id,name,
      code:String(item.code||"").trim(),
      category:String(item.category||"").trim(),
      priceCents:Number.isSafeInteger(item.priceCents)&&item.priceCents>=0?item.priceCents:null,
      durationMin:Number.isInteger(item.durationMin)&&item.durationMin>=15&&item.durationMin<=720?item.durationMin:null
    });
  }
  return [...byId.values()];
}

export function uniqueServiceByName(catalog,name){
  const normalized=String(name||"").trim().toLocaleLowerCase("pt-BR");
  const matches=(catalog||[]).filter(row=>row.name.toLocaleLowerCase("pt-BR")===normalized);
  return matches.length===1?matches[0]:null;
}

export function serviceOptionLabel(service,catalog){
  const duplicate=(catalog||[]).filter(x=>x.name.toLocaleLowerCase("pt-BR")===service.name.toLocaleLowerCase("pt-BR")).length>1;
  const qualifiers=[];
  if(service.category)qualifiers.push(service.category);
  if(service.code)qualifiers.push("cód. "+service.code);
  if(duplicate)qualifiers.push("ref. "+service.id.slice(-6));
  if(Number.isInteger(service.durationMin))qualifiers.push(service.durationMin+" min");
  if(Number.isSafeInteger(service.priceCents))qualifiers.push((service.priceCents/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}));
  else qualifiers.push("Preço sob consulta");
  return service.name+" · "+qualifiers.join(" · ");
}

export function selectedService(catalog,value){
  return (catalog||[]).find(row=>row.id===value)||null;
}
