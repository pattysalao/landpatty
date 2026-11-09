import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const html=readFileSync("index.html","utf8");
function section(start,end){
  const first=html.indexOf(start),last=html.indexOf(end,first);
  assert.ok(first>=0&&last>first,"Missing form script boundary: "+start);
  return html.slice(first,last);
}
const helper=section("function registrarFormularioConfirmado(", "\n        // Os cliques nos botões");
assert.match(helper,/resultado\?\.created !== true/);
const capture=section("capturaForm.addEventListener('submit'", "\n        // Captura links wa.me");
const hero=section("agendamentoForm.addEventListener('submit'", "\n            let lastScrollTop");

function harness(form,answer={ok:true,created:true},httpOk=true){
  const events=[],calls=[],elements=new Map(),state={};
  const element=id=>{
    if(!elements.has(id))elements.set(id,{value:"",textContent:"",checked:true,disabled:false});
    return elements.get(id);
  };
  element("nome").value="Ana";
  element("servico").value="Cabelos e Cachos";
  element("whatsapp").value="48999999999";
  element("patty-capture-name").value="Ana";
  element("patty-capture-phone").value="48999999999";
  element("patty-capture-service-pick").value="Cabelos e Cachos";
  const button={disabled:false};
  const formElement={reportValidity:()=>true,querySelector:()=>button,
    addEventListener:(type,callback)=>{assert.equal(type,"submit");state.submit=callback}};
  const blankTab={closed:false,document:{body:{textContent:""}},location:{href:""}};
  const ctx={
    document:{getElementById:element},window:{open:()=>blankTab,location:{assign:()=>{}}},
    capturaForm:formElement,agendamentoForm:formElement,
    pattyServicoPendente:{ref:"PTY-0123456789",serviceName:"Cabelos e Cachos",area:"servicos",url:"https://wa.me/55"},
    normalizarServicoPatty:()=> "Cabelos e Cachos",
    pattyPreferencia:()=>({}),pattyCampanha:()=>({}),
    pattyReferencia:()=> "PTY-0123456789",
    pattyTextoPreferencia:()=>"",pattyOrigemContato:()=> "Site Patty",
    fecharCapturaServico:()=>{},
    registrarCliqueWhatsApp:()=> events.push({name:"whatsapp_click"}),
    abrirWhatsAppCaptura:()=> events.push({name:"whatsapp_click"}),
    pattyEvento:(name,params)=> events.push({name,params}),
    fetch:async (url,opts)=>{calls.push({url,opts});return {ok:httpOk,json:async()=>answer}},
    URL,JSON,Error,String,encodeURIComponent
  };
  vm.runInNewContext(helper+(form==="hero"?hero:capture),ctx);
  return {events,calls,button,run:()=>state.submit({preventDefault(){}})};
}
for(const form of ["capture","hero"]){
  const success=harness(form);
  await success.run();
  const completed=success.events.filter(x=>x.name==="form_submit");
  assert.equal(completed.length,1,form+" must emit exactly one form_submit for new CRM lead");
  assert.equal(completed[0].params.form_name,form==="hero"?"agendamento_hero":"captura_servico");
  assert.equal(success.events.filter(x=>x.name==="crm_lead_saved").length,1);
  assert.equal(success.events.filter(x=>x.name==="whatsapp_click").length,1);
  assert.equal(success.calls.length,1);
  assert.equal(success.calls[0].url,"/api/leads");
  assert.equal(success.button.disabled,false);
  assert.deepEqual(Object.keys(completed[0].params).sort(),
    ["form_id","form_name","form_service","lead_source"].sort(),"No personal details or identifiers in form_submit");
  const duplicate=harness(form,{ok:true,created:false});
  await duplicate.run();
  assert.equal(duplicate.events.filter(x=>x.name==="form_submit").length,0,"Duplicate CRM lead is not a new conversion");
  assert.equal(duplicate.events.filter(x=>x.name==="crm_lead_saved").length,0);
  assert.equal(duplicate.events.filter(x=>x.name==="whatsapp_click").length,1,"WhatsApp remains accessible on duplicate");
  const failure=harness(form,{ok:false,error:"CRM unavailable"},false);
  await failure.run();
  assert.equal(failure.events.filter(x=>x.name==="form_submit").length,0,"Failed CRM capture must not be counted");
  assert.equal(failure.events.filter(x=>x.name==="crm_capture_failed").length,1);
  assert.equal(failure.events.filter(x=>x.name==="whatsapp_click").length,1,"WhatsApp remains accessible on CRM error");
}
const intent=hero.indexOf("pattyEvento('form_agendamento_submit'");
const fetchIndex=hero.indexOf("await fetch('/api/leads'");
assert.ok(intent>=0&&intent<fetchIndex,"Legacy attempt event remains separate from confirmed form_submit");
assert.ok(html.includes("GTM-NKZC9T42"),"Existing GTM container must remain unchanged");

const routingScript=section("document.addEventListener('click', (evt) => {", "\n        function loadDeferredGTM()");
function testWhatsAppRoute(kind,ctrlKey=false){
  const events=[],state={};
  const service=kind==="servicos"?{querySelector:()=>({textContent:"Cabelos & Cachos"})}:null;
  const team=kind==="equipe"?{querySelector:()=>({textContent:"Profissional"})}:null;
  const link={
    href:"https://wa.me/5548988032478?text=Ola",
    dataset:{},
    classList:{contains:name=>kind==="flutuante"&&name==="whatsapp-float"},
    closest:selector=>selector===".service-card"?service:selector===".team-card"?team:null
  };
  class FakeElement{closest(selector){return selector==="a[href]"?link:null}}
  const context={
    Element:FakeElement,URL,
    window:{location:{href:"https://www.pattycentrodebeleza.com.br/"}},
    document:{addEventListener:(type,callback)=>{assert.equal(type,"click");state.click=callback}},
    pattyReferencia:()=>"PTY-0123456789",
    pattyOrigemContato:()=>"Site Patty",
    pattyEvento:name=>events.push(name),
    registrarCliqueWhatsApp:()=>events.push("whatsapp_click"),
    abrirCapturaServico:()=>events.push("modal_open")
  };
  vm.runInNewContext(routingScript,context);
  state.click({
    target:new FakeElement(),button:0,ctrlKey,metaKey:false,shiftKey:false,altKey:false,
    preventDefault:()=>{state.prevented=true}
  });
  return {events,prevented:state.prevented===true,href:link.href};
}
for(const kind of ["geral","equipe","flutuante"]){
  const actual=testWhatsAppRoute(kind);
  assert.deepEqual(actual.events,["whatsapp_click"],kind+" must lead directly to WhatsApp");
  assert.equal(actual.prevented,false,kind+" cannot force capture modal");
  assert.ok(actual.href.includes("Ref.+atendimento"),"WhatsApp link must keep its reference");
}
const serviceRoute=testWhatsAppRoute("servicos");
assert.deepEqual(serviceRoute.events,["whatsapp_cta_open","modal_open"]);
assert.equal(serviceRoute.prevented,true,"Service card may offer optional capture");
const modifiedServiceRoute=testWhatsAppRoute("servicos",true);
assert.deepEqual(modifiedServiceRoute.events,["whatsapp_click"]);
assert.equal(modifiedServiceRoute.prevented,false,"Ctrl+click may not be intercepted");

console.log("Patty form and WhatsApp routing regression passed: both forms, success, duplicate, error, no PII and preserved WhatsApp intent.");
