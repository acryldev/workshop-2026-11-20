import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from 'acrylblends'
import { bodyLimit } from 'acrylblends/body-limit'
import { csrf } from 'acrylblends/csrf'

export const name = 'board'
export const inject = ['router', 'state']

export type Column = 'backlog' | 'doing' | 'done'
export interface Card {
  id: string
  title: string
  owner: string
  column: Column
}

// ponytail: no sign-in in this app, so "mine" means owner === 'me'; swap for the signed-in user when there is one.
export const ME = 'me'

// ponytail: the cards live in memory (a state cell) and reset on restart; keep them in the db or kv port when they must survive one.
const SEED: Card[] = [
  { id: 'seed-1', title: 'Write release notes', owner: ME, column: 'backlog' },
  { id: 'seed-2', title: 'Sketch onboarding flow', owner: 'Sam', column: 'backlog' },
  { id: 'seed-3', title: 'Fix login redirect', owner: ME, column: 'doing' },
  { id: 'seed-4', title: 'Review pricing page', owner: 'Alex', column: 'doing' },
  { id: 'seed-5', title: 'Set up CI', owner: ME, column: 'done' },
]

const body = (c: { req: { json(): Promise<unknown> } }) =>
  c.req.json().then(
    (value) => (typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}),
    () => ({}) as Record<string, unknown>,
  )

export function apply(ctx: Context) {
  const cards = ctx.state.cell<Card[]>('board.cards', SEED)
  const app = new Acryl()
    .use(bodyLimit({ maxSize: 4 * 1024 }), csrf())
    .get('/', (c) => c.html(PAGE))
    .post('/cards', async (c) => {
      const { title } = await body(c)
      const text = typeof title === 'string' ? title.trim().slice(0, 200) : ''
      const card: Card = { id: crypto.randomUUID(), title: text || 'Untitled card', owner: ME, column: 'backlog' }
      cards.update((list) => [...list, card])
      return c.json(card, 201)
    })
    .post('/cards/:id', async (c) => {
      const { done } = await body(c)
      if (typeof done !== 'boolean') return c.json({ error: 'done must be true or false' }, 400)
      const id = c.req.param('id')
      if (!cards.get().some((card) => card.id === id)) return c.json({ error: 'no such card' }, 404)
      // ponytail: unchecking sends a card back to backlog; remember its last column if people want it back in doing.
      const column: Column = done ? 'done' : 'backlog'
      cards.update((list) => list.map((card) => (card.id === id ? { ...card, column } : card)))
      return c.json({ id, column })
    })
  ctx.router.route('/board', app)
}

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Board</title>
<script src="/appearance.js"></script>
<style>
*{box-sizing:border-box}
body{margin:0;font:15px/1.4 system-ui,sans-serif}
button,input{font:inherit;color:inherit}
button{background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:.35rem .75rem;cursor:pointer}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
header{display:flex;gap:.75rem;align-items:center;padding:.75rem 1rem;border-bottom:1px solid var(--border)}
header h1{font-size:1.15rem;margin:0 auto 0 0}
header form{display:flex;gap:.5rem}
header input{background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:.35rem .5rem;width:14rem}
.primary{background:var(--accent);border-color:var(--accent);color:var(--bg);font-weight:600}
.layout{display:flex;min-height:calc(100vh - 3.6rem)}
aside{width:13rem;flex:none;padding:1rem;background:var(--surface);border-right:1px solid var(--border)}
aside h2{margin-bottom:.75rem}
aside button{display:flex;justify-content:space-between;width:100%;margin-bottom:.35rem;background:transparent;border-color:transparent;text-align:left}
aside button[aria-pressed=true]{background:var(--bg);border-color:var(--border);font-weight:600}
.count{color:var(--muted);font-variant-numeric:tabular-nums}
main{flex:1;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem;padding:1rem;align-items:start}
section{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:.75rem}
h2{display:flex;justify-content:space-between;font-size:.8rem;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin:0 0 .6rem}
ul{list-style:none;margin:0;padding:0;display:grid;gap:.5rem}
ul:empty::after{content:'No cards';color:var(--muted);font-size:.9rem}
.card{display:flex;justify-content:space-between;align-items:flex-start;gap:.5rem;background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:.55rem .65rem}
.card label{display:flex;gap:.5rem;align-items:flex-start;cursor:pointer}
.card input{margin:.2rem 0 0;accent-color:var(--accent)}
.card.done span{text-decoration:line-through;color:var(--muted)}
.card small{color:var(--muted);white-space:nowrap}
#status{color:var(--muted);margin:0}
@media (max-width:760px){main{grid-template-columns:1fr}}
</style></head><body>
<header>
  <button id="toggle" type="button" aria-controls="sidebar" aria-expanded="true">Filters</button>
  <h1>Board</h1>
  <p id="status" role="status"></p>
  <form id="new"><input name="title" aria-label="Card title" placeholder="Card title (optional)" maxlength="200"><button class="primary">New card</button></form>
