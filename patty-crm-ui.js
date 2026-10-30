/* Patty CRM navigation shell — progressive enhancement; no CRM data or authentication here. */
(() => {
"use strict";
const icons={
 menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
 dashboard:'<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="5" rx="1.5"/><rect x="13" y="10" width="8" height="11" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/>',
 calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
 users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
 scissors:'<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.12 8.12 20 20M14.8 9.2 20 4M8.12 15.88 12.4 11.6"/>',
 badge:'<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="12" cy="9" r="3"/><path d="M7 18v-1a5 5 0 0 1 10 0v1"/>',
 check:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
 wallet:'<rect x="2" y="6" width="20" height="15" rx="2"/><path d="M3 10h18M16 15h3M5 6V4a2 2 0 0 1 2-2h13"/>',
 chart:'<path d="M3 3v18h18M7 16l4-5 4 3 5-7"/>',
 coins:'<circle cx="9" cy="9" r="6"/><path d="M8 6h3M8 9h3M9 12V6M15 11a6 6 0 1 1-4 10"/>',
 percent:'<path d="m19 5-14 14"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
 box:'<path d="m12 3 9 5-9 5-9-5 9-5ZM3 8v9l9 5 9-5V8M12 13v9"/>',
 layers:'<path d="m12 2 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 17l9 5 9-5"/>',
 external:'<path d="M13 5h6v6M19 5l-9 9"/><path d="M19 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/>',
 upload:'<path d="M12 16V3m-5 5 5-5 5 5M3 17v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3"/>',
 spark:'<path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3ZM19 18l.5 1.5L21 20l-1.5.5L19 22l-.5-1.5L17 20l1.5-.5L19 18Z"/>'
};
const svg=(name)=>'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'+(icons[name]||icons.dashboard)+'</svg>';
const groups=[
 {title:"Visão geral",items:[["Painel de leads","/crm.html","dashboard"],["Agenda","/crm-agenda.html","calendar"],["Clientes e histórico","/crm-clientes.html","users"]]},
 {title:"Operação",items:[["Serviços e preços","/crm-modulos.html#servicos","scissors"],["Profissionais","/crm-modulos.html#profissionais","badge"],["Atendimentos","/crm-modulos.html#atendimentos","check"],["Produtos","/crm-modulos.html#produtos","box"],["Estoque","/crm-modulos.html#estoque","layers"]]},
 {title:"Financeiro",items:[["Por cliente","/crm-modulos.html#financeiro_clientes","wallet"],["Faturamento","/crm-modulos.html#faturamento","chart"],["Ticket médio","/crm-modulos.html#ticket_clientes","coins"],["Comissões","/crm-modulos.html#comissoes","percent"]]}
];
const pageTitles={"/crm.html":"Painel de leads","/crm-agenda.html":"Agenda da equipe","/crm-clientes.html":"Clientes e histórico","/crm-modulos.html":"Gestão do salão"};
function launch(){
 const legacy=document.body.querySelector("body > header")||document.body.querySelector("header");
 const main=document.querySelector("body > main");
 if(!legacy||!main||document.querySelector(".patty-shell"))return;
 document.body.classList.add("patty-admin");
 const shell=document.createElement("div");shell.className="patty-shell";
 const sidebar=document.createElement("aside");sidebar.className="patty-sidebar";sidebar.id="patty-sidebar";sidebar.setAttribute("aria-label","Navegação principal");
 sidebar.innerHTML='<a class="patty-brand" href="/crm.html"><img class="patty-brand-logo" alt="" src="/imagens/logo-patty-salao.png"><span class="patty-brand-text"><strong>Patty</strong><small>Gestão do salão</small></span></a>'+
 '<div class="patty-side-scroll">'+groups.map(g=>'<nav class="patty-nav-group" aria-label="'+g.title+'"><div class="patty-nav-heading">'+g.title+'</div>'+g.items.map(([label,href,icon])=>'<a class="patty-nav-link" data-nav-href="'+href+'" href="'+href+'">'+svg(icon)+'<span>'+label+'</span></a>').join("")+'</nav>').join("")+'</div>'+
 '<div class="patty-side-bottom"><p>Patty Centro de Beleza</p><a href="/" target="_blank" rel="noopener noreferrer">Ver site oficial '+svg("external")+'</a></div>';
 const workspace=document.createElement("div");workspace.className="patty-workspace";
 const top=document.createElement("div");top.className="patty-topbar";top.setAttribute("role","banner");
 const left=document.createElement("div");left.className="patty-topbar-start";
 const toggle=document.createElement("button");toggle.type="button";toggle.className="patty-mobile-toggle";toggle.setAttribute("aria-label","Abrir menu");toggle.setAttribute("aria-expanded","false");toggle.setAttribute("aria-controls","patty-sidebar");toggle.innerHTML=svg("menu");
 const pageLabel=pageTitles[location.pathname]||"Painel de gestão";
 const label=document.createElement("div");label.innerHTML='<span class="patty-page-title">'+pageLabel+'</span><span class="patty-page-caption">Organize atendimentos, equipe e resultados</span>';
 left.append(toggle,label);
 const right=document.createElement("div");right.className="patty-topbar-end";
 right.innerHTML='<a class="patty-topbar-site" href="/" target="_blank" rel="noopener noreferrer">'+svg("external")+' <span>Ver site</span></a>';
 const sessionPill=document.createElement("span");
 sessionPill.className="patty-session-pill";
 sessionPill.setAttribute("aria-live","polite");
 right.prepend(sessionPill);
 window.addEventListener("patty:auth",e=>{
   const detail=e.detail||{};
   sessionPill.textContent=detail.signedIn?(detail.email||"Sessão ativa"):"";
   sessionPill.title=detail.persistence==="session"?"Sessão válida apenas nesta aba":detail.signedIn?"Sessão ativa neste navegador":"";
 });
 const headerLogout=legacy.querySelector("#logout");
 if(headerLogout){headerLogout.classList.add("patty-logout");right.prepend(headerLogout)}
 top.append(left,right);
 const backdrop=document.createElement("button");backdrop.type="button";backdrop.className="patty-menu-backdrop";backdrop.setAttribute("aria-label","Fechar menu");
 legacy.classList.add("patty-legacy-header");
 legacy.after(shell);shell.append(sidebar,workspace);workspace.append(top,main);
 document.body.append(backdrop);
 const close=()=>{document.body.classList.remove("patty-nav-open");toggle.setAttribute("aria-expanded","false");toggle.setAttribute("aria-label","Abrir menu")};
 const open=()=>{document.body.classList.add("patty-nav-open");toggle.setAttribute("aria-expanded","true");toggle.setAttribute("aria-label","Fechar menu")};
 toggle.addEventListener("click",()=>document.body.classList.contains("patty-nav-open")?close():open());
 backdrop.addEventListener("click",close);
 window.addEventListener("keydown",e=>{if(e.key==="Escape")close()});
 sidebar.addEventListener("click",e=>{if(e.target.closest("a"))close()});
 function updateActive(){
  const url=location.pathname+location.hash;
  sidebar.querySelectorAll(".patty-nav-link").forEach(a=>{
   const href=a.getAttribute("data-nav-href");
   const managerOnly = href==="/crm-clientes.html" ||
      (href.startsWith("/crm-modulos.html#") &&
       !["servicos","profissionais"].includes(href.split("#")[1]));
   a.hidden = managerOnly && !document.body.classList.contains("patty-manager");
   const active=href===url || (location.pathname!=="/crm-modulos.html"&&href===location.pathname);
   if(active)a.setAttribute("aria-current","page");else a.removeAttribute("aria-current")
  });
  const sel=sidebar.querySelector(".patty-nav-link[aria-current='page']");
  if(sel&&location.pathname==="/crm-modulos.html"){const p=label.querySelector(".patty-page-title");p.textContent=sel.textContent.trim()}
 }
 updateActive();
 window.addEventListener("hashchange",updateActive);
 new MutationObserver(updateActive).observe(document.body,{attributes:true,attributeFilter:["class"]});
 const app=document.getElementById("app");
 function updateAuth(){
  const ready=!!app&&!app.classList.contains("hidden");
  document.body.classList.toggle("patty-auth-ready",ready);
  if(!ready)close();
 }
 if(app){new MutationObserver(updateAuth).observe(app,{attributes:true,attributeFilter:["class"]});updateAuth()}
 if(location.pathname==="/crm-modulos.html"){
  const tabs=document.getElementById("tabs");
  if(tabs){
   function updateAuthorized(){
    const buttons=Array.from(tabs.querySelectorAll("button[data-module]"));
    if(!buttons.length)return;
    const permitted=new Set(buttons.map(b=>b.dataset.module));
    sidebar.querySelectorAll(".patty-nav-link").forEach(a=>{
     const key=a.getAttribute("href").split("#")[1];
     if(key)a.hidden=!permitted.has(key)
    });
   }
   new MutationObserver(updateAuthorized).observe(tabs,{childList:true});updateAuthorized()
  }
 }
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",launch,{once:true});else launch();
})();
