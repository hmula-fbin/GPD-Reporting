/* Wraps a flow definition in a Power Automate import package (My flows > Import > Import Package (Legacy)):
     manifest.json                                    what is in the package; the import asks for each connection
     Microsoft.Flow/flows/manifest.json               which folder holds the flow
     Microsoft.Flow/flows/<id>/definition.json        the flow itself
     Microsoft.Flow/flows/<id>/apisMap.json           connection reference -> connector entry in manifest.json
     Microsoft.Flow/flows/<id>/connectionsMap.json    connection reference -> connection entry in manifest.json
   Ids are derived from the flow name, so rebuilding gives the same package. */
import crypto from "node:crypto";
import { zip } from "./zip.mjs";

const uuid = (seed) => {
  const h = crypto.createHash("sha1").update("gpd-flow:" + seed).digest("hex");
  return [h.slice(0, 8), h.slice(8, 12), "5" + h.slice(13, 16), ((parseInt(h[16], 16) & 3) | 8).toString(16) + h.slice(17, 20), h.slice(20, 32)].join("-");
};

/* Every connection reference the flow's actions and triggers use. */
export function connectionRefs(definition) {
  const found = new Set();
  const walk = (v) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") { if (v.host && v.host.connectionName) found.add(v.host.connectionName); Object.values(v).forEach(walk); }
  };
  walk(definition);
  return [...found].sort();
}

/* { path: object } for one flow. */
export function flowPackageFiles({ displayName, definition }, connections, created = new Date()) {
  const id = (what) => uuid(displayName + "/" + what);
  const flowRes = id("flow"), flowName = id("flow-name");
  const refs = connectionRefs(definition);
  const apiRes = {}, connRes = {};
  for (const ref of refs) {
    if (!connections[ref]) throw new Error(displayName + ": unknown connection reference " + ref);
    apiRes[connections[ref].api] = id("api/" + connections[ref].api);
    connRes[ref] = id("connection/" + ref);
  }
  const resources = {
    [flowRes]: {
      type: "Microsoft.Flow/flows", suggestedCreationType: "New", creationType: "Existing, New, Update",
      details: { displayName }, configurableBy: "User", hierarchy: "Root",
      dependsOn: [...Object.values(apiRes), ...Object.values(connRes)],
    },
  };
  for (const [api, rid] of Object.entries(apiRes)) {
    const apiName = Object.values(connections).find((c) => c.api === api).apiName;
    resources[rid] = { id: "/providers/Microsoft.PowerApps/apis/" + api, name: api, type: "Microsoft.PowerApps/apis", suggestedCreationType: "Existing",
      details: { displayName: apiName }, configurableBy: "System", hierarchy: "Child", dependsOn: [] };
  }
  for (const [ref, rid] of Object.entries(connRes)) {
    resources[rid] = { type: "Microsoft.PowerApps/apis/connections", suggestedCreationType: "Existing", creationType: "Existing",
      details: { displayName: connections[ref].label }, configurableBy: "User", hierarchy: "Child", dependsOn: [apiRes[connections[ref].api]] };
  }
  const dir = "Microsoft.Flow/flows/" + flowRes + "/";
  return {
    "manifest.json": {
      schema: "1.0",
      details: { displayName, description: "GPD Portfolio Hub release automation (docs/PROD-APPROVAL-FLOW.md)", createdTime: created.toISOString(),
        packageTelemetryId: id("telemetry"), creator: "N/A", sourceEnvironment: "" },
      resources,
    },
    "Microsoft.Flow/flows/manifest.json": { packageSchemaVersion: "1.0", flowAssets: { assetPaths: [flowRes] } },
    [dir + "definition.json"]: {
      name: flowName, id: "/providers/Microsoft.Flow/flows/" + flowName, type: "Microsoft.Flow/flows",
      properties: {
        apiId: "/providers/Microsoft.PowerApps/apis/shared_logicflows", displayName, definition,
        connectionReferences: Object.fromEntries(refs.map((ref) => [ref, {
          connectionName: "gpd-" + connRes[ref], source: "Embedded", id: "/providers/Microsoft.PowerApps/apis/" + connections[ref].api, tier: "NotSpecified",
        }])),
        flowFailureAlertSubscribed: false, isManaged: false,
      },
    },
    [dir + "apisMap.json"]: Object.fromEntries(refs.map((ref) => [ref, apiRes[connections[ref].api]])),
    [dir + "connectionsMap.json"]: Object.fromEntries(refs.map((ref) => [ref, connRes[ref]])),
  };
}

export const flowPackage = (flow, connections, created) =>
  zip(Object.entries(flowPackageFiles(flow, connections, created)).map(([name, obj]) => ({ name, data: JSON.stringify(obj, null, 2) })), created);
