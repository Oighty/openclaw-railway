import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { marked } from 'marked';
import TurndownService from 'turndown';

type TreeNode = { type: 'directory' | 'file'; name: string; path: string; ext?: string; children?: TreeNode[] };
type LoadedFile = { path: string; content: string; ext: string; isMarkdown: boolean; mtimeMs: number; size: number };

const turndown = new TurndownService({ headingStyle: 'atx' });

async function httpJson(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: 'same-origin', ...(opts || {}) });
  const txt = await res.text();
  let body: any = {};
  try { body = JSON.parse(txt); } catch { body = { ok: false, error: txt }; }
  if (!res.ok || body?.ok === false) throw new Error(body?.error || `HTTP ${res.status}`);
  return body;
}

function flatten(nodes: TreeNode[], out: TreeNode[] = []) { for (const n of nodes) { out.push(n); if (n.children) flatten(n.children, out); } return out; }
function isMd(p: string) { return p.toLowerCase().endsWith('.md') || p.toLowerCase().endsWith('.markdown'); }

function App() {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [selected, setSelected] = useState('');
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [status, setStatus] = useState('Loading…');
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [theme, setTheme] = useState<'dark' | 'light'>(() => (localStorage.getItem('files-theme') as any) || 'dark');
  const autosaveTimer = useRef<number | null>(null);
  const [dirty, setDirty] = useState(false);

  const editor = useEditor({ extensions: [StarterKit], content: '<p></p>', immediatelyRender: false });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('files-theme', theme);
  }, [theme]);

  async function loadTree(preferPath?: string) {
    const j = await httpJson('/files/api/tree');
    setTree(j.roots || []);
    const files = flatten(j.roots || []).filter((n) => n.type === 'file');
    const pathFromUrl = decodeURIComponent((window.location.pathname.replace(/^\/files\/?/, '')) || '');
    const target = preferPath || (pathFromUrl && isMd(pathFromUrl) ? pathFromUrl : '') || selected || files[0]?.path;
    if (target) setSelected(target);
  }

  async function loadFile(path: string) {
    setStatus(`Loading ${path}…`);
    const j = await httpJson(`/files/api/file?path=${encodeURIComponent(path)}`);
    const f = j.file as LoadedFile;
    setFile(f);
    const html = await marked.parse(f.content || '');
    editor?.commands.setContent(html || '<p></p>');
    setDirty(false);
    window.history.replaceState({}, '', `/files/${encodeURIComponent(path).replace(/%2F/g, '/')}`);
    setStatus(`Editing ${f.path}`);
  }

  useEffect(() => { loadTree().catch((e) => setStatus(String(e))); }, []);
  useEffect(() => { if (selected && editor) loadFile(selected).catch((e) => setStatus(String(e))); }, [selected, editor]);

  async function save(force = false) {
    if (!file || (!dirty && !force)) return;
    setSaving(true);
    try {
      const html = editor?.getHTML() || '';
      const content = turndown.turndown(html);
      const j = await httpJson('/files/api/file', {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: file.path, content, expectedMtimeMs: file.mtimeMs }),
      });
      setFile({ ...file, content, mtimeMs: j.mtimeMs, size: j.size });
      setDirty(false);
      setStatus(`Saved ${file.path}`);
    } catch (e: any) {
      if (String(e.message || e).includes('File changed on disk')) {
        const reload = confirm('This file changed on disk. Reload latest from disk? Click Cancel to keep your local edits unsaved.');
        if (reload) await loadFile(file.path);
      }
      setStatus(`Save failed: ${String(e.message || e)}`);
    } finally { setSaving(false); }
  }

  useEffect(() => {
    if (!editor) return;
    const onUpdate = () => {
      setDirty(true);
      if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
      autosaveTimer.current = window.setTimeout(() => { save(); }, 1500);
    };
    editor.on('update', onUpdate);
    return () => { editor.off('update', onUpdate); if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current); };
  }, [editor, file?.path, file?.mtimeMs]);

  async function createNode(kind: 'file' | 'directory') {
    const p = prompt(kind === 'file' ? 'Create markdown file path (e.g. life/projects/New.md):' : 'Create directory path:');
    if (!p) return;
    await httpJson('/files/api/create', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: p.trim(), kind, content: kind === 'file' ? '# New note\n' : '' }),
    });
    await loadTree(p.trim());
  }

  async function renameNode() {
    if (!selected) return;
    const to = prompt('Rename/move to path:', selected);
    if (!to || to === selected) return;
    await httpJson('/files/api/rename', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ from: selected, to }) });
    await loadTree(to);
  }

  async function deleteNode() {
    if (!selected || !confirm(`Delete ${selected}?`)) return;
    await httpJson('/files/api/delete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: selected }) });
    setFile(null); setSelected(''); await loadTree();
  }

  const toolbarBtn = (label: string, onClick: () => void, active?: boolean) => (
    <button onClick={onClick} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--line)', background: active ? 'var(--accent-soft)' : 'var(--panel)', color: 'var(--text)' }}>{label}</button>
  );

  const filteredTree = useMemo(() => {
    if (!search.trim()) return tree;
    const q = search.toLowerCase();
    const filter = (n: TreeNode): TreeNode | null => {
      if (n.type === 'file') return n.name.toLowerCase().includes(q) ? n : null;
      const children = (n.children || []).map(filter).filter(Boolean) as TreeNode[];
      if (children.length || n.name.toLowerCase().includes(q)) return { ...n, children };
      return null;
    };
    return tree.map(filter).filter(Boolean) as TreeNode[];
  }, [tree, search]);

  function renderTree(nodes: TreeNode[], depth = 0): React.ReactNode {
    return nodes.map((n) => (
      <div key={n.path}>
        <div onClick={() => n.type === 'file' && setSelected(n.path)} style={{ marginLeft: depth * 12, padding: '4px 8px', borderRadius: 8, background: selected === n.path ? 'var(--accent-soft)' : 'transparent', cursor: n.type === 'file' ? 'pointer' : 'default', color: n.type === 'directory' ? 'var(--muted)' : 'var(--text)' }}>
          {n.type === 'directory' ? '▸' : '•'} {n.name}
        </div>
        {n.type === 'directory' && n.children ? renderTree(n.children, depth + 1) : null}
      </div>
    ));
  }

  return (
    <>
      <style>{`
        :root[data-theme="dark"]{--bg:#0b0f17;--panel:#111827;--text:#e5e7eb;--muted:#93a3b8;--line:rgba(255,255,255,.12);--accent-soft:rgba(56,189,248,.2)}
        :root[data-theme="light"]{--bg:#f7fafc;--panel:#ffffff;--text:#0f172a;--muted:#475569;--line:rgba(15,23,42,.15);--accent-soft:rgba(14,116,144,.15)}
        body{background:var(--bg);color:var(--text)}
        .ProseMirror{min-height:68vh;outline:none;line-height:1.6}
        .ProseMirror h1,.ProseMirror h2,.ProseMirror h3{margin-top:1em}
      `}</style>
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', height: '100vh' }}>
        <aside style={{ borderRight: '1px solid var(--line)', background: 'var(--panel)', padding: 10, overflow: 'auto' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <button onClick={() => createNode('file')}>New file</button>
            <button onClick={() => createNode('directory')}>New dir</button>
          </div>
          <input placeholder="Search files…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: '100%', marginBottom: 8, padding: 8, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--text)' }} />
          {renderTree(filteredTree)}
        </aside>
        <main style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 10, borderBottom: '1px solid var(--line)', background: 'var(--panel)' }}>
            <strong style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file?.path || 'No file selected'}</strong>
            <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? 'Light' : 'Dark'} mode</button>
            <button onClick={renameNode} disabled={!selected}>Rename</button>
            <button onClick={deleteNode} disabled={!selected}>Delete</button>
            <button onClick={() => save(true)} disabled={!file || saving}>{saving ? 'Saving…' : dirty ? 'Save*' : 'Save'}</button>
          </div>
          <div style={{ padding: '8px 12px', color: 'var(--muted)' }}>{status} · Autosave on (1.5s)</div>
          {file && editor ? (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 12px 10px' }}>
                {toolbarBtn('B', () => editor.chain().focus().toggleBold().run(), editor.isActive('bold'))}
                {toolbarBtn('I', () => editor.chain().focus().toggleItalic().run(), editor.isActive('italic'))}
                {toolbarBtn('H2', () => editor.chain().focus().toggleHeading({ level: 2 }).run(), editor.isActive('heading', { level: 2 }))}
                {toolbarBtn('• List', () => editor.chain().focus().toggleBulletList().run(), editor.isActive('bulletList'))}
                {toolbarBtn('1. List', () => editor.chain().focus().toggleOrderedList().run(), editor.isActive('orderedList'))}
                {toolbarBtn('Quote', () => editor.chain().focus().toggleBlockquote().run(), editor.isActive('blockquote'))}
                {toolbarBtn('Code', () => editor.chain().focus().toggleCodeBlock().run(), editor.isActive('codeBlock'))}
              </div>
              <div style={{ margin: 12, border: '1px solid var(--line)', borderRadius: 10, background: 'var(--panel)', padding: 12 }}><EditorContent editor={editor} /></div>
            </>
          ) : null}
        </main>
      </div>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
