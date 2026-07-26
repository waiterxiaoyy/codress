#!/usr/bin/env node
// 批量把生成的皮肤上传到管理端:建草稿(内容全量)+ 传背景图,全部留在 draft 等人工上架。
// 幂等:重复执行时已存在的 slug 走更新,已有背景图的跳过资产上传(--force-assets 可强制重传)。
//
// 用法(仓库根目录执行):
//   node platform/deploy/upload-skins.mjs --skins-dir images/generated-skins \
//        [--base http://127.0.0.1:8080] [--username admin] [--password codress123] [--only slug1,slug2] [--force-assets]
import fs from "node:fs";
import path from "node:path";

const args = { base: "http://127.0.0.1:8080", username: "admin", password: "codress123", token: process.env.ADMIN_TOKEN };
{
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--base") args.base = argv[++i].replace(/\/+$/, "");
    else if (k === "--username") args.username = argv[++i];
    else if (k === "--password") args.password = argv[++i];
    else if (k === "--token") args.token = argv[++i];
    else if (k === "--skins-dir") args.skinsDir = argv[++i];
    else if (k === "--only") args.only = argv[++i].split(",").map((s) => s.trim());
    else if (k === "--force-assets") args.forceAssets = true;
    else { console.error(`unknown arg: ${k}`); process.exit(1); }
  }
  if (!args.skinsDir) { console.error("--skins-dir required"); process.exit(1); }
}

const settings = JSON.parse(fs.readFileSync(path.join(args.skinsDir, "skin-settings.json"), "utf8"));
const content = JSON.parse(fs.readFileSync(path.join(args.skinsDir, "admin-content.json"), "utf8"));

let token = "";
async function api(method, url, body, isForm) {
  const headers = { Authorization: `Bearer ${token}` };
  if (body && !isForm) headers["Content-Type"] = "application/json";
  const resp = await fetch(`${args.base}${url}`, {
    method,
    headers,
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60_000),
  });
  const text = await resp.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: resp.status, ok: resp.ok, data };
}

function fail(step, resp) {
  console.error(`FAILED at ${step}: HTTP ${resp.status} ${JSON.stringify(resp.data).slice(0, 300)}`);
  process.exit(1);
}

const MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

async function main() {
  // 1) 登录(或直接使用 --token / 环境变量 ADMIN_TOKEN)
  if (args.token) {
    token = args.token;
    const check = await api("GET", "/api/admin/me");
    if (!check.ok) fail("token check", check);
    console.log("token ok (admin)");
  } else {
    const login = await api("POST", "/api/admin/auth/login", { username: args.username, password: args.password });
    if (!login.ok) fail("login", login);
    token = login.data.token;
    console.log(`login ok as ${login.data.username}`);
  }

  // 2) 确保分类存在
  const catResp = await api("GET", "/api/admin/categories");
  const existingCats = (catResp.data.items ?? catResp.data ?? [])
    .filter((c) => c.type === "skin").map((c) => c.slug);
  for (const cat of content.categoriesToEnsure ?? []) {
    if (existingCats.includes(cat.slug)) { console.log(`category ${cat.slug}: exists`); continue; }
    const created = await api("POST", "/api/admin/categories", cat);
    console.log(`category ${cat.slug}: ${created.ok ? "created" : `skip (HTTP ${created.status})`}`);
  }

  // 3) 已有皮肤索引
  const listResp = await api("GET", "/api/admin/skins?pageSize=200");
  if (!listResp.ok) fail("list skins", listResp);
  const existing = new Map((listResp.data.items ?? []).map((s) => [s.slug, s]));

  const defaults = content.defaults ?? {};
  const results = [];
  for (let idx = 0; idx < settings.length; idx++) {
    const setting = settings[idx];
    const slug = setting.id;
    if (args.only && !args.only.includes(slug)) continue;
    const copy = content.skins[slug];
    if (!copy) { console.error(`no content for ${slug}, skip`); results.push({ slug, error: "no content" }); continue; }

    const payload = {
      slug,
      name: setting.name,
      description: copy.description,
      author: defaults.author ?? "Codress Studio",
      category: copy.category,
      targets: setting.targets,
      appearance: setting.appearance,
      art: setting.art,
      colors: setting.colors,
      tagline: copy.tagline,
      quote: copy.quote,
      statusText: copy.statusText,
      brandSubtitle: defaults.brandSubtitle ?? "CODRESS",
      projectPrefix: defaults.projectPrefix ?? "选择项目 · ",
      projectLabel: defaults.projectLabel ?? "◉  选择项目",
      sort: (defaults.sortBase ?? 300) + idx,
    };

    // 建草稿或更新
    let id = existing.get(slug)?.id;
    if (id) {
      const updated = await api("PUT", `/api/admin/skins/${id}`, payload);
      if (!updated.ok) fail(`update ${slug}`, updated);
      console.log(`${slug}: updated (id=${id})`);
    } else {
      const created = await api("POST", "/api/admin/skins", payload);
      if (!created.ok) fail(`create ${slug}`, created);
      id = created.data.id;
      console.log(`${slug}: created (id=${id})`);
    }

    // 传背景图
    const hasBackground = Boolean(existing.get(slug)?.backgroundUrl);
    if (hasBackground && !args.forceAssets) {
      console.log(`${slug}: background exists, skip upload`);
    } else {
      const imagePath = path.join(args.skinsDir, setting.image);
      const ext = path.extname(imagePath).toLowerCase();
      const form = new FormData();
      form.append("background", new Blob([fs.readFileSync(imagePath)], { type: MIME[ext] ?? "image/jpeg" }), `${slug}${ext}`);
      const uploaded = await api("POST", `/api/admin/skins/${id}/assets`, form, true);
      if (!uploaded.ok) fail(`upload ${slug}`, uploaded);
      console.log(`${slug}: background uploaded (${uploaded.data.sizeBytes} bytes)`);
    }
    results.push({ slug, id });
  }

  // 4) 终检
  const verify = await api("GET", "/api/admin/skins?pageSize=200");
  const bySlug = new Map((verify.data.items ?? []).map((s) => [s.slug, s]));
  console.log("\nslug".padEnd(33) + "id".padEnd(6) + "status".padEnd(11) + "bg  cat");
  let bad = 0;
  for (const { slug } of results) {
    const s = bySlug.get(slug);
    if (!s) { console.log(`${slug.padEnd(32)} MISSING`); bad++; continue; }
    const okBg = Boolean(s.backgroundUrl);
    const okContent = Boolean(s.description && s.category && s.tagline);
    if (!okBg || !okContent) bad++;
    console.log(`${slug.padEnd(32)} ${String(s.id).padEnd(5)} ${String(s.status).padEnd(10)} ${okBg ? "Y" : "N"}   ${s.category}${okContent ? "" : "  (content incomplete)"}`);
  }
  console.log(`\n${results.length} processed, ${bad} problems`);
  process.exit(bad ? 2 : 0);
}

main().catch((error) => { console.error(error); process.exit(1); });
