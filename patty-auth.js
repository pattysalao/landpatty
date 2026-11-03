// Patty CRM — session restoration is managed by Firebase SDK.
// Only the PUBLIC Firebase project configuration is cached briefly; never cache credentials or ID tokens.
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

const CONFIG_CACHE_KEY = "patty-public-firebase-config-v1";
const CONFIG_TTL = 5 * 60 * 1000;
let singleton;

export function pattyTimeout(work, ms, message = "A operação demorou mais que o esperado. Tente novamente.") {
  let timer;
  return Promise.race([
    Promise.resolve(work),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })
  ]).finally(() => clearTimeout(timer));
}

function cachedFirebase() {
  try {
    const value = JSON.parse(sessionStorage.getItem(CONFIG_CACHE_KEY) || "null");
    if (value && Date.now() - value.savedAt < CONFIG_TTL &&
        value.firebase?.apiKey && value.firebase?.projectId && value.firebase?.appId) return value.firebase;
  } catch (_) { /* Browser privacy settings may disable sessionStorage. */ }
  return null;
}

async function loadFirebaseConfig() {
  const cached = cachedFirebase();
  if (cached) return cached;
  let failure;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch("/api/config", {
        cache: "no-store", credentials: "same-origin", signal: controller.signal
      });
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500)
          throw Object.assign(new Error("Configuração de acesso indisponível (" + response.status + ")."), { fatal: true });
        throw new Error("Serviço temporariamente indisponível (" + response.status + ").");
      }
      const config = await response.json();
      const firebase = config?.firebase;
      if (!firebase?.apiKey || !firebase?.projectId || !firebase?.appId)
        throw Object.assign(new Error("O acesso ainda não está configurado. Avise a administração."), { fatal: true });
      try { sessionStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify({savedAt: Date.now(), firebase})); } catch (_) {}
      return firebase;
    } catch (error) {
      failure = error;
      if (error.fatal) break;
      if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 300));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(failure?.fatal ? failure.message :
    "Não foi possível conectar ao serviço de login. Confira a conexão e use Tentar novamente.");
}

export async function initPattyAuth() {
  if (singleton) return singleton;
  singleton = (async () => {
    const firebase = await loadFirebaseConfig();
    // Do not await authStateReady() here. onAuthStateChanged() already waits for
    // the SDK's persisted state; blocking first paint also blocked all CRM modules.
    // getAuth automatically chooses supported persistence with fallback on the web.
    const app = getApps().find(x => x.name === "[DEFAULT]") || initializeApp(firebase);
    return {auth: getAuth(app), persistence: "automatic"};
  })().catch(err => { singleton = null; throw err; });
  return singleton;
}

export function showPattyAuthState(user, persistence) {
  const signedIn = !!user?.emailVerified;
  document.body.classList.toggle("patty-auth-ready", signedIn);
  if (!signedIn) document.body.classList.remove("patty-manager");
  window.dispatchEvent(new CustomEvent("patty:auth", {
    detail: { signedIn, email: signedIn ? user.email : "", persistence }
  }));
}

export async function loadPattyPermissions(auth) {
  const user = auth?.currentUser;
  if (!user?.emailVerified) {
    document.body.classList.remove("patty-manager");
    return {authorized: false, manager: false};
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8500);
  try {
    const token = await pattyTimeout(
      user.getIdToken(), 7000, "A validação da sessão demorou demais."
    );
    const response = await fetch("/api/crm/modulos", {
      cache: "no-store", signal: controller.signal,
      headers: {Authorization: "Bearer " + token}
    });
    if (!response.ok) {
      document.body.classList.remove("patty-manager");
      return {authorized: false, manager: false, status: response.status};
    }
    const result = await response.json();
    document.body.classList.toggle("patty-manager", result.isManager === true);
    return {authorized: true, manager: result.isManager === true, modules: result.modules};
  } catch (error) {
    document.body.classList.remove("patty-manager");
    return {authorized: false, manager: false, status: 0, error: error?.message || "Sem conexão"};
  } finally { clearTimeout(timer); }
}
