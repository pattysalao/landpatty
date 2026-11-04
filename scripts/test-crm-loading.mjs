import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const agenda=readFileSync('crm-agenda.html','utf8');
const modules=readFileSync('crm-modulos.html','utf8');
const sourceBetween=(text,a,b)=>text.slice(text.indexOf(a),text.indexOf(b,text.indexOf(a)));
function harness(extra={}){
 const elements=new Map(),pending=[];
 const $=id=>{if(!elements.has(id))elements.set(id,{value:'',innerHTML:'',textContent:'',disabled:false,classList:{toggle(){}}});return elements.get(id)};
 const api=url=>new Promise((resolve,reject)=>pending.push({url,resolve,reject}));
 const context=vm.createContext({$,api,request:api,encodeURIComponent,...extra});
 return {context,$,pending,run:code=>vm.runInContext(code,context)};
}
{
 const h=harness();h.$('date').value='2026-11-03';
 h.run('let canUse=true,rows=[]; function show(){$("calendar").innerHTML=rows.map(x=>x.name).join();}');
 h.run(sourceBetween(agenda,'let agendaRequest=0;','\nasync function suggestWait'));
 const old=h.run('load()');h.$('date').value='2026-11-04';const current=h.run('load()');
 h.pending[1].resolve({appointments:[{name:'dia correto'}]});await current;
 h.pending[0].resolve({appointments:[{name:'dia antigo'}]});await old;
 assert.equal(h.$('calendar').innerHTML,'dia correto');
 const failure=h.run('load()');assert.equal(h.$('calendar').innerHTML,'');
 h.pending[2].reject(Error('Sem conexão'));await failure;
 assert.equal(h.$('status').textContent,'Sem conexão');
}
{
 const h=harness();
 h.run('let allPros=[],catalogServices=[],companySettings={};function fillCatalog(){};const normalizeServiceCatalog=items=>items.filter(x=>x.active!==false);');
 h.run(sourceBetween(agenda,'async function catalogPages','\nfunction hourSlot'));
 const work=h.run('catalogs()');
 const prof=h.pending.find(x=>x.url.endsWith('profissionais'));
 const services=h.pending.find(x=>x.url.endsWith('servicos'));
 assert.ok(prof&&services);
 prof.resolve({items:[{id:'p1',name:'A',active:true}],nextCursor:null});
 services.resolve({items:[{id:'s1',name:'Mechas',durationMin:60,priceCents:10000}],nextCursor:'second'});
 await new Promise(resolve=>setImmediate(resolve));
 const page2=h.pending.find(x=>x.url.includes('cursor=second'));
 assert.ok(page2,'The service catalog must paginate');
 page2.resolve({items:[{id:'s2',name:'Mechas',durationMin:90,priceCents:20000},{id:'s3',name:'Inativo',active:false}],nextCursor:null});
 await new Promise(resolve=>setImmediate(resolve));
 const settings=h.pending.find(x=>x.url.includes('mode=settings'));
 if(settings)settings.resolve({settings:{}});
 await work;
 assert.equal(h.run('catalogServices.length'),2);
 assert.equal(h.run('catalogServices[0].id'),'s1');
 assert.equal(h.run('catalogServices[1].id'),'s2');
 assert.equal(h.run('catalogServices[1].durationMin'),90);
 assert.equal(h.run('allPros.length'),1);
}

{
 const h=harness();h.run('let module="servicos",rows=[],cursor=null;function renderTable(){$("table").innerHTML=rows.map(x=>x.name).join();}');
 h.run(sourceBetween(modules,'let moduleRequest=0;','\nfunction renderTable'));
 const old=h.run('load(true)');h.run('module="produtos"');const next=h.run('load(true)');
 h.pending[1].resolve({items:[{name:'Produto'}],nextCursor:null});await next;
 h.pending[0].resolve({items:[{name:'Serviço'}],nextCursor:null});await old;
 assert.equal(h.$('table').innerHTML,'Produto');assert.equal(h.$('more').disabled,false);
}
{
 let code=readFileSync('lib/firebase.js','utf8').replace('import admin from "firebase-admin";','').replaceAll('export ','');
 const mock={apps:[{}],auth:()=>({verifyIdToken:async()=>{throw Object.assign(Error('expired'),{code:'auth/id-token-expired'})}})};
 const ctx=vm.createContext({admin:mock,process:{env:{}}});vm.runInContext(code,ctx);
 await assert.rejects(vm.runInContext('requireStaff({headers:{authorization:"Bearer expired"}})',ctx),e=>e.status===401);
}
console.log('CRM regressions passed: out-of-order agenda/modules, stale error clearing, full catalog with exact service IDs, expired session.');
