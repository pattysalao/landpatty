// Historical agenda is kept separately from live bookings, payments and leads.
// At most 500 source IDs share a document, reducing writes on the free plan.
export const archiveBucket = id => Math.floor(Number(id) / 500);
export function prepareAgendaRows(records, clean, schema) {
  const groups = new Map(), seen = new Set(), errors = [];
  let invalid = 0, duplicatesFile = 0;
  for (let i=0;i<records.length;i++) {
    const raw=records[i], parsed=clean(raw,schema);
    if(parsed.error || !/^\d{1,9}$/.test(parsed.item?.sourceId||'')) {
      invalid++; if(errors.length<8)errors.push({row:raw?.rowIndex??i+2,reason:parsed.error||'Código de agendamento inválido'}); continue;
    }
    const item=parsed.item, id=String(Number(item.sourceId)); item.sourceId=id;
    if(seen.has(id)){duplicatesFile++;continue;} seen.add(id);
    const bucket=archiveBucket(id); if(!groups.has(bucket))groups.set(bucket,[]);
    groups.get(bucket).push(item);
  }
  return {groups,invalid,duplicatesFile,errors};
}
export async function handleAgendaArchive(req,res,{db,admin,send,staff,clean,schema}) {
  const coll=db().collection('patty_gendo_agenda_archive');
  if(req.method==='GET') {
    const mode=String(req.query?.mode||'list');
    if(mode==='report') {
      const days={'1':1,'7':7,'30':30,'90':90,'365':365}[String(req.query?.period)]||30;
      const start=new Date(Date.now()-days*86400000).toISOString().slice(0,10);
      const snap=await coll.get(), groups=new Map();let records=0,archiveTotal=0;
      for(const doc of snap.docs){const data=doc.data();archiveTotal+=data.count||0;
        for(const item of Object.values(data.entries||{})){if(item.date<start)continue;records++;
          const label=item.status||'Não informada',g=groups.get(label)||{label,count:0,totalCents:0};g.count++;groups.set(label,g);
        }
      }
      return send(res,200,{records,archiveTotal,totalCents:null,withAmount:0,averageCents:null,groups:[...groups.values()],partial:false,
        warning:'Agenda histórica: situações preservadas do Gendo. Agendamento finalizado não comprova pagamento. Valores financeiros são conferidos separadamente.'});
    }
    if(mode!=='list')return send(res,400,{error:'Modo inválido'});
    const cursor=req.query?.cursor;
    if(cursor!==undefined&&!/^\d{1,9}$/.test(String(cursor)))return send(res,400,{error:'Página inválida'});
    let q=coll.orderBy('bucket','desc');if(cursor)q=q.startAt(archiveBucket(cursor));
    const snap=await q.limit(3).get();
    const all=snap.docs.flatMap(d=>Object.values(d.data().entries||{}))
      .filter(x=>!cursor||Number(x.sourceId)<Number(cursor)).sort((a,b)=>Number(b.sourceId)-Number(a.sourceId));
    const items=all.slice(0,80).map(x=>({...x,id:'agenda-'+x.sourceId,historical:true,origin:'gendo_agenda_archive'}));
    return send(res,200,{items,nextCursor:items.length&&(all.length>80||snap.size===3)?items.at(-1).sourceId:null});
  }
  if(req.method!=='POST')return send(res,405,{error:'Arquivo histórico disponível somente para consulta e importação'});
  if(Number(req.headers['content-length']||0)>500000)return send(res,413,{error:'Lote muito grande'});
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body||{},action=body.action||'preview';
  if(!['preview','import'].includes(action)||!Array.isArray(body.records)||!body.records.length||body.records.length>500)
    return send(res,400,{error:'Envie de 1 a 500 registros históricos por lote'});
  const prepared=prepareAgendaRows(body.records,clean,schema), pairs=[...prepared.groups];
  const refs=pairs.map(([bucket])=>coll.doc('b-'+bucket));
  const base={action,received:body.records.length,valid:pairs.reduce((s,[,items])=>s+items.length,0),invalid:prepared.invalid,
    duplicatesFile:prepared.duplicatesFile,errors:prepared.errors,existing:0,created:0};
  function plan(docs){let existing=0,created=0;const writes=[];
    pairs.forEach(([bucket,items],i)=>{const before=docs[i]?.exists?docs[i].data():{},entries={...(before.entries||{})};let changed=false;
      for(const item of items){if(Object.prototype.hasOwnProperty.call(entries,item.sourceId))existing++;
        else{entries[item.sourceId]=item;created++;changed=true;}}
      if(changed)writes.push({ref:refs[i],data:{...before,bucket,entries,count:Object.keys(entries).length}});
    });return {existing,created,writes};
  }
  if(action==='preview'){
    const docs=refs.length?await db().getAll(...refs):[],p=plan(docs);
    return send(res,200,{...base,existing:p.existing,created:p.created});
  }
  if(!refs.length)return send(res,200,base);
  const result=await db().runTransaction(async tx=>{
    const docs=await tx.getAll(...refs),p=plan(docs);
    for(const w of p.writes)tx.set(w.ref,{...w.data,importedAt:admin().firestore.FieldValue.serverTimestamp(),importedBy:staff.email,historical:true});
    return {existing:p.existing,created:p.created};
  },{maxAttempts:3});
  return send(res,201,{...base,...result});
}
