// Browser smoke test for a deployed environment (docs/CLOUD-DEVOPS-DESIGN.md
// §7.1 step 9). Complements smoke-test.sh: curl can't catch browser-only
// failures, such as an API the browser withholds from insecure (plain HTTP)
// pages. That's how `crypto.randomUUID is not a function` reached dev.
//
//   node smoke.mjs <base-url>
//
// Loads each page in headless Chromium and fails on any uncaught page error,
// console error, API response >= 400, or the app's error state
// ([role=alert]). Read-only: it creates no data.

import { chromium } from "playwright";

const base = (process.argv[2] ?? process.env.BASE_URL ?? "").replace(/\/+$/, "");
if (!/^https?:\/\//.test(base)) {
  console.error("usage: node smoke.mjs <base-url>");
  process.exit(2);
}

const TIMEOUT_MS = 15_000;
const problems = [];

const browser = await chromium.launch();
const page = await browser.newPage();
page.setDefaultTimeout(TIMEOUT_MS);

page.on("pageerror", (err) => problems.push(`page error: ${err.message}`));
page.on("console", (msg) => {
  if (msg.type() === "error") problems.push(`console error: ${msg.text()}`);
});
page.on("response", (res) => {
  if (res.url().includes("/api/") && res.status() >= 400) {
    problems.push(`API ${res.status()} ${res.request().method()} ${new URL(res.url()).pathname}`);
  }
});

// A list page is ready when it shows either rows or its empty state; the
// app's error state ([role=alert]) is a failure.
async function checkList(path, heading) {
  await page.goto(`${base}${path}`);
  await page.getByRole("heading", { name: heading }).waitFor();
  await page.locator("table.data-table, .state-empty, [role=alert]").first().waitFor();
  const alert = page.locator("[role=alert]");
  if (await alert.count()) throw new Error(`${path}: error state: ${await alert.first().innerText()}`);
  const rows = await page.locator("table.data-table tbody tr").count();
  return rows;
}

// Open the first row's link, if any, and wait for the detail page to settle.
async function checkFirstDetail(listPath) {
  const link = page.locator("table.data-table tbody tr a").first();
  if (!(await link.count())) return "no rows to open";
  const href = await link.getAttribute("href");
  await link.click();
  await page.waitForURL((url) => url.pathname === href);
  await page.locator("h1").first().waitFor();
  await page.waitForLoadState("networkidle");
  const alert = page.locator("[role=alert]");
  if (await alert.count()) throw new Error(`${href}: error state: ${await alert.first().innerText()}`);
  return `opened ${href} (from ${listPath})`;
}

const results = [];
async function step(name, fn) {
  const before = problems.length;
  try {
    const detail = await fn();
    const newProblems = problems.slice(before);
    if (newProblems.length) throw new Error(newProblems.join("; "));
    results.push(`ok   ${name}${detail !== undefined ? ` (${detail})` : ""}`);
  } catch (err) {
    results.push(`FAIL ${name}: ${err.message.split("\n")[0]}`);
  }
}

await step("/ redirects to /services", async () => {
  await page.goto(`${base}/`);
  await page.waitForURL((url) => url.pathname === "/services");
});
await step("/services list", async () => `${await checkList("/services", "Services")} rows`);
await step("service detail", () => checkFirstDetail("/services"));
await step("/incidents list", async () => `${await checkList("/incidents", "Incidents")} rows`);
await step("incident detail", () => checkFirstDetail("/incidents"));
// The picker must offer the services that exist. The API count comes from
// Playwright's own HTTP client, not the page, so a broken page can't
// under-report it.
await step("/incidents/new service picker", async () => {
  const res = await page.request.get(`${base}/api/v1/services?limit=1`);
  const { total } = await res.json();
  await page.goto(`${base}/incidents/new`);
  const select = page.locator("select#service_id");
  await select.waitFor();
  const selectable = (await select.locator("option").count()) - 1; // minus the placeholder
  if (selectable < Math.min(total, 1)) {
    throw new Error(`no services selectable, but the API has ${total}`);
  }
  return `${selectable} of ${total} services selectable`;
});
await step("/services/new form", async () => {
  await page.goto(`${base}/services/new`);
  await page.locator("form").first().waitFor();
});

await browser.close();

for (const line of results) console.log(`[browser-smoke] ${line}`);
const failed = results.filter((r) => r.startsWith("FAIL")).length;
if (failed) {
  console.log(`::error::${failed} browser smoke check(s) failed at ${base}`);
  process.exit(1);
}
console.log(`[browser-smoke] all checks passed at ${base}`);
