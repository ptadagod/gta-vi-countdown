// Road to a Billion: GTA V story-mode checklist (assassinations + stock market).
// Progress is kept in this browser's localStorage.

import './style.css'

const STEPS = [
  {
    id: 'hotel',
    title: 'The Hotel Assassination',
    who: 'Franklin',
    when: 'As soon as Lester offers it',
    est: 300_000,
    before: { ticker: 'BET', name: 'Betta Pharmaceuticals', ex: 'LCN', note: "Put all of Franklin's money in." },
    play: 'Kill Bilkington CEO Brett Lowrey at the hotel.',
    after: 'Sleep or switch characters until BET is up around 80%, then sell everything.',
  },
  {
    id: 'hotel-rebound',
    title: 'Bilkington rebound',
    who: 'Franklin',
    when: 'Straight after selling BET',
    est: 450_000,
    before: { ticker: 'BIL', name: 'Bilkington Research', ex: 'LCN', note: 'Buy while it is low after the CEO’s death.' },
    play: 'No mission, just let time pass.',
    after: 'Sell once BIL has recovered. Keep the cash; do not do the other assassinations yet.',
  },
  {
    id: 'big-score',
    title: 'The Big Score',
    who: 'Michael · Franklin · Trevor',
    when: 'Last heist of the story',
    est: 90_000_000,
    play: 'Pick the cheapest crew that can still do the job: every percent they take is money you can’t invest. Avoid buying properties or cars until the end.',
    after: 'Each character should end up with tens of millions.',
  },
  {
    id: 'ending',
    title: 'Finish the story: Option C',
    who: 'Franklin',
    when: 'Final mission',
    est: 90_000_000,
    play: 'Choose "Deathwish" (Option C) so Michael and Trevor both survive. You need all three bank accounts.',
    after: 'The remaining four assassinations are still available after the credits.',
  },
  {
    id: 'multi',
    title: 'The Multi Target Assassination',
    who: 'Franklin',
    when: 'After the ending',
    est: 160_000_000,
    before: { ticker: 'DEB', name: 'Debonaire', ex: 'LCN', note: 'All three characters invest everything.' },
    play: 'Take out the four targets.',
    after: 'Wait until DEB is up around 80%, then sell with every character.',
  },
  {
    id: 'vice',
    title: 'The Vice Assassination',
    who: 'Franklin',
    when: 'After Multi Target',
    est: 240_000_000,
    before: { ticker: 'FRT', name: 'Fruit', ex: 'BAWSAQ', note: 'All three characters invest everything.' },
    play: 'Kill Facade CEO Jackson Skinner.',
    after: 'Sell FRT when it peaks (roughly +50%).',
  },
  {
    id: 'vice-rebound',
    title: 'Facade rebound',
    who: 'Michael · Franklin · Trevor',
    when: 'Straight after selling FRT',
    est: 300_000_000,
    before: { ticker: 'FAC', name: 'Facade', ex: 'BAWSAQ', note: 'Buy the dip.' },
    play: 'No mission, just let time pass.',
    after: 'Sell once FAC has recovered.',
  },
  {
    id: 'bus',
    title: 'The Bus Assassination',
    who: 'Franklin',
    when: 'After Vice',
    est: 540_000_000,
    before: { ticker: 'VAP', name: 'Vapid', ex: 'LCN', note: 'All three characters invest everything.' },
    play: 'Kill Maibatsu CEO Isaac Penny on the bus.',
    after: 'Wait until VAP is up around 80%, then sell.',
  },
  {
    id: 'bus-rebound',
    title: 'Maibatsu rebound',
    who: 'Michael · Franklin · Trevor',
    when: 'Straight after selling VAP',
    est: 650_000_000,
    before: { ticker: 'MAI', name: 'Maibatsu', ex: 'LCN', note: 'Buy while it is low.' },
    play: 'No mission, just let time pass.',
    after: 'Sell once MAI has recovered.',
  },
  {
    id: 'construction',
    title: 'The Construction Assassination',
    who: 'Franklin',
    when: 'Last of Lester’s jobs',
    est: 1_100_000_000,
    before: { ticker: 'GCD', name: 'GoldCoast Development', ex: 'LCN', note: 'All three characters invest everything.' },
    play: 'Kill the target at the construction site.',
    after: 'Wait until GCD is up around 80%, then sell. That should put you past a billion.',
  },
  {
    id: 'billionaire',
    title: 'Billionaire',
    who: 'Michael · Franklin · Trevor',
    when: 'Done',
    est: 1_100_000_000,
    play: 'Check the three bank balances and add them up. Now buy every property in Los Santos.',
  },
]

const GOAL = 1_000_000_000
const KEY_DONE = 'billion:done'
const KEY_MINE = 'billion:mine'

const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key)
      return raw == null ? fallback : JSON.parse(raw)
    } catch {
      return fallback
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* storage unavailable: progress lasts for this visit only */
    }
  },
}

let done = new Set(store.get(KEY_DONE, []))
let mine = store.get(KEY_MINE, null)

const $ = (id) => document.getElementById(id)
const el = (tag, cls, text) => {
  const node = document.createElement(tag)
  if (cls) node.className = cls
  if (text != null) node.textContent = text
  return node
}

const fmt = (n) => {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(n % 1e9 === 0 ? 0 : 2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1)}M`
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`
  return `$${n}`
}

const nextStep = () => STEPS.find((s) => !done.has(s.id))

function estimate() {
  let est = 0
  for (const s of STEPS) if (done.has(s.id)) est = Math.max(est, s.est)
  return est
}

function stockLine(before) {
  const p = el('p', 'stock')
  const chip = el('span', 'ticker', before.ticker)
  p.append(chip, ` ${before.name} `, el('span', 'ex', before.ex))
  return p
}

function renderBank() {
  const real = mine != null && mine > 0
  const cash = real ? mine : estimate()
  const pct = Math.min(100, (cash / GOAL) * 100)
  $('bank-label').textContent = real ? 'Your combined cash' : 'Estimated combined cash'
  $('cash').textContent = fmt(cash)
  $('pct').textContent = `${pct < 1 && pct > 0 ? pct.toFixed(2) : Math.floor(pct)}%`
  $('fill').style.width = `${Math.max(pct, cash > 0 ? 0.6 : 0)}%`
  $('bar').setAttribute('aria-valuenow', String(Math.round(pct)))
  document.body.classList.toggle('rich', cash >= GOAL)
}

function renderNext() {
  const box = $('next')
  box.replaceChildren()
  const step = nextStep()

  if (!step) {
    box.classList.add('complete')
    box.append(
      el('p', 'next-kicker', 'All missions complete'),
      el('h2', 'next-title', 'You’re a billionaire'),
      el('p', 'next-play', 'Every step is ticked off. Reset below to plan another playthrough.'),
    )
    return
  }
  box.classList.remove('complete')

  const idx = STEPS.indexOf(step)
  box.append(
    el('p', 'next-kicker', `Next mission · ${idx + 1} of ${STEPS.length}`),
    el('h2', 'next-title', step.title),
    el('p', 'next-meta', `${step.who} · ${step.when}`),
  )

  const grid = el('div', 'next-grid')
  if (step.before) {
    const b = el('div', 'phase')
    b.append(el('p', 'phase-label', 'Before: invest'), stockLine(step.before), el('p', 'phase-text', step.before.note))
    grid.append(b)
  }
  const p = el('div', 'phase')
  p.append(el('p', 'phase-label', step.before ? 'Then' : 'Do this'), el('p', 'phase-text', step.play))
  grid.append(p)
  if (step.after) {
    const a = el('div', 'phase')
    a.append(el('p', 'phase-label', 'After'), el('p', 'phase-text', step.after))
    grid.append(a)
  }
  box.append(grid)

  const btn = el('button', 'complete-btn', 'Mark mission complete')
  btn.type = 'button'
  btn.addEventListener('click', () => toggle(step.id, true))
  box.append(btn)
}

function renderTimeline() {
  const list = $('timeline')
  list.replaceChildren()
  const current = nextStep()

  STEPS.forEach((s, i) => {
    const li = el('li', 'item')
    if (done.has(s.id)) li.classList.add('done')
    if (current && s.id === current.id) li.classList.add('current')

    const label = el('label', 'item-row')
    const box = el('input')
    box.type = 'checkbox'
    box.checked = done.has(s.id)
    box.addEventListener('change', () => toggle(s.id, box.checked))

    const body = el('span', 'item-body')
    const title = el('span', 'item-title', s.title)
    const meta = el('span', 'item-meta', s.before ? `${s.before.ticker} · ${s.who}` : s.who)
    body.append(title, meta)

    label.append(box, el('span', 'item-num', String(i + 1).padStart(2, '0')), body, el('span', 'item-est', fmt(s.est)))
    li.append(label)
    list.append(li)
  })

  $('count').textContent = `${done.size} / ${STEPS.length} done`
}

let passedTimer
function showPassed() {
  const step = nextStep()
  $('passed-next').textContent = step ? `Next: ${step.title}` : 'You’re a billionaire'
  const banner = $('passed')
  banner.hidden = false
  banner.classList.remove('show')
  void banner.offsetWidth
  banner.classList.add('show')
  clearTimeout(passedTimer)
  passedTimer = setTimeout(() => (banner.hidden = true), 2600)
}

function toggle(id, on) {
  if (on) done.add(id)
  else done.delete(id)
  store.set(KEY_DONE, [...done])
  render()
  if (on) {
    showPassed()
    $('next').scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

function render() {
  renderBank()
  renderNext()
  renderTimeline()
}

const mineInput = $('mine')
if (mine) mineInput.value = mine.toLocaleString('en-US')
mineInput.addEventListener('input', () => {
  const digits = mineInput.value.replace(/[^\d]/g, '')
  mine = digits ? Number(digits) : null
  store.set(KEY_MINE, mine)
  renderBank()
})
mineInput.addEventListener('blur', () => {
  if (mine) mineInput.value = mine.toLocaleString('en-US')
})

$('reset').addEventListener('click', () => {
  if (!confirm('Untick every mission?')) return
  done = new Set()
  store.set(KEY_DONE, [])
  render()
})

render()
