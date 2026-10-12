// The Power Automate import packages (tools/make-flow-packages.mjs): they can't be test-imported here, so these
// checks catch what would make an import or a run fail: a step referring to a missing step, an unbalanced
// expression, a connection the package doesn't declare. Plus the safety rules: only the four Scripts steps use
// the admin connection, and only for the two sites. Plain Node checks, run once.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { zip, unzip } from "../tools/lib/zip.mjs";
import { CONNECTIONS, DAILY_SCRIPT_SITES, approvalTestFlow, customScriptsTestFlow, dailyCustomScriptsFlow, releaseFlow, scriptsXml } from "../tools/lib/release-flows.mjs";
import { connectionRefs, flowPackage, flowPackageFiles } from "../tools/lib/flow-package.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FLOWS = [approvalTestFlow(), customScriptsTestFlow(), dailyCustomScriptsFlow(), releaseFlow()];

/* name -> { action, siblings } for every action at any depth */
function actionsOf(definition) {
  const all = {};
  const visit = (map) => {
    for (const [name, a] of Object.entries(map || {})) {
      all[name] = { action: a, siblings: map };
      visit(a.actions);
      if (a.else) visit(a.else.actions);
    }
  };
  visit(definition.actions);
  return all;
}
/* every string in the definition, with where it is */
function strings(v, where = "", out = []) {
  if (typeof v === "string") out.push([where, v]);
  else if (Array.isArray(v)) v.forEach((x, i) => strings(x, where + "[" + i + "]", out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) strings(x, where + "." + k, out);
  return out;
}
/* "" if the expression's quotes, brackets and parentheses balance, else what is wrong */
function balance(expr) {
  const stack = [];
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (c === "'") { i++; while (i < expr.length && !(expr[i] === "'" && expr[i + 1] !== "'")) i += expr[i] === "'" ? 2 : 1; if (i >= expr.length) return "unclosed quote"; continue; }
    if ("([".includes(c)) stack.push(c === "(" ? ")" : "]");
    else if (")]".includes(c) && stack.pop() !== c) return "unbalanced " + c;
  }
  return stack.length ? "unclosed " + stack.join("") : "";
}
/* the expressions in a string: the whole of "@expr", or each "@{...}" */
function expressions(s) {
  if (s.startsWith("@") && !s.startsWith("@{") && !s.startsWith("@@")) return [s.slice(1)];
  const out = [];
  for (let i = s.indexOf("@{"); i >= 0; i = s.indexOf("@{", i + 1)) {
    let j = i + 2, depth = 1;
    while (j < s.length && depth) { if (s[j] === "'") { j++; while (j < s.length && !(s[j] === "'" && s[j + 1] !== "'")) j += s[j] === "'" ? 2 : 1; } else if (s[j] === "{") depth++; else if (s[j] === "}") depth--; j++; }
    out.push(s.slice(i + 2, j - 1));
  }
  return out;
}

