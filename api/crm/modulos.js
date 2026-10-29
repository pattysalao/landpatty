import { createHash } from 'node:crypto';
import { db, firebaseAdmin, requireStaff, send } from '../../lib/firebase.js';

// Histórico Gendo é separado dos leads e do faturamento novo da Patty.
const S = {
  servicos: { label:'Serviços e preços',fields:{
    code:['Código Gendo','text'],name:['Serviço','text',true],category:['Categoria','text'],
    priceCents:['Preço (R$)','money'],durationMin:['Duração (min)','int'],active:['Ativo','bool'],
    description:['Descrição','text']},manager:false},
  profissionais: {label:'Profissionais',fields:{
    code:['Código Gendo','text'],name:['Profissional','text',true],specialty:['Especialidade','text'],
    active:['Ativo','bool'],schedule:['Expediente / observações','text'],
    commissionPercent:['Comissão %','decimal']},manager:false},
  atendimentos: {label:'Atendimentos realizados',fields:{
    sourceId:['Código do atendimento','text'],date:['Data','date',true],
    customerCode:['Código cliente','text'],customerName:['Cliente','text'],
    service:['Serviço','text',true],professional:['Profissional','text'],status:['Status','text'],
    amountCents:['Valor do serviço (R$)','money'],notes:['Observações','text']},manager:true},
  financeiro_clientes: {label:'Financeiro por cliente',fields:{
    sourceId:['Código do registro','text'],date:['Data','date',true],
    customerCode:['Código cliente','text'],customerName:['Cliente','text'],type:['Tipo','text'],
    amountCents:['Valor (R$)','money'],balanceCents:['Saldo (R$)','money'],
    description:['Descrição','text']},manager:true},
  faturamento: {label:'Faturamento / caixa',fields:{
    sourceId:['Código movimento','text'],date:['Data','date',true],type:['Tipo','text'],
    category:['Categoria','text'],amountCents:['Valor bruto (R$)','money',true],
    netCents:['Valor líquido (R$)','money'],paymentMethod:['Forma de pagamento','text'],
    description:['Descrição','text']},manager:true},
  ticket_clientes: {label:'Ticket médio por cliente (legado)',fields:{
    sourceId:['Código relatório','text'],customerCode:['Código cliente','text'],
    customerName:['Cliente','text',true],period:['Período','text'],visits:['Atendimentos','int'],
    totalCents:['Total faturado (R$)','money'],averageCents:['Ticket médio (R$)','money']},manager:true},
  comissoes: {label:'Comissões por profissional',fields:{
    sourceId:['Código comissão','text'],date:['Data','date',true],
    professional:['Profissional','text',true],service:['Serviço','text'],
    customerCode:['Código cliente','text'],grossCents:['Base (R$)','money'],
    commissionCents:['Comissão (R$)','money'],status:['Situação','text']},manager:true},
  produtos: {label:'Produtos e preços',fields:{
    code:['Código/SKU','text'],name:['Produto','text',true],category:['Categoria','text'],
    saleCents:['Preço de venda (R$)','money'],costCents:['Custo (R$)','money'],
    stockQty:['Saldo em estoque','decimal'],active:['Ativo','bool']},manager:true},
  estoque: {label:'Movimentações de estoque',fields:{
    sourceId:['Código movimento','text'],date:['Data','date',true],
    productCode:['Código produto','text'],productName:['Produto','text',true],
    type:['Tipo movimento','text'],quantity:['Quantidade','decimal',true],
    unitCostCents:['Custo unitário (R$)','money'],notes:['Observações','text']},manager:true}
};
const get=(s,max=160)=>typeof s==='string'?s.trim().slice(0,max):'';
const EMAILS=()=>(process.env.CRM_MANAGER_EMAILS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
const dateValid=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&
  !Number.isNaN(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().startsWith(v);
const hash=s=>createHash('sha256').update(s).digest('hex').slice(0,40);
const types={
  text:v=>get(String(v??''),250),
  date:v=>dateValid(v)?v:null,
  money:v=>v===null||v===''||v===undefined?null:Number.isSafeInteger(v)&&Math.abs(v)<=1e12?v:NaN,
  int:v=>v===null||v===''||v===undefined?null:Number.isSafeInteger(v)&&Math.abs(v)<=1e8?v:NaN,
  decimal:v=>v===null||v===''||v===undefined?null:typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1e8?Math.round(v*10000)/10000:NaN,
  bool:v=>v===true||v==='true'||v===1||v==='1'?true:v===false||v==='false'||v===0||v==='0'?false:null
};
function clean(raw,config) {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return {error:'Registro inválido'};
  const item={};
  for(const [key,def] of Object.entries(config.fields)){
    const value=types[def[1]](raw[key]);
    if(typeof value==='number'&&Number.isNaN(value))return {error:'Formato inválido em '+key};
    if(def[2]&&(value===null||value===''))return {error:'Campo obrigatório: '+key};
    if(value!==null&&value!=='')item[key]=value;
  }
  return {item};
}
function getDocId(module,item,raw,ordinal){
  const reference=get(raw.legacyId||item.sourceId||item.code,100);
  return 'g-'+hash(module+'|'+(reference?'id:'+reference:'row:'+String(raw.rowIndex??ordinal)+'|'+JSON.stringify(item)));
}
function publicSchema(){return Object.fromEntries(Object.entries(S).map(([key,x])=>[key,{label:x.label,manager:x.manager,fields:x.fields}]))}
async function authenticated(req,module){
  const staff=await requireStaff(req);
  const isManager=EMAILS().includes((staff.email||'').toLowerCase());
  if(module&&S[module].manager&&!isManager){const e=new Error('Acesso reservado à administração');e.status=403;throw e}
  return {staff,isManager};
}
const collection=module=>db().collection('patty_module_'+module);
const toItem=d=>{const x=d.data();return {id:d.id,...x,
  createdAt:x.createdAt?.toDate?.()?.toISOString()||null,
  updatedAt:x.updatedAt?.toDate?.()?.toISOString()||null,
  importedAt:x.importedAt?.toDate?.()?.toISOString()||null}};
export default async function handler(req,res){
  if(!['GET','POST','PATCH'].includes(req.method))return send(res,405,{error:'Método não permitido'});
  try {
    const module=get(req.query?.module,40);
    if(module&&!Object.prototype.hasOwnProperty.call(S,module))return send(res,400,{error:'Módulo não reconhecido'});
    const {staff,isManager}=await authenticated(req,module);
    if(req.method==='GET'&&!module)return send(res,200,{modules:publicSchema(),isManager});
    if(!module)return send(res,400,{error:'Escolha um módulo'});
    const coll=collection(module);
    if(req.method==='GET'){
      const mode=get(req.query?.mode,20)||'list';
      if(mode==='report'){
        if(!isManager)return send(res,403,{error:'Indicadores financeiros restritos'});
        const period=get(req.query?.period,20)||'30';
        const days=period==='365'?365:period==='90'?90:period==='7'?7:period==='1'?1:30;
        const start=new Date(Date.now()-days*86400000).toISOString().slice(0,10);
        const dateBased=['atendimentos','financeiro_clientes','faturamento','comissoes','estoque'].includes(module);
        const query=dateBased?coll.where('date','>=',start).orderBy('date','desc').limit(1001):
          coll.orderBy('createdAt','desc').limit(1001);
        const snap=await query.get(),data=snap.docs.slice(0,1000).map(d=>d.data());
        const groups=new Map();let totalCents=0,withAmount=0;
        const moneyKey={atendimentos:'amountCents',financeiro_clientes:'amountCents',
          faturamento:'amountCents',comissoes:'commissionCents',ticket_clientes:'averageCents',
          produtos:'saleCents',servicos:'priceCents',estoque:'unitCostCents'}[module];
        const groupKey={atendimentos:'professional',financeiro_clientes:'customerCode',
          faturamento:'category',comissoes:'professional',ticket_clientes:'customerCode',
          estoque:'productName',produtos:'category',servicos:'category',
          profissionais:'specialty'}[module];
        for(const row of data){
          const key=get(row[groupKey]||'Sem categoria',70)||'Sem categoria';
          const entry=groups.get(key)||{label:key,count:0,totalCents:0,withAmount:0};
          entry.count++;
          if(moneyKey&&Number.isSafeInteger(row[moneyKey])){
            entry.totalCents+=row[moneyKey];entry.withAmount++;
            totalCents+=row[moneyKey];withAmount++;
          }
          groups.set(key,entry);
        }
        return send(res,200,{module,periodDays:days,records:data.length,
          partial:snap.size>1000,totalCents,withAmount,
          averageCents:withAmount?Math.round(totalCents/withAmount):null,
          groups:[...groups.values()].sort((a,b)=>b.totalCents-a.totalCents).slice(0,25),
          warning:'Valores do módulo selecionado. Importações históricas não representam receita nova e não devem ser somadas entre módulos.'});
      }
      if(mode!=='list')return send(res,400,{error:'Modo inválido'});
      const limit=80;
      let q=coll.orderBy('createdAt','desc').limit(limit);
      if(req.query.cursor){
        const doc=await coll.doc(get(req.query.cursor,80)).get();
        if(!doc.exists)return send(res,400,{error:'Página inválida'});
        q=q.startAfter(doc);
      }
      const snap=await q.get();
      return send(res,200,{items:snap.docs.map(toItem).map(x=>{
        if(module==='profissionais'&&!isManager)delete x.commissionPercent;
        return x;
      }),nextCursor:snap.size===limit?snap.docs[snap.docs.length-1].id:null});
    }
    if(!isManager)return send(res,403,{error:'Alterações reservadas à administração'});
    if(Number(req.headers['content-length']||0)>120000)return send(res,413,{error:'Lote muito grande'});
    const body=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
    const action=get(body.action,20)||'preview';
    if(req.method==='POST'&&['preview','import'].includes(action)){
      if(!Array.isArray(body.records)||!body.records.length||body.records.length>50)
        return send(res,400,{error:'Lote deve conter de 1 a 50 registros'});
      const candidates=[],seen=new Set();let invalid=0,duplicatesFile=0;const errors=[];
      for(let i=0;i<body.records.length;i++){
        const raw=body.records[i],parsed=clean(raw,S[module]);
        if(parsed.error){
          invalid++;
          if(errors.length<8)errors.push({row:raw?.rowIndex??i,reason:parsed.error});
          continue;
        }
        const id=getDocId(module,parsed.item,raw,i);
        if(seen.has(id)){duplicatesFile++;continue}
        seen.add(id);candidates.push({id,item:parsed.item});
      }
      const existingDocs=candidates.length?await db().getAll(...candidates.map(x=>coll.doc(x.id))):[];
      const fresh=candidates.filter((x,i)=>!existingDocs[i].exists);
      const result={action,received:body.records.length,valid:candidates.length,invalid,duplicatesFile,
        existing:existingDocs.length-fresh.length,created:action==='preview'?fresh.length:0,errors};
      if(action==='preview')return send(res,200,result);
      if(fresh.length){
        const batch=db().batch(),timestamp=firebaseAdmin().firestore.FieldValue.serverTimestamp();
        for(const {id,item} of fresh)batch.create(coll.doc(id),{...item,
          origin:'gendo_import',historical:true,marketingOptIn:false,
          createdAt:timestamp,updatedAt:timestamp,importedAt:timestamp,importedBy:staff.email});
        try{await batch.commit();result.created=fresh.length}
        catch(e){console.error('Falha no lote de importação',module,e.message);
          return send(res,409,{error:'Conflito ao gravar o lote. Atualize a prévia.'})}
      }
      return send(res,201,result);
    }
    if(req.method==='POST'&&action==='create'){
      const parsed=clean(body.item,S[module]);
      if(parsed.error)return send(res,400,{error:parsed.error});
      const now=firebaseAdmin().firestore.FieldValue.serverTimestamp(),ref=coll.doc();
      await ref.create({...parsed.item,origin:'cadastro_manual',historical:false,
        marketingOptIn:false,createdAt:now,updatedAt:now,createdBy:staff.email});
      return send(res,201,{ok:true,id:ref.id});
    }
    if(req.method==='PATCH'){
      const id=get(body.id,80);
      if(!/^[\w-]{6,80}$/.test(id))return send(res,400,{error:'ID inválido'});
      const before=await coll.doc(id).get();
      if(!before.exists)return send(res,404,{error:'Registro inexistente'});
      const parsed=clean({...before.data(),...(body.item||{})},S[module]);
      if(parsed.error)return send(res,400,{error:parsed.error});
      await coll.doc(id).update({...parsed.item,
        updatedAt:firebaseAdmin().firestore.FieldValue.serverTimestamp(),updatedBy:staff.email});
      return send(res,200,{ok:true,id});
    }
    return send(res,400,{error:'Operação não suportada'});
  }catch(e){
    if(e.status)return send(res,e.status,{error:e.message});
    if(e instanceof SyntaxError)return send(res,400,{error:'JSON inválido'});
    console.error('Erro em módulo operacional:',e.message);
    return send(res,500,{error:'Falha no módulo operacional'});
  }
}