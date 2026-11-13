// Captura obrigatória de contatos originados em links de WhatsApp da bio.
// Os eventos de conversão permanecem no dataLayer; nenhum dado pessoal é enviado ao GTM.
(function () {
  "use strict";
  const whatsappHosts = new Set(["wa.me", "api.whatsapp.com", "web.whatsapp.com"]);
  const services = ["A definir", "Cabelos e Cachos", "Nail Design", "Sobrancelhas e Micropigmentação",
    "Estética", "Cílios", "Maquiagem", "Depilação", "Massoterapia e Terapias"];
  const isMichele = location.pathname.startsWith("/michele/");
  let pending = null;
  let busy = false;

  const css = document.createElement("style");
  css.textContent = [
    "#patty-crm-gate{position:fixed;inset:0;z-index:2147483000;background:rgba(23,10,20,.77);display:none;align-items:center;justify-content:center;padding:18px;box-sizing:border-box}",
    "#patty-crm-gate[aria-hidden=false]{display:flex}",
    "#patty-crm-gate .pcg-box{background:#fff;color:#261e24;width:min(100%,460px);max-height:92vh;overflow:auto;border-radius:17px;padding:25px;box-shadow:0 22px 55px #0005;font:inherit}",
    "#patty-crm-gate h2{font-size:1.45rem;margin:0 0 8px;color:#65203a}",
    "#patty-crm-gate p{font-size:.88rem;line-height:1.5;margin:7px 0 12px}",
    "#patty-crm-gate label{display:block;font-size:.87rem;font-weight:600;margin-top:10px}",
    "#patty-crm-gate input:not([type=checkbox]),#patty-crm-gate select{box-sizing:border-box;width:100%;padding:11px;border:1px solid #c8bfc5;border-radius:9px;margin-top:5px;background:#fff;color:#21161e;font:inherit}",
    "#patty-crm-gate .pcg-privacy{display:flex;gap:9px;align-items:flex-start;font-weight:400}",
    "#patty-crm-gate .pcg-privacy input{margin-top:5px}",
    "#patty-crm-gate a{color:#792341;text-decoration:underline}",
    "#patty-crm-gate .pcg-actions{display:flex;gap:10px;margin-top:14px;flex-wrap:wrap}",
    "#patty-crm-gate button{padding:11px 15px;border:0;border-radius:8px;cursor:pointer;font:inherit;font-weight:700}",
    "#patty-crm-gate button[type=submit]{background:#792341;color:#fff;flex:1}",
    "#patty-crm-gate button[type=button]{background:#eee7eb;color:#38232d}",
    "#patty-crm-gate button:disabled{opacity:.55;cursor:wait}",
    "#patty-crm-gate .pcg-status{min-height:1.3em;color:#88263a;font-weight:600}"
  ].join("");
  document.head.appendChild(css);

  const overlay = document.createElement("div");
  overlay.id = "patty-crm-gate";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-hidden", "true");
  overlay.setAttribute("aria-labelledby", "pcg-title");
  overlay.innerHTML = [
    '<div class="pcg-box"><h2 id="pcg-title">Antes de conversar pelo WhatsApp</h2>',
    '<p>Registre seu contato para a equipe acompanhar seu atendimento. O cadastro não confirma agendamento nem autoriza promoções.</p>',
    '<form id="pcg-form">',
    '<label for="pcg-service">Serviço desejado</label><select id="pcg-service" required></select>',
    '<label for="pcg-name">Seu nome</label><input id="pcg-name" autocomplete="name" required minlength="2" maxlength="120" placeholder="Como podemos chamar você?">',
    '<label for="pcg-phone">Seu WhatsApp com DDD</label><input id="pcg-phone" type="tel" autocomplete="tel" inputmode="tel" required minlength="10" maxlength="24" placeholder="(48) 99999-9999">',
    '<input id="pcg-site" name="website" type="text" autocomplete="off" tabindex="-1" aria-hidden="true" style="display:none">',
    '<label class="pcg-privacy"><input id="pcg-privacy" type="checkbox" required><span>Li o <a href="/privacidade.html" target="_blank" rel="noopener noreferrer">aviso de privacidade</a> e estou ciente do uso dos meus dados para responder ao contato.</span></label>',
    '<div class="pcg-actions"><button id="pcg-save" type="submit">Registrar e abrir WhatsApp</button><button id="pcg-cancel" type="button">Cancelar</button></div>',
    '<p id="pcg-status" class="pcg-status" role="status" aria-live="polite"></p>',
    '</form></div>'
  ].join("");
  document.body.appendChild(overlay);
  const form = overlay.querySelector("#pcg-form");
  const service = overlay.querySelector("#pcg-service");
  const name = overlay.querySelector("#pcg-name");
  const phone = overlay.querySelector("#pcg-phone");
  const status = overlay.querySelector("#pcg-status");
  const submit = overlay.querySelector("#pcg-save");
  services.forEach(s => { const o = document.createElement("option"); o.value = s; o.textContent = s; service.appendChild(o); });

  function close() {
    if (busy) return;
    overlay.setAttribute("aria-hidden", "true");
    pending = null;
  }
  overlay.querySelector("#pcg-cancel").addEventListener("click", close);
  overlay.addEventListener("click", e => { if (e.target === overlay) close(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && overlay.getAttribute("aria-hidden") === "false") close(); });

  function reference() {
    if (crypto && crypto.randomUUID) return "PTY-" + crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase();
    const b = new Uint8Array(6); crypto.getRandomValues(b);
    return "PTY-" + Array.from(b, n => n.toString(16).padStart(2, "0")).join("").toUpperCase();
  }
  function campaign() {
    let saved = {};
    try { saved = JSON.parse(sessionStorage.getItem("patty_campaign") || "{}"); } catch (_) {}
    const q = new URLSearchParams(location.search);
    ["utm_source","utm_medium","utm_campaign","utm_id","utm_content","utm_term","gclid","gbraid","wbraid"].forEach(k => {
      if (q.has(k)) saved[k] = String(q.get(k) || "").slice(0, 150);
    });
    return saved;
  }
  function source(c) {
    return String(c.utm_source || (isMichele ? "perfil_michele" : "pagina_de_links"))
      .replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32);
  }
  function track(event, details) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event, ...details });
  }

  document.addEventListener("click", function (e) {
    if (e.defaultPrevented) return;
    const target = e.target instanceof Element ? e.target : e.target?.parentElement;
    const link = target?.closest("a[href]");
    if (!link || link.dataset.crmSaved === "true") return;
    let url;
    try { url = new URL(link.href, location.href); } catch (_) { return; }
    if (!whatsappHosts.has(url.hostname)) return;
    e.preventDefault();
    if (busy) return;
    pending = {
      url: link.href, reference: link.dataset.crmRef || reference(),
      label: (link.innerText || link.getAttribute("aria-label") || "atendimento").trim().slice(0, 100)
    };
    form.reset();
    service.value = isMichele ? "Cílios" : "A definir";
    status.textContent = "";
    overlay.setAttribute("aria-hidden", "false");
    name.focus();
  });

  form.addEventListener("submit", async e => {
    e.preventDefault();
    if (!pending || busy || !form.reportValidity()) return;
    const p = pending;
    const c = campaign();
    // A aba temporária deve ser aberta durante o clique para evitar bloqueio de pop-up.
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.document.body.textContent = "Confirmando seu cadastro...";
    busy = true;
    submit.disabled = true;
    status.textContent = "Registrando seu contato...";
    try {
      const response = await fetch("/api/leads", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.value.trim(), phone: phone.value.trim(), service: service.value,
          reference: p.reference, source: "botao_geral", campaign: c,
          professional: isMichele ? "Michele Tavares" : "",
          privacyAcknowledged: overlay.querySelector("#pcg-privacy").checked,
          website: overlay.querySelector("#pcg-site").value
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok !== true || result.reference !== p.reference ||
          typeof result.created !== "boolean") {
        throw Error(result.error || "Não foi possível confirmar o cadastro.");
      }
      const formId = isMichele ? "captura_perfil_michele" : "captura_link_bio";
      const origin = isMichele ? "perfil_michele" : "link_bio";
      if (result.created) {
        track("form_submit", {
          form_id: formId, form_name: formId,
          form_service: service.value, lead_source: "botao_geral"
        });
        track("crm_lead_saved", {
          lead_reference: p.reference, form_service: service.value, lead_source: "botao_geral"
        });
      }
      const attrs = {
        whatsapp_area: origin,
        whatsapp_servico: isMichele ? "Cílios" : "atendimento_geral",
        whatsapp_botao: isMichele ? "agendamento_michele" : "agendamento_bio",
        lead_reference: p.reference,
        campaign_utm_source: c.utm_source || "(nao_informada)",
        campaign_utm_medium: c.utm_medium || "(nao_informada)",
        campaign_utm_campaign: c.utm_campaign || "(nao_informada)",
        campaign_has_click_id: Boolean(c.gclid || c.gbraid || c.wbraid)
      };
      if (!isMichele) {
        attrs.link_bio_destination = "agendamento_whatsapp";
        attrs.link_bio_source = source(c);
      }
      track("whatsapp_click", attrs);
      const destination = new URL(p.url);
      // Mantém texto e destino oficiais existentes, acrescentando apenas dados fornecidos pelo visitante.
      if (/^\/\d+\/?$/.test(destination.pathname)) {
        destination.searchParams.set("text", (destination.searchParams.get("text") || "") +
          "\nMeu nome: " + name.value.trim() +
          "\nWhatsApp para retorno: " + phone.value.trim() +
          "\nServiço: " + service.value +
          "\nRef. atendimento: " + p.reference);
      }
      busy = false;
      close();
      if (tab && !tab.closed) tab.location.href = destination.href;
      else location.assign(destination.href);
    } catch (err) {
      if (tab && !tab.closed) tab.close();
      track("crm_capture_failed", {
        lead_reference: p.reference,
        lead_source: "botao_geral"
      });
      status.textContent = err.message || "Cadastro não confirmado. Confira os dados e tente novamente.";
      // Sem confirmação do CRM, não há redirecionamento para o WhatsApp.
    } finally {
      busy = false;
      submit.disabled = false;
    }
  });
})();