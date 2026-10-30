import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import * as board from '../plugins/board/index.ts'
import { pinnedInstance, withPort } from '../plugins/instance/index.ts'
import { createApp } from '../src/app.ts'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const scratch = join(projectRoot, '.acrylblends', 'test')
mkdirSync(scratch, { recursive: true })

test('board: page, new card, toggle done, live state', async () => {
  const home = await mkdtemp(join(scratch, 'board-test-'))
  const app = await createApp(withPort(pinnedInstance(home, { root: projectRoot }), 0), { listen: false })
  try {
    // The extensions plugin starts every folder of plugins/ at boot, so the board is already mounted.
    const router = app.root.router
    const post = (path: string, body: unknown) =>
      router.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const cards = () => app.root.state.find<board.Card[]>('board.cards')!.get()

    const page = await router.request('/board')
    assert.equal(page.status, 200)
    assert.match(await page.text(), /New card/)

    const before = cards().length
    const created = await post('/board/cards', { title: '  Ship it  ' })
    assert.equal(created.status, 201)
    const card = (await created.json()) as board.Card
    assert.deepEqual({ title: card.title, owner: card.owner, column: card.column }, { title: 'Ship it', owner: board.ME, column: 'backlog' })
    assert.equal(cards().length, before + 1)

    assert.equal((await post(`/board/cards/${card.id}`, { done: true })).status, 200)
    assert.equal(cards().find((c) => c.id === card.id)?.column, 'done')
    assert.equal((await post(`/board/cards/${card.id}`, { done: false })).status, 200)
    assert.equal(cards().find((c) => c.id === card.id)?.column, 'backlog')

    assert.equal((await post(`/board/cards/${card.id}`, { done: 'yes' })).status, 400)
    assert.equal((await post('/board/cards/nope', { done: true })).status, 404)

    const live = await router.request('/api/state/board.cards')
    assert.equal(((await live.json()) as { value: board.Card[] }).value.length, before + 1)
  } finally {
    await app.stop()
    await rm(home, { recursive: true, force: true })
  }
})
