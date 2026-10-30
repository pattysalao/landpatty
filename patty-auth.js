// Patty CRM — one Firebase application, same first-party session on every module.
// Never store credentials or ID tokens outside the Firebase Auth SDK.
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  getAuth, setPersistence, browserLocalPersistence, browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

let singleton;
export async function initPattyAuth() {
  if (singleton) return singleton;
  singleton = (async () => {
    const response = await fetch("/api/config", { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) throw new Error("Não foi possível carregar a configuração de acesso.");
    const config = await response.json();
    const firebase = config.firebase;
    if (!firebase?.apiKey || !firebase?.projectId || !firebase?.appId)
      throw new Error("O acesso ainda não está configurado. Avise a administração.");
    const name = "patty-crm";
    const app = getApps().find(x => x.name === name) || initializeApp(firebase, name);
    const auth = getAuth(app);
    // Wait for the persisted user to be restored before choosing which screen to show.
    await auth.authStateReady();
    let persistence = "local";
    try {
      await setPersistence(auth, browserLocalPersistence);
    } catch (error) {
      // Private/restricted browsers may prohibit localStorage.
      try {
        await setPersistence(auth, browserSessionPersistence);
        persistence = "session";
      } catch (_) {
        throw new Error("Seu navegador bloqueou o armazenamento da sessão. Permita dados de sites e tente novamente.");
      }
    }
    return { auth, persistence };
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
    return { authorized: false, manager: false };
  }
  try {
    const response = await fetch("/api/crm/modulos", {
      cache: "no-store",
      headers: { Authorization: "Bearer " + await user.getIdToken() }
    });
    if (!response.ok) {
      document.body.classList.remove("patty-manager");
      return { authorized: false, manager: false, status: response.status };
    }
    const result = await response.json();
    document.body.classList.toggle("patty-manager", result.isManager === true);
    return { authorized: true, manager: result.isManager === true, modules: result.modules };
  } catch (_) {
    document.body.classList.remove("patty-manager");
    return { authorized: false, manager: false, status: 0 };
  }
}