test.describe("Power Automate packages", () => {
  test.beforeEach(() => test.skip(test.info().project.name !== "desktop-light", "Node-only checks run once"));

  test("zip round-trips", () => {
    const entries = [{ name: "a.json", data: '{"x":1}' }, { name: "Microsoft.Flow/flows/b/c.json", data: "é and ü".repeat(500) }];
    expect(unzip(zip(entries)).map((e) => [e.name, e.data.toString("utf8")])).toEqual(entries.map((e) => [e.name, e.data]));
  });

  for (const flow of FLOWS) {
    test(flow.displayName + ": every step reference, run-after and expression holds together", () => {
      const acts = actionsOf(flow.definition);
      for (const [name, { action, siblings }] of Object.entries(acts)) {
        for (const prev of Object.keys(action.runAfter || {})) expect(siblings[prev], name + " runs after missing " + prev).toBeTruthy();
      }
      for (const [where, s] of strings(flow.definition)) {
        for (const e of expressions(s)) {
          expect(balance(e), where + ": " + e).toBe("");
          for (const [, fn, ref] of e.matchAll(/\b(body|outputs|actions|items)\('([^']+)'\)/g)) {
            expect(acts[ref], where + " refers to missing step " + ref).toBeTruthy();
            if (fn === "items") expect(acts[ref].action.type, where + ": items() needs a loop").toBe("Foreach");
          }
        }
      }
    });

    test(flow.displayName + ": the package declares every connection it uses", () => {
      const when = new Date("2026-10-12T12:00:00Z");
      const files = flowPackageFiles(flow, CONNECTIONS, when);
      const [asset] = files["Microsoft.Flow/flows/manifest.json"].flowAssets.assetPaths;
      const dir = "Microsoft.Flow/flows/" + asset + "/";
      const def = files[dir + "definition.json"], apis = files[dir + "apisMap.json"], conns = files[dir + "connectionsMap.json"];
      const { resources } = files["manifest.json"];
      const refs = connectionRefs(flow.definition);
      expect(Object.keys(def.properties.connectionReferences).sort()).toEqual(refs);
      expect(Object.keys(apis).sort()).toEqual(refs);
      expect(Object.keys(conns).sort()).toEqual(refs);
      expect(resources[asset].type).toBe("Microsoft.Flow/flows");
      for (const ref of refs) {
        expect(resources[apis[ref]].name).toBe(CONNECTIONS[ref].api);
        expect(resources[conns[ref]].type).toBe("Microsoft.PowerApps/apis/connections");
        expect(resources[conns[ref]].dependsOn).toEqual([apis[ref]]);
        expect(resources[asset].dependsOn).toContain(conns[ref]);
      }
      const unpacked = unzip(flowPackage(flow, CONNECTIONS, when));
      expect(unpacked.map((e) => e.name).sort()).toEqual(Object.keys(files).sort());
      for (const e of unpacked) expect(JSON.parse(e.data.toString("utf8"))).toEqual(files[e.name]);
    });
  }

  test("approvers come from the Approvers list, first to respond decides", () => {
    for (const flow of [approvalTestFlow(), releaseFlow()]) {
      const acts = actionsOf(flow.definition);
      expect(acts.Get_approvers.action.inputs.parameters.table).toBe("573eb5b7-c5b8-479c-9444-5be2b004d720");
      const p = acts.Ask_for_approval.action.inputs.parameters;
      expect(p["WebhookApprovalCreationInput/assignedTo"]).toBe("@{join(body('Approver_emails'), ';')}");
      expect(p.approvalType).toBe("Basic");
    }
  });

  test("only the Scripts steps use the admin connection, and only for the Prod and QA sites", () => {
    const site = { Scripts_on_QA: ["GPDReportingQA", 1], Scripts_on_Prod: ["GPDReporting", 1], Scripts_on_Prod_again: ["GPDReporting", 1], Scripts_off_Prod: ["GPDReporting", 2] };
    for (const [flow, expected] of [[releaseFlow(), ["Scripts_off_Prod", "Scripts_on_Prod", "Scripts_on_Prod_again", "Scripts_on_QA"]], [customScriptsTestFlow(), ["Scripts_off_Prod", "Scripts_on_Prod", "Scripts_on_QA"]]]) {
      const admin = Object.entries(actionsOf(flow.definition)).filter(([, { action }]) => action.inputs?.host?.connectionName === "shared_sharepointonline_1");
      expect(admin.map(([n]) => n).sort()).toEqual(expected);
      for (const [name, { action }] of admin) {
        const p = action.inputs.parameters;
        expect(p.dataset).toBe("https://fbinportal-admin.sharepoint.com");
        expect(p["parameters/body"]).toBe(scriptsXml("https://fbinportal.sharepoint.com/sites/" + site[name][0], site[name][1]));
      }
    }
    expect(approvalTestFlow().definition.actions.Get_approvers.inputs.host.connectionName).toBe("shared_sharepointonline");
    expect(connectionRefs(approvalTestFlow().definition)).not.toContain("shared_sharepointonline_1");
  });

  test("daily flow: 6 AM Eastern, every listed site off then straight back on, as the admin account", () => {
    const flow = dailyCustomScriptsFlow();
    expect(flow.definition.triggers.Recurrence.recurrence).toEqual({ frequency: "Day", interval: 1, timeZone: "Eastern Standard Time", schedule: { hours: [6], minutes: [0] } });
    expect(flow.definition.actions.Sites.inputs).toEqual(DAILY_SCRIPT_SITES);
    for (const s of DAILY_SCRIPT_SITES) expect(s).toMatch(/^https:\/\/fbinportal\.sharepoint\.com\/sites\/[A-Za-z0-9-]+$/);
    expect(DAILY_SCRIPT_SITES.map((s) => s.toLowerCase())).toEqual(expect.arrayContaining(["https://fbinportal.sharepoint.com/sites/gpdreporting", "https://fbinportal.sharepoint.com/sites/gpdreportingqa", "https://fbinportal.sharepoint.com/sites/gpdreportingsbx"]));
    const acts = actionsOf(flow.definition);
    const admin = Object.entries(acts).filter(([, { action }]) => action.inputs?.host?.connectionName === "shared_sharepointonline_1");
    expect(admin.map(([n]) => n).sort()).toEqual(["Scripts_off_briefly", "Scripts_on_site"]);
    expect(acts.Scripts_off_briefly.action.inputs.parameters["parameters/body"]).toBe(scriptsXml("@{items('Each_site')}", 2));
    expect(acts.Scripts_on_site.action.inputs.parameters["parameters/body"]).toBe(scriptsXml("@{items('Each_site')}", 1));
    expect(acts.Scripts_on_site.action.runAfter).toEqual({ Scripts_off_briefly: ["Succeeded", "Failed"] });
    expect(acts.Each_site.action.foreach).toBe("@outputs('Sites')");
  });

  test("the release starts only from a well-formed GPD Releases row", () => {
    const t = releaseFlow().definition.triggers.When_an_item_is_created;
    expect(t.inputs.parameters.table).toBe("6d7bbcf1-a82a-4917-ba85-ca066854cb89");
    expect(fs.readFileSync(path.join(ROOT, ".claude", "commands", "package-prod.md"), "utf8")).toContain(t.inputs.parameters.table);
    expect(t.conditions[0].expression).toContain("startsWith(triggerBody()?['ReleaseId'], 'v')");
    expect(t.conditions[0].expression).toContain("not(contains(triggerBody()?['ReleaseId'], ''''))");
  });

  test("every step is named the same in the guide", () => {
    const guide = fs.readFileSync(path.join(ROOT, "docs", "PROD-APPROVAL-FLOW.md"), "utf8");
    for (const flow of FLOWS) for (const name of Object.keys(actionsOf(flow.definition))) {
      if (/^Email_(approved)$/.test(name)) continue;               /* the test flow's own email, described in words */
      expect(guide, name).toContain("**" + name.replace(/_/g, " ") + "**");
    }
  });
});
