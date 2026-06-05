// POST   /api/blog/admin          — create/update a post
// DELETE /api/blog/admin          — delete a post  { slug }
// GET    /api/blog/admin          — admin UI (HTML)
// GET    /api/blog/admin?list=1   — list all posts (JSON, admin auth)
// GET    /api/blog/admin?load=<slug> — fetch any post incl. drafts (JSON, admin auth)
//
// Authentication (tried in order):
//   1. Cloudflare Access — Cf-Access-Authenticated-User-Email header (cannot be spoofed)
//   2. Bearer token      — Authorization: Bearer <BLOG_ADMIN_SECRET>
//   3. Open (dev only)   — no auth configured; logs a warning

import { upsertBlogPost, listAllBlogPostsAdmin, getBlogPostAdmin, deleteBlogPost } from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

function isAuthed(ctx: Parameters<PagesFunction<Env>>[0]): boolean {
  if (ctx.request.headers.get("Cf-Access-Authenticated-User-Email")) return true;
  const secret = ctx.env.BLOG_ADMIN_SECRET;
  if (secret) {
    const auth = ctx.request.headers.get("Authorization") ?? "";
    const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    return provided === secret;
  }
  return true; // open in dev
}

function authError(): Response {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);

  if (url.searchParams.has("list")) {
    if (!isAuthed(ctx)) return authError();
    const posts = await listAllBlogPostsAdmin(ctx.env.DB);
    return Response.json(posts, { headers: { "Cache-Control": "no-store" } });
  }

  const loadSlug = url.searchParams.get("load");
  if (loadSlug) {
    if (!isAuthed(ctx)) return authError();
    const post = await getBlogPostAdmin(ctx.env.DB, loadSlug);
    if (!post) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json(post, { headers: { "Cache-Control": "no-store" } });
  }

  return new Response(adminHtml, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  if (!isAuthed(ctx)) return authError();

  let body: Record<string, unknown>;
  try {
    body = (await ctx.request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const bodyHtml = typeof body.bodyHtml === "string" ? body.bodyHtml : "";
  const bodyMd = typeof body.bodyMd === "string" ? body.bodyMd : null;
  const status = body.status === "published" ? "published" : "draft";
  const author = typeof body.author === "string" ? body.author.trim() : "";
  const ogImage = typeof body.ogImage === "string" ? body.ogImage.trim() : null;
  const publishedAt = typeof body.publishedAt === "string" ? body.publishedAt : null;

  if (!slug || !title) {
    return Response.json({ error: "slug and title are required" }, { status: 400 });
  }

  await upsertBlogPost(ctx.env.DB, {
    slug,
    title,
    description,
    bodyHtml,
    bodyMd,
    status,
    author,
    ogImage,
    publishedAt: status === "published" ? (publishedAt ?? new Date().toISOString()) : publishedAt,
  });

  return Response.json({ ok: true, slug }, { headers: { "Cache-Control": "no-store" } });
};

export const onRequestDelete: PagesFunction<Env> = async (ctx) => {
  if (!isAuthed(ctx)) return authError();

  let body: Record<string, unknown>;
  try {
    body = (await ctx.request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  if (!slug) return Response.json({ error: "slug required" }, { status: 400 });

  await deleteBlogPost(ctx.env.DB, slug);
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
};

const adminHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Blog Admin — NobodyNamed</title>
<link rel="stylesheet" href="/assets/style.css">
<script src="https://cdn.jsdelivr.net/npm/marked@12/marked.min.js"></script>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; height: 100vh; overflow: hidden; }
  .admin-shell {
    display: grid;
    grid-template-columns: 260px 1fr;
    grid-template-rows: 48px 1fr;
    height: 100vh;
    font-family: var(--sans);
  }

  /* ── top bar ── */
  .top-bar {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0 1rem;
    border-bottom: 1px solid var(--rule);
    background: var(--surface);
  }
  .top-bar .brand-logo { height: 22px; }
  .top-bar h1 { font-size: 0.95rem; margin: 0; font-weight: 600; color: var(--ink); flex: 1; }
  .top-bar .save-row { display: flex; gap: 0.5rem; }
  .btn {
    padding: 0.4rem 0.9rem; border: 1px solid var(--rule); border-radius: var(--radius);
    font-family: var(--sans); font-size: 0.85rem; cursor: pointer;
    background: var(--surface); color: var(--ink);
  }
  .btn:hover { background: var(--surface-2); }
  .btn-primary { background: var(--ink); color: var(--paper); border-color: var(--ink); }
  .btn-primary:hover { background: var(--accent); border-color: var(--accent); }
  .btn-danger { background: #c0392b; color: #fff; border-color: #c0392b; }
  .btn-danger:hover { background: #962d22; }

  /* ── sidebar ── */
  .sidebar {
    border-right: 1px solid var(--rule);
    overflow-y: auto;
    background: var(--surface);
    display: flex;
    flex-direction: column;
  }
  .sidebar-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.6rem 0.75rem;
    border-bottom: 1px solid var(--rule);
    position: sticky;
    top: 0;
    background: var(--surface);
    z-index: 1;
  }
  .sidebar-head span { font-size: 0.78rem; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
  .post-list { flex: 1; }
  .post-group-label {
    padding: 0.5rem 0.75rem 0.2rem;
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .post-item {
    padding: 0.45rem 0.75rem;
    cursor: pointer;
    border-left: 3px solid transparent;
    font-size: 0.83rem;
    line-height: 1.3;
    color: var(--ink);
  }
  .post-item:hover { background: var(--surface-2); }
  .post-item.active { background: var(--surface-2); border-left-color: var(--accent); }
  .post-item .pi-title { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .post-item .pi-date { font-size: 0.72rem; color: var(--muted); margin-top: 1px; }
  .post-item .pi-badge {
    display: inline-block; font-size: 0.65rem; padding: 1px 5px;
    border-radius: 9px; vertical-align: middle; margin-left: 4px;
    background: var(--surface-2); color: var(--muted); border: 1px solid var(--rule);
  }
  .post-item .pi-badge.pub { background: #e6f9ee; color: #217a44; border-color: #b4dfc5; }

  /* ── editor area ── */
  .editor-area {
    display: grid;
    grid-template-rows: auto 1fr;
    overflow: hidden;
  }
  .meta-bar {
    padding: 0.65rem 1rem;
    border-bottom: 1px solid var(--rule);
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem 0.75rem;
    background: var(--surface);
  }
  .meta-bar input, .meta-bar select {
    width: 100%;
    padding: 0.35rem 0.5rem;
    border: 1px solid var(--rule);
    border-radius: var(--radius);
    font-family: var(--sans);
    font-size: 0.85rem;
    background: var(--paper);
    color: var(--ink);
  }
  .meta-bar input:focus, .meta-bar select:focus { outline: 2px solid var(--accent); border-color: var(--accent); }
  .meta-bar .full { grid-column: 1 / -1; }
  .meta-label { font-size: 0.72rem; color: var(--muted); margin-bottom: 2px; }
  .meta-field { display: flex; flex-direction: column; }

  /* ── split pane ── */
  .split-pane {
    display: grid;
    grid-template-columns: 1fr 1fr;
    overflow: hidden;
    height: 100%;
  }
  .split-pane.single .preview-pane { display: none; }
  .split-pane.single .write-pane { grid-column: 1 / -1; }
  .split-pane.preview-only .write-pane { display: none; }
  .split-pane.preview-only .preview-pane { grid-column: 1 / -1; }

  .write-pane, .preview-pane {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    height: 100%;
  }
  .pane-toolbar {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.3rem 0.5rem;
    border-bottom: 1px solid var(--rule);
    background: var(--surface);
    flex-shrink: 0;
  }
  .pane-toolbar .mode-tabs { display: flex; gap: 0; margin-left: auto; }
  .mode-tab {
    padding: 0.2rem 0.6rem;
    font-size: 0.78rem;
    border: 1px solid var(--rule);
    cursor: pointer;
    background: var(--surface);
    color: var(--muted);
    font-family: var(--sans);
  }
  .mode-tab:first-child { border-radius: var(--radius) 0 0 var(--radius); }
  .mode-tab:last-child { border-radius: 0 var(--radius) var(--radius) 0; border-left: none; }
  .mode-tab.active { background: var(--ink); color: var(--paper); border-color: var(--ink); }

  .tb-btn {
    padding: 0.15rem 0.4rem;
    border: 1px solid transparent;
    border-radius: 3px;
    background: none;
    font-family: var(--mono);
    font-size: 0.82rem;
    cursor: pointer;
    color: var(--ink);
  }
  .tb-btn:hover { background: var(--surface-2); border-color: var(--rule); }
  .tb-sep { width: 1px; height: 16px; background: var(--rule); margin: 0 0.1rem; flex-shrink: 0; }

  #write-area {
    flex: 1;
    resize: none;
    border: none;
    outline: none;
    padding: 1rem;
    font-family: var(--mono);
    font-size: 0.9rem;
    line-height: 1.65;
    background: var(--paper);
    color: var(--ink);
    overflow-y: auto;
  }
  .preview-pane { border-left: 1px solid var(--rule); }
  #preview-area {
    flex: 1;
    overflow-y: auto;
    padding: 1rem 1.25rem;
    background: var(--paper);
    color: var(--ink);
  }
  #preview-area h1,h2,h3 { line-height: 1.2; }
  #preview-area img { max-width: 100%; }
  #preview-area pre { background: var(--surface); padding: 0.75rem; border-radius: var(--radius); overflow-x: auto; }
  #preview-area code { font-family: var(--mono); font-size: 0.88em; }
  #preview-area blockquote { border-left: 3px solid var(--accent); margin: 0; padding-left: 1rem; color: var(--muted); }

  /* ── status bar ── */
  #status-bar {
    grid-column: 1 / -1;
    padding: 0.3rem 0.75rem;
    font-size: 0.78rem;
    color: var(--muted);
    border-top: 1px solid var(--rule);
    background: var(--surface);
  }
  #status-bar.ok { color: #217a44; }
  #status-bar.err { color: #c0392b; }

  .empty-state {
    display: flex; align-items: center; justify-content: center;
    height: 100%; color: var(--muted); font-size: 0.9rem;
  }
</style>
</head>
<body>
<div class="admin-shell">

  <!-- top bar -->
  <header class="top-bar">
    <a href="/" aria-label="Home"><img class="brand-logo" src="/assets/brand/wordmark.svg" alt="nobodynamed"></a>
    <h1>Blog Admin</h1>
    <div class="save-row">
      <button class="btn" onclick="saveDraft()">Save draft</button>
      <button class="btn btn-primary" onclick="publish()">Publish</button>
      <button class="btn btn-danger" onclick="deletePost()" id="btn-delete" style="display:none">Delete</button>
    </div>
  </header>

  <!-- sidebar -->
  <aside class="sidebar">
    <div class="sidebar-head">
      <span>Posts</span>
      <button class="btn" style="padding:0.2rem 0.6rem;font-size:0.78rem" onclick="newPost()">+ New</button>
    </div>
    <div class="post-list" id="post-list">
      <div style="padding:1rem;font-size:0.82rem;color:var(--muted)">Loading…</div>
    </div>
  </aside>

  <!-- main editor -->
  <div class="editor-area">
    <div class="meta-bar" id="meta-bar">
      <div class="meta-field">
        <div class="meta-label">Slug</div>
        <input id="f-slug" type="text" placeholder="my-post-slug" oninput="slugEdited=true">
      </div>
      <div class="meta-field">
        <div class="meta-label">Status</div>
        <select id="f-status">
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </select>
      </div>
      <div class="meta-field full">
        <div class="meta-label">Title</div>
        <input id="f-title" type="text" placeholder="Post title" oninput="onTitleInput(this.value)">
      </div>
      <div class="meta-field full">
        <div class="meta-label">Description</div>
        <input id="f-description" type="text" placeholder="Short description for search / social sharing">
      </div>
      <div class="meta-field">
        <div class="meta-label">Author</div>
        <input id="f-author" type="text" placeholder="Author name">
      </div>
      <div class="meta-field">
        <div class="meta-label">OG Image URL (optional)</div>
        <input id="f-og-image" type="text" placeholder="/api/og/…">
      </div>
    </div>

    <div class="split-pane" id="split-pane">
      <div class="write-pane">
        <div class="pane-toolbar">
          <button class="tb-btn" onclick="wrap('**','**')" title="Bold">B</button>
          <button class="tb-btn" style="font-style:italic" onclick="wrap('*','*')" title="Italic">I</button>
          <button class="tb-btn" onclick="insertHeading()" title="Heading">H</button>
          <div class="tb-sep"></div>
          <button class="tb-btn" onclick="insertLink()" title="Link">🔗</button>
          <button class="tb-btn" onclick="insertImage()" title="Image">🖼</button>
          <div class="tb-sep"></div>
          <button class="tb-btn" onclick="insertInlineCode()" title="Inline code">&#96;&#96;</button>
          <button class="tb-btn" onclick="insertCodeBlock()" title="Code block">{ }</button>
          <div class="tb-sep"></div>
          <button class="tb-btn" onclick="insertHr()" title="Divider">—</button>
          <div class="mode-tabs">
            <button class="mode-tab active" id="tab-split" onclick="setMode('split')">Split</button>
            <button class="mode-tab" id="tab-write" onclick="setMode('write')">Write</button>
            <button class="mode-tab" id="tab-preview" onclick="setMode('preview')">Preview</button>
          </div>
        </div>
        <textarea id="write-area" spellcheck="true" placeholder="Write in Markdown…" oninput="schedulePreview()"></textarea>
      </div>
      <div class="preview-pane">
        <div class="pane-toolbar" style="justify-content:flex-end">
          <span style="font-size:0.78rem;color:var(--muted)">Preview</span>
        </div>
        <div id="preview-area"></div>
      </div>
    </div>
  </div>

  <div id="status-bar">Ready — Ctrl+S to save draft, Ctrl+Shift+S to publish</div>
</div>

<script>
// ── state ──────────────────────────────────────────────────────────────
let currentSlug = null;
let slugEdited = false;
let previewTimer = null;
let mode = 'split';

// ── init ───────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  loadPostList();
  refreshPreview();
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      e.shiftKey ? publish() : saveDraft();
    }
  });
});

