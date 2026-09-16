import { useEffect, useState } from 'react';
import { IconPlus, IconQuote, IconTrash } from '@tabler/icons-react';
import { api, ApiError } from '../api/client';
import { useToast } from '../components/ui/Toast';
import type { Quote } from '../types';

// A simple running list of quotes Brent wants to keep and refer back to --
// no folders/tags, just capture-and-browse. Also the first of "Brent's
// Zone"'s two pages meant as a landing spot for a future Hermes agent
// integration (Brent's mentioned wanting to message Hermes and have it add
// data here) -- the plain POST /api/quotes shape is what that integration
// would call, so nothing here needs to change to support it later.
export default function Quotes() {
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const [text, setText] = useState('');
  const [author, setAuthor] = useState('');
  const [source, setSource] = useState('');
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  function load() {
    api
      .get<Quote[]>('/quotes')
      .then(setQuotes)
      .catch(() => {
        toast('Failed to load quotes', true);
        setQuotes([]);
      });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addQuote() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await api.post('/quotes', {
        text: trimmed,
        author: author.trim() || null,
        source: source.trim() || null,
      });
      setText('');
      setAuthor('');
      setSource('');
      toast('Quote saved');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to save quote', true);
    } finally {
      setSaving(false);
    }
  }

  async function removeQuote(id: string) {
    try {
      await api.delete(`/quotes/${id}`);
      setQuotes((prev) => (prev ? prev.filter((q) => q.id !== id) : prev));
    } catch {
      toast('Failed to delete quote', true);
    }
  }

  return (
    <>
      <div className="ph">
        <div>
          <h1>Quotes</h1>
          <p>Things worth remembering, all in one place</p>
        </div>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <div className="fg">
          <label className="fl">Quote</label>
          <textarea
            className="fi"
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type or paste the quote..."
          />
        </div>
        <div className="fr">
          <div className="fg">
            <label className="fl">Author</label>
            <input className="fi" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Optional" />
          </div>
          <div className="fg">
            <label className="fl">Source</label>
            <input
              className="fi"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="Book, podcast, person who said it..."
            />
          </div>
        </div>
        <button className="btn btn-p btn-sm" disabled={saving || !text.trim()} onClick={addQuote}>
          <IconPlus size={14} /> Save quote
        </button>
      </div>

      {quotes === null ? (
        <div className="empty">
          <div className="empty-t">Loading…</div>
        </div>
      ) : quotes.length === 0 ? (
        <div className="empty">
          <IconQuote size={32} color="var(--t3)" style={{ display: 'block', margin: '0 auto 12px' }} />
          <div className="empty-t">No quotes saved yet</div>
        </div>
      ) : (
        quotes.map((q) => (
          <div key={q.id} className="card" style={{ padding: '16px 20px', marginBottom: 12, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <IconQuote size={18} color="var(--t3)" style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14.5, lineHeight: 1.5 }}>{q.text}</div>
              {(q.author || q.source) && (
                <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 6 }}>
                  {q.author ? `— ${q.author}` : null}
                  {q.author && q.source ? ', ' : null}
                  {q.source || null}
                </div>
              )}
            </div>
            <button className="btn btn-ghost btn-sm" title="Delete" onClick={() => removeQuote(q.id)}>
              <IconTrash size={14} />
            </button>
          </div>
        ))
      )}
    </>
  );
}