</header>
<div class="layout">
  <aside id="sidebar" aria-label="Filters">
    <h2>Filters</h2>
    <button type="button" data-filter="all" aria-pressed="true">All <span class="count" id="count-all">0</span></button>
    <button type="button" data-filter="mine" aria-pressed="false">Mine <span class="count" id="count-mine">0</span></button>
    <button type="button" data-filter="done" aria-pressed="false">Done <span class="count" id="count-done">0</span></button>
  </aside>
  <main>
    <section aria-labelledby="h-backlog"><h2 id="h-backlog">Backlog <span class="count" id="n-backlog">0</span></h2><ul id="col-backlog"></ul></section>
    <section aria-labelledby="h-doing"><h2 id="h-doing">Doing <span class="count" id="n-doing">0</span></h2><ul id="col-doing"></ul></section>
    <section aria-labelledby="h-done"><h2 id="h-done">Done <span class="count" id="n-done">0</span></h2><ul id="col-done"></ul></section>
  </main>
</div>
<script type="module">
import { watch } from '/api/state/client.js'
const ME = ${JSON.stringify(ME)}
const $ = (id) => document.getElementById(id)
const match = { all: () => true, mine: (c) => c.owner === ME, done: (c) => c.column === 'done' }
let cards = []
let filter = 'all'

async function send(path, body) {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => undefined)
  $('status').textContent = res?.ok ? '' : 'Could not save, try again.'
  if (!res?.ok) render()
}

function card(c) {
  const li = document.createElement('li')
  li.className = 'card' + (c.column === 'done' ? ' done' : '')
  const label = document.createElement('label')
  const box = document.createElement('input')
  box.type = 'checkbox'
  box.checked = c.column === 'done'
  box.dataset.id = c.id
  box.addEventListener('change', () => send('/board/cards/' + encodeURIComponent(c.id), { done: box.checked }))
  const title = document.createElement('span')
  title.textContent = c.title
  label.append(box, title)
  const owner = document.createElement('small')
  owner.textContent = c.owner === ME ? 'Me' : c.owner
  li.append(label, owner)
  return li
}

function render() {
  const focused = document.activeElement?.dataset?.id
  for (const f of Object.keys(match)) {
    $('count-' + f).textContent = cards.filter(match[f]).length
    document.querySelector('[data-filter="' + f + '"]').setAttribute('aria-pressed', String(f === filter))
  }
  for (const col of ['backlog', 'doing', 'done']) {
    const shown = cards.filter((c) => c.column === col && match[filter](c))
    $('col-' + col).replaceChildren(...shown.map(card))
    $('n-' + col).textContent = shown.length
  }
  if (focused) document.querySelector('[data-id="' + CSS.escape(focused) + '"]')?.focus()
}

watch('board.cards', (value) => { cards = value; render() }, () => { $('status').textContent = 'Lost the live connection, retrying.' })

for (const b of document.querySelectorAll('[data-filter]')) b.addEventListener('click', () => { filter = b.dataset.filter; render() })
$('toggle').addEventListener('click', () => {
  const open = $('sidebar').hidden
  $('sidebar').hidden = !open
  $('toggle').setAttribute('aria-expanded', String(open))
})
$('new').addEventListener('submit', (event) => {
  event.preventDefault()
  const input = event.target.elements.title
  send('/board/cards', { title: input.value })
  input.value = ''
})
</script>
</body></html>`
