import { readdirSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

for (const file of [...readdirSync("lib").filter(f=>f.endsWith(".js")).map(f=>"lib/"+f), "api/config.js", "api/leads.js", ...readdirSync("api/crm").filter(f=>f.endsWith(".js")).map(f=>"api/crm/"+f), "patty-auth.js", "patty-crm-ui.js", "patty-service-catalog.js", "patty-crm-gate.js"]) {
  execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
}
const tmp = mkdtempSync(join(tmpdir(), "patty-crm-"));
try {
  for (const file of ["index.html", ...readdirSync(".").filter(f=>/^crm(?:-.*)?\.html$/.test(f))]) {
    const html = readFileSync(file, "utf8");
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
      .filter(m => !/type\s*=\s*["']application\/ld\+json/i.test(m[1]) && m[2].trim());
    if (!scripts.length) throw Error("Sem scripts inline em " + file);
    scripts.forEach((script, index) => {
      const filename = join(tmp, "check-" + index + (/\btype\s*=\s*["']module/i.test(script[1]) ? ".mjs" : ".js"));
      writeFileSync(filename, script[2]);
      execFileSync(process.execPath, ["--check", filename], { stdio: "inherit" });
    });
    if (file === "index.html" && (!html.includes("privacy-ack") || !html.includes("/api/leads"))) {
      throw Error("Captação do formulário não presente");
    }
    if (file === "crm.html" &&
        (!html.includes('manual-add') || !html.includes('/api/crm/insights') ||
         !html.includes('detail-estimate') || !html.includes('detail-test') ||
         !html.includes('manual-followup'))) {
      throw Error("Painel comercial ou cadastro manual ausente em crm.html");
    }
  }
  console.log("Validação de sintaxe do MVP concluída");
} finally { rmSync(tmp, { recursive: true, force: true }); }

