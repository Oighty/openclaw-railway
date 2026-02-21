import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { marked } from 'marked';
import TurndownService from 'turndown';

type TreeNode = { type: 'directory' | 'file'; name: string; path: string; ext?: string; children?: TreeNode[] };

type LoadedFile = {
  path: string;
  content: string;
  ext: string;
  isMarkdown: boolean;
  mtimeMs: number;
  size: number;
};

const turndown = new TurndownService({ headingStyle: 'atx' });

async function httpJson(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: 'same-origin', ...(opts || {}) });
  const txt = await res.text();
  let body: any = {};
  try { body = JSON.parse(txt); } catch { body = { ok: false, error: txt }; }
  if (!res.ok || body?.ok === false) throw new Error(body?.error || `HTTP ${res.status}`);
  return body;
}

function flatten(nodes: TreeNode[], out: TreeNode[] = []) {
  for (const n of nodes) {
    out.push(n);
    if (n.type === 'directory' && n.children) flatten(n.children, out);
  }
  return out;
}

function App() {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [status, setStatus] = useState('Loading…');
  const [saving, setSaving] = useState(false);

  const editor = useEditor({
    extensions: [StarterKit],
    content: '<p></p>',
    immediatelyRender: false,
  });

  const allNodes = useMemo(() => flatten(tree), [tree]);

  async function loadTree(preferPath?: string) {
    const j = await httpJson('/files/api/tree');
    setTree(j.roots || []);
    const files = flatten(j.roots || []).filter((n: TreeNode) => n.type === 'file');
    const target = preferPath || selected || files[0]?.path;
    if (target) setSelected(target);
  }

  async function loadFile(path: string) {
    setStatus(`Loading ${path}…`);
    const j = await httpJson(`/files/api/file?path=${encodeURIComponent(path)}`);
    const f = j.file as LoadedFile;
    setFile(f);
    if (f.isMarkdown) {
      const html = await marked.parse(f.content || '');
      editor?.commands.setContent(html || '<p></p>');
    }
    setStatus(`Editing ${f.path}`);
  }

  useEffect(() => { loadTree().catch((e) => setStatus(String(e))); }, []);
  useEffect(() => { if (selected) loadFile(selected).catch((e) => setStatus(String(e))); }, [selected, editor]);

  async function save() {
    if (!file) return;
    setSaving(true);
    try {
      let content = file.content;
      if (file.isMarkdown) {
        const html = editor?.getHTML() || '';
        content = turndown.turndown(html);
      }
      const j = await httpJson('/files/api/file', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: file.path, content, expectedMtimeMs: file.mtimeMs }),
      });
      setFile({ ...file, content, mtimeMs: j.mtimeMs, size: j.size });
      setStatus(`Saved ${file.path}`);
    } catch (e: any) {
      setStatus(`Save failed: ${String(e.message || e)}`);
    } finally {
      setSaving(false);
    }
  }

  async function createNode(kind: 'file' | 'directory') {
    const p = prompt(`Create ${kind} path (e.g. life/projects/New.md):`);
    if (!p) return;
    await httpJson('/files/api/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: p.trim(), kind, content: kind === 'file' ? '# New file\n' : '' }),
    });
    await loadTree(p.trim());
  }

  async function renameNode() {
    const from = selected;
    if (!from) return;
    const to = prompt('Rename/move to path:', from);
    if (!to || to === from) return;
    await httpJson('/files/api/rename', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ from, to }),
    });
    await loadTree(to);
  }

  async function deleteNode() {
    const p = selected;
    if (!p || !confirm(`Delete ${p}?`)) return;
    await httpJson('/files/api/delete', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: p }),
    });
    setFile(null);
    setSelected('');
    await loadTree();
  }

  function renderTree(nodes: TreeNode[], depth = 0): React.ReactNode {
    return nodes.map((n) => (
      <div key={n.path}>
        <div
          onClick={() => n.type === 'file' && setSelected(n.path)}
          style={{
            padding: '4px 8px',
            marginLeft: depth * 12,
            cursor: n.type === 'file' ? 'pointer' : 'default',
            borderRadius: 6,
            background: selected === n.path ? 'rgba(56,189,248,0.18)' : 'transparent',
            color: n.type === 'directory' ? '#93c5fd' : '#e5e7eb',
          }}
        >
          {n.type === 'directory' ? '📁' : '📄'} {n.name}
        </div>
        {n.type === 'directory' && n.children ? renderTree(n.children, depth + 1) : null}
      </div>
    ));
  }

  const readOnly = file ? !(file.isMarkdown || ['.txt', '.json', '.yml', '.yaml'].includes(file.ext)) : true;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', height: '100vh' }}>
      <div style={{ borderRight: '1px solid rgba(255,255,255,0.1)', padding: 12, overflow: 'auto' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <button onClick={() => createNode('file')}>New file</button>
          <button onClick={() => createNode('directory')}>New dir</button>
        </div>
        {renderTree(tree)}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ padding: 10, borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', gap: 8 }}>
          <strong style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file?.path || 'No file selected'}</strong>
          <button onClick={renameNode} disabled={!selected}>Rename</button>
          <button onClick={deleteNode} disabled={!selected}>Delete</button>
          <button onClick={save} disabled={!file || saving || readOnly}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
        <div style={{ padding: 12, color: '#94a3b8', fontSize: 13 }}>{status} {readOnly && file ? '· read-only file type' : ''}</div>
        <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
          {!file ? null : file.isMarkdown ? (
            <div style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 12 }}>
              <EditorContent editor={editor} />
            </div>
          ) : (
            <textarea
              value={file.content}
              onChange={(e) => setFile({ ...file, content: e.target.value })}
              readOnly={readOnly}
              style={{ width: '100%', height: '75vh', background: '#0b1222', color: '#e5e7eb', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: 12 }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