// ── post list ──────────────────────────────────────────────────────────
async function loadPostList() {
  const res = await fetch('/api/blog/admin?list=1');
  if (!res.ok) { document.getElementById('post-list').innerHTML = '<div style="padding:0.75rem;color:#c0392b;font-size:0.82rem">Could not load posts</div>'; return; }
  const posts = await res.json();
  renderPostList(posts);
}

function renderPostList(posts) {
  const el = document.getElementById('post-list');
  if (!posts.length) { el.innerHTML = '<div style="padding:1rem;font-size:0.82rem;color:var(--muted)">No posts yet</div>'; return; }

  const drafts = posts.filter(p => p.status === 'draft');
  const pub = posts.filter(p => p.status === 'published');

  let html = '';
  if (drafts.length) {
    html += '<div class="post-group-label">Drafts</div>';
    html += drafts.map(p => postItem(p)).join('');
  }
  if (pub.length) {
    html += '<div class="post-group-label">Published</div>';
    html += pub.map(p => postItem(p)).join('');
  }
  el.innerHTML = html;
}

function postItem(p) {
  const badge = p.status === 'published'
    ? '<span class="pi-badge pub">live</span>'
    : '<span class="pi-badge">draft</span>';
  const dateStr = p.publishedAt ? new Date(p.publishedAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})
    : 'updated ' + new Date(p.updatedAt).toLocaleDateString('en-US',{month:'short',day:'numeric'});
  const active = p.slug === currentSlug ? ' active' : '';
  return \`<div class="post-item\${active}" onclick="loadPost('\${esc(p.slug)}')">
    <div class="pi-title">\${esc(p.title)}\${badge}</div>
    <div class="pi-date">\${dateStr}</div>
  </div>\`;
}

// ── load / new ─────────────────────────────────────────────────────────
async function loadPost(slug) {
  setStatus('Loading…', '');
  const res = await fetch('/api/blog/admin?load=' + encodeURIComponent(slug));
  if (!res.ok) { setStatus('Failed to load post', 'err'); return; }
  const post = await res.json();
  fillForm(post);
  currentSlug = post.slug;
  slugEdited = true;
  document.getElementById('btn-delete').style.display = '';
  refreshActiveItem();
  setStatus('Loaded: ' + post.slug, '');
}

function fillForm(post) {
  document.getElementById('f-slug').value = post.slug;
  document.getElementById('f-title').value = post.title;
  document.getElementById('f-description').value = post.description;
  document.getElementById('f-author').value = post.author || '';
  document.getElementById('f-og-image').value = post.ogImage || '';
  document.getElementById('f-status').value = post.status;
  // Prefer Markdown source if available; fall back to bodyHtml
  document.getElementById('write-area').value = post.bodyMd || post.bodyHtml || '';
  refreshPreview();
}

function newPost() {
  currentSlug = null;
  slugEdited = false;
  document.getElementById('f-slug').value = '';
  document.getElementById('f-title').value = '';
  document.getElementById('f-description').value = '';
  document.getElementById('f-author').value = '';
  document.getElementById('f-og-image').value = '';
  document.getElementById('f-status').value = 'draft';
  document.getElementById('write-area').value = '';
  document.getElementById('btn-delete').style.display = 'none';
  refreshPreview();
  refreshActiveItem();
  setStatus('New post — fill in the fields above', '');
  document.getElementById('f-title').focus();
}

// ── save ───────────────────────────────────────────────────────────────
function saveDraft() { save('draft'); }
function publish() { save('published'); }

async function save(status) {
  const slug = document.getElementById('f-slug').value.trim();
  const title = document.getElementById('f-title').value.trim();
  if (!slug || !title) { setStatus('Slug and title are required', 'err'); return; }

  const bodyMd = document.getElementById('write-area').value;
  const bodyHtml = String(marked.parse(bodyMd));

  const payload = {
    slug,
    title,
    description: document.getElementById('f-description').value.trim(),
    author: document.getElementById('f-author').value.trim(),
    ogImage: document.getElementById('f-og-image').value.trim() || null,
    status,
    bodyHtml,
    bodyMd,
  };

  setStatus('Saving…', '');
  const res = await fetch('/api/blog/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (res.ok) {
    currentSlug = slug;
    slugEdited = true;
    document.getElementById('f-status').value = status;
    document.getElementById('btn-delete').style.display = '';
    await loadPostList();
    refreshActiveItem();
    const link = status === 'published' ? \` — <a href="/blog/\${encodeURIComponent(slug)}/" target="_blank">view live ↗</a>\` : '';
    setStatus(\`Saved as \${status}\${link}\`, 'ok');
  } else {
    const j = await res.json().catch(() => ({}));
    setStatus('Error: ' + (j.error || res.statusText), 'err');
  }
}

// ── delete ─────────────────────────────────────────────────────────────
async function deletePost() {
  const slug = currentSlug || document.getElementById('f-slug').value.trim();
  if (!slug) return;
  if (!confirm('Delete "' + slug + '"? This cannot be undone.')) return;
  const res = await fetch('/api/blog/admin', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug }),
  });
  if (res.ok) {
    newPost();
    await loadPostList();
    setStatus('Deleted: ' + slug, '');
  } else {
    setStatus('Delete failed', 'err');
  }
}

// ── preview ────────────────────────────────────────────────────────────
function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(refreshPreview, 300);
}

function refreshPreview() {
  const md = document.getElementById('write-area').value;
  document.getElementById('preview-area').innerHTML = String(marked.parse(md));
}

// ── toolbar helpers ────────────────────────────────────────────────────
function wrap(before, after) {
  const ta = document.getElementById('write-area');
  const start = ta.selectionStart, end = ta.selectionEnd;
  const sel = ta.value.slice(start, end);
  const replacement = before + (sel || 'text') + after;
  ta.setRangeText(replacement, start, end, 'select');
  ta.focus();
  schedulePreview();
}

function insertHeading() {
  const ta = document.getElementById('write-area');
  const start = ta.selectionStart;
  const lineStart = ta.value.lastIndexOf('\\n', start - 1) + 1;
  const line = ta.value.slice(lineStart, ta.selectionEnd);
  const m = line.match(/^(#{1,5}) /);
  const prefix = m ? '#'.repeat(Math.min(m[1].length + 1, 6)) + ' ' : '## ';
  ta.setRangeText(prefix, lineStart, lineStart + (m ? m[0].length : 0), 'end');
  ta.focus();
  schedulePreview();
}

function insertLink() {
  const ta = document.getElementById('write-area');
  const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
  const url = prompt('URL:', 'https://');
  if (!url) return;
  const text = sel || 'link text';
  ta.setRangeText('[' + text + '](' + url + ')', ta.selectionStart, ta.selectionEnd, 'end');
  ta.focus();
  schedulePreview();
}

function insertImage() {
  const ta = document.getElementById('write-area');
  const url = prompt('Image URL:', 'https://');
  if (!url) return;
  const alt = prompt('Alt text:', '') || '';
  ta.setRangeText('![' + alt + '](' + url + ')', ta.selectionStart, ta.selectionEnd, 'end');
  ta.focus();
  schedulePreview();
}

function insertInlineCode() {
  var bt = String.fromCharCode(96);
  wrap(bt, bt);
}

function insertCodeBlock() {
  var bt = String.fromCharCode(96).repeat(3);
  const ta = document.getElementById('write-area');
  const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
  ta.setRangeText('\\n' + bt + '\\n' + (sel || 'code here') + '\\n' + bt + '\\n', ta.selectionStart, ta.selectionEnd, 'end');
  ta.focus();
  schedulePreview();
}

function insertHr() {
  const ta = document.getElementById('write-area');
  ta.setRangeText('\\n\\n---\\n\\n', ta.selectionStart, ta.selectionEnd, 'end');
  ta.focus();
  schedulePreview();
}

// ── mode (split / write / preview) ────────────────────────────────────
function setMode(m) {
  mode = m;
  const sp = document.getElementById('split-pane');
  sp.className = 'split-pane' + (m !== 'split' ? ' ' + (m === 'write' ? 'single' : 'preview-only') : '');
  ['split','write','preview'].forEach(id => {
    document.getElementById('tab-' + id).classList.toggle('active', id === m);
  });
}

// ── slug auto-gen ──────────────────────────────────────────────────────
function onTitleInput(val) {
  if (!slugEdited) {
    document.getElementById('f-slug').value = toSlug(val);
  }
}

function toSlug(s) {
  return s.toLowerCase().trim()
    .replace(/[^a-z0-9\\s-]/g, '')
    .replace(/\\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

// ── helpers ────────────────────────────────────────────────────────────
function setStatus(msg, cls) {
  const el = document.getElementById('status-bar');
  el.innerHTML = msg;
  el.className = cls || '';
}

function refreshActiveItem() {
  document.querySelectorAll('.post-item').forEach(el => {
    el.classList.toggle('active', el.getAttribute('onclick') === \`loadPost('\${esc(currentSlug)}')\`);
  });
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/'/g,'&#39;');
}
</script>
</body>
</html>`;
