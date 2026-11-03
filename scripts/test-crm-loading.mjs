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
 h.run(sourceBetween(agenda,'let agendaRequest=0;','\nfunction openForm'));
 const old=h.run('load()');h.$('date').value='2026-11-04';const current=h.run('load()');
 h.pending[1].resolve({appointments:[{name:'dia correto'}]});await current;
 h.pending[0].resolve({appointments:[{name:'dia antigo'}]});await old;
 assert.equal(h.$('calendar').innerHTML,'dia correto');
 const failure=h.run('load()');assert.equal(h.$('calendar').innerHTML,'');
 h.pending[2].reject(Error('Sem conexão'));await failure;
 assert.equal(h.$('status').textContent,'Sem conexão');
}
{
 const h=harness();h.run('let allPros=[],allServices=[],serviceDurations={};function fillCatalog(){}');
 h.run(sourceBetween(agenda,'async function catalogItems','\nfunction hourSlot'));
 const work=h.run('catalogs()');
 h.pending.find(x=>x.url.endsWith('profissionais')).resolve({items:[{name:'A',active:true}],nextCursor:null});
 h.pending.find(x=>x.url.endsWith('servicos')).resolve({items:[{name:'Corte',durationMin:30},{name:'Mechas',durationMin:60}],nextCursor:'second'});
 await new Promise(resolve=>setImmediate(resolve));
 h.pending.find(x=>x.url.includes('cursor=second')).resolve({items:[{name:'Mechas',durationMin:90},{name:'Última página',durationMin:45},{name:'Inativo',active:false}],nextCursor:null});
 await work;
 assert.equal(h.run('allServices.includes("Última página")'),true);
 assert.equal(h.run('allServices.includes("Inativo")'),false);
 assert.equal(h.run('serviceDurations.Mechas'),undefined);
 assert.equal(h.run('serviceDurations.Corte'),30);
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
console.log('CRM regressions passed: out-of-order agenda/modules, stale error clearing, full catalog, ambiguous service durations, expired session.');
