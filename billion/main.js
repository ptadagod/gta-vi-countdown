// Road to a Billion: GTA V story-mode checklist, from the Prologue to the credits,
// with Lester's assassinations and the stock market slotted in at the right time.
// Progress is kept in this browser's localStorage.

import './style.css'

const ALL = 'Michael · Franklin · Trevor'

// Story missions in the usual order. The game sometimes offers two or three
// missions at once; any order among those is fine, just tick what you've done.
const story = (chapter, list) =>
  list.map(([id, title, extra = {}]) => ({ id, title, chapter, kind: 'story', ...extra }))

const STEPS = [
  ...story('Act 1 · Franklin & Michael', [
    ['prologue', 'Prologue'],
    ['franklin-lamar', 'Franklin and Lamar'],
    ['repossession', 'Repossession'],
    ['complications', 'Complications'],
    ['chop', 'Chop'],
    ['father-son', 'Father/Son'],
    ['marriage-counseling', 'Marriage Counseling'],
    ['daddys-little-girl', "Daddy's Little Girl"],
    ['friend-request', 'Friend Request'],
    ['casing-jewel', 'Casing the Jewel Store'],
    ['jewel-setup', 'Jewel Store setup', { kind: 'prep', play: 'Bugstars Equipment, plus Carbine Rifles or BZ Gas depending on the approach.' }],
    ['jewel-store', 'The Jewel Store Job', { kind: 'heist', play: 'First heist. From here on Lester can offer Franklin assassination jobs.' }],
    ['long-stretch', 'The Long Stretch'],
  ]),

  // Hotel Assassination: done whenever Lester offers it, not tied to one story slot.
  {
    id: 'hotel',
    title: 'The Hotel Assassination',
    chapter: 'Act 1 · Franklin & Michael',
    kind: 'lester',
    floating: true,
    who: 'Franklin',
    when: "As soon as Lester's L shows up on the map",
    est: 300_000,
    before: { ticker: 'BET', name: 'Betta Pharmaceuticals', ex: 'LCN', note: "Put all of Franklin's money in." },
    play: 'Kill Bilkington CEO Brett Lowrey at the hotel.',
    after: 'Sleep or switch characters until BET is up around 80%, then sell everything.',
  },
  {
    id: 'hotel-rebound',
    title: 'Bilkington rebound',
    chapter: 'Act 1 · Franklin & Michael',
    kind: 'stock',
    floating: true,
    who: 'Franklin',
    when: 'Straight after selling BET',
    est: 450_000,
    before: { ticker: 'BIL', name: 'Bilkington Research', ex: 'LCN', note: 'Buy while it is low after the CEO’s death.' },
    play: 'No mission, just let time pass.',
    after: 'Sell once BIL has recovered.',
  },

  ...story('Act 2 · Trevor arrives', [
    ['mr-philips', 'Mr. Philips'],
    ['tpi', 'Trevor Philips Industries'],
    ['nervous-ron', 'Nervous Ron'],
    ['crystal-maze', 'Crystal Maze'],
    ['friends-reunited', 'Friends Reunited'],
    ['fame-or-shame', 'Fame or Shame'],
    ['dead-man-walking', 'Dead Man Walking'],
    ['threes-company', "Three's Company"],
    ['hood-safari', 'Hood Safari'],
    ['by-the-book', 'By the Book'],
    ['scouting-port', 'Scouting the Port'],
    ['merryweather', 'The Merryweather Heist', { kind: 'heist', play: 'Choose Offshore or Freighter.' }],
    ['blitz-setup', 'Blitz Play setup', { kind: 'prep', play: 'Boiler Suits, Masks, Getaway Vehicle, Tow Truck and Trash Truck.' }],
    ['blitz-play', 'Blitz Play', { kind: 'heist' }],
  ]),

  ...story('Act 3 · Working for the FIB', [
    ['i-fought-the-law', 'I Fought the Law...'],
    ['eye-in-the-sky', 'Eye in the Sky'],
    ['mr-richards', 'Mr. Richards'],
    ['caida-libre', 'Caida Libre'],
    ['deep-inside', 'Deep Inside'],
    ['minor-turbulence', 'Minor Turbulence'],
    ['surveying-score', 'Surveying the Score'],
    ['paleto-setup', 'Paleto Score setup', { kind: 'prep', play: 'Military Hardware.' }],
    ['paleto-score', 'The Paleto Score', { kind: 'heist' }],
    ['predator', 'Predator'],
    ['derailed', 'Derailed'],
    ['monkey-business', 'Monkey Business'],
    ['hang-ten', 'Hang Ten'],
    ['yoga', 'Did Somebody Say Yoga?'],
    ['bury-the-hatchet', 'Bury the Hatchet'],
    ['fresh-meat', 'Fresh Meat'],
    ['ballad-of-rocco', 'The Ballad of Rocco'],
  ]),

  ...story('Act 4 · The Bureau & the Big One', [
    ['cleaning-bureau', 'Cleaning out the Bureau'],
    ['reuniting-family', 'Reuniting the Family'],
    ['architects-plans', "Architect's Plans"],
    ['bureau-setup', 'Bureau Raid setup', { kind: 'prep', play: 'Fire Truck and Getaway Vehicle.' }],
    ['bureau-raid', 'The Bureau Raid', { kind: 'heist' }],
    ['legal-trouble', 'Legal Trouble'],
    ['wrap-up', 'The Wrap Up'],
    ['lamar-down', 'Lamar Down'],
    ['meltdown', 'Meltdown'],
    ['planning-big-score', 'Planning the Big Score'],
    ['big-score-setup', 'Big Score setup', { kind: 'prep', play: 'Gauntlets, plus Stingers, Driller and Sidetracked depending on the approach.' }],
    [
      'big-score',
      'The Big Score',
      {
        kind: 'heist',
        who: ALL,
        est: 90_000_000,
        play: 'Pick the cheapest crew that can still do the job: every percent they take is money you can’t invest. Don’t buy properties or cars yet.',
        after: 'Each character should end up with tens of millions.',
      },
    ],
    [
      'ending',
      'The Third Way (Option C)',
      {
        kind: 'finale',
        who: ALL,
        est: 90_000_000,
        play: 'When Franklin has to choose, pick "Deathwish" (C) so Michael and Trevor both survive. You need all three bank accounts.',
        after: 'Lester’s remaining assassinations are still available after the credits.',
      },
    ],
  ]),

  {
    id: 'multi',
    title: 'The Multi Target Assassination',
    chapter: 'After the credits · Lester’s jobs',
    kind: 'lester',
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
    chapter: 'After the credits · Lester’s jobs',
    kind: 'lester',
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
    chapter: 'After the credits · Lester’s jobs',
    kind: 'stock',
    who: ALL,
    when: 'Straight after selling FRT',
    est: 300_000_000,
    before: { ticker: 'FAC', name: 'Facade', ex: 'BAWSAQ', note: 'Buy the dip.' },
    play: 'No mission, just let time pass.',
    after: 'Sell once FAC has recovered.',
  },
  {
    id: 'bus',
    title: 'The Bus Assassination',
    chapter: 'After the credits · Lester’s jobs',
    kind: 'lester',
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
    chapter: 'After the credits · Lester’s jobs',
    kind: 'stock',
    who: ALL,
    when: 'Straight after selling VAP',
    est: 650_000_000,
    before: { ticker: 'MAI', name: 'Maibatsu', ex: 'LCN', note: 'Buy while it is low.' },
    play: 'No mission, just let time pass.',
    after: 'Sell once MAI has recovered.',
  },
  {
    id: 'construction',
    title: 'The Construction Assassination',
    chapter: 'After the credits · Lester’s jobs',
    kind: 'lester',
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
    chapter: 'After the credits · Lester’s jobs',
    kind: 'finale',
    who: ALL,
    when: 'Done',
    est: 1_100_000_000,
    play: 'Check the three bank balances and add them up. Now buy every property in Los Santos.',
  },
]

const KIND_LABEL = {
  story: 'Story mission',
  prep: 'Heist setup',
  heist: 'Heist',
  finale: 'Finale',
  lester: 'Lester assassination',
  stock: 'Stock move',
}

const GOAL = 1_000_000_000
const KEY_DONE = 'billion:done'
const KEY_MINE = 'billion:mine'
const KEY_OPEN = 'billion:open'

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
const openChapters = new Set(store.get(KEY_OPEN, []))

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

const byId = (id) => STEPS.find((s) => s.id === id)
const isDone = (id) => done.has(id)
const MAIN = STEPS.filter((s) => !s.floating)
const nextStep = () => MAIN.find((s) => !isDone(s.id))
const firstUndoneFloating = () => STEPS.find((s) => s.floating && !isDone(s.id))

function estimate() {
  let est = 0
  for (const s of STEPS) if (s.est && isDone(s.id)) est = Math.max(est, s.est)
  return est
}

// What Lester's assassinations mean right now: do one, hold off, or go.
function lesterAdvice() {
  const pending = firstUndoneFloating()
  const metLester = isDone('jewel-store')
  const storyOver = isDone('ending')

  if (!metLester) {
    return {
      tone: 'wait',
      title: 'Lester’s assassinations: not yet',
      text: 'They unlock for Franklin after The Jewel Store Job. Keep going with the story.',
    }
  }
  if (pending) {
    return {
      tone: 'go',
      title: pending.id === 'hotel' ? 'Do the Hotel Assassination when it appears' : 'Do the Bilkington rebound',
      text:
        pending.id === 'hotel'
          ? 'It’s the one assassination worth doing early. Look for Lester’s L on Franklin’s map. Invest first:'
          : 'You sold BET, now ride the Bilkington recovery:',
      step: pending,
    }
  }
  if (!storyOver) {
    return {
      tone: 'wait',
      title: 'Skip Lester’s other assassinations for now',
      text: 'Multi Target, Vice, Bus and Construction can wait. Do them after The Third Way, when all three characters have their Big Score money to invest. If Lester calls, just ignore it.',
    }
  }
  return {
    tone: 'go',
    title: 'Now do Lester’s assassinations',
    text: 'The story is done and everyone is rich. Work through them in order, investing with all three characters before each one.',
  }
}

function stockLine(before) {
  const p = el('p', 'stock')
  p.append(el('span', 'ticker', before.ticker), ` ${before.name} `, el('span', 'ex', before.ex))
  return p
}

function phases(step) {
  const grid = el('div', 'next-grid')
  if (step.before) {
    const b = el('div', 'phase')
    b.append(el('p', 'phase-label', 'Before: invest'), stockLine(step.before), el('p', 'phase-text', step.before.note))
    grid.append(b)
  }
  if (step.play) {
    const p = el('div', 'phase')
    p.append(el('p', 'phase-label', step.before ? 'Then' : 'Do this'), el('p', 'phase-text', step.play))
    grid.append(p)
  }
  if (step.after) {
    const a = el('div', 'phase')
    a.append(el('p', 'phase-label', 'After'), el('p', 'phase-text', step.after))
    grid.append(a)
  }
  return grid.childElementCount ? grid : null
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

  const idx = MAIN.indexOf(step)
  box.append(
    el('p', 'next-kicker', `Next · ${KIND_LABEL[step.kind]} · ${idx + 1} of ${MAIN.length}`),
    el('h2', 'next-title', step.title),
    el('p', 'next-meta', [step.who, step.when ?? step.chapter].filter(Boolean).join(' · ')),
  )
  const grid = phases(step)
  if (grid) box.append(grid)

  const btn = el('button', 'complete-btn', 'Mark mission complete')
  btn.type = 'button'
  btn.addEventListener('click', () => toggle(step.id, true))
  box.append(btn)
}

function renderLester() {
  const box = $('lester')
  box.replaceChildren()
  const advice = lesterAdvice()
  box.className = `lester ${advice.tone}`
  box.append(
    el('p', 'lester-kicker', advice.tone === 'go' ? 'Lester · do it' : 'Lester · hold off'),
    el('h3', 'lester-title', advice.title),
    el('p', 'lester-text', advice.text),
  )
  if (advice.step) {
    const grid = phases(advice.step)
    if (grid) box.append(grid)
    const btn = el('button', 'lester-btn', `Done: ${advice.step.title}`)
    btn.type = 'button'
    btn.addEventListener('click', () => toggle(advice.step.id, true, false))
    box.append(btn)
  }
}

function renderTimeline() {
  const root = $('timeline')
  root.replaceChildren()
  const current = nextStep()
  const lesterNow = lesterAdvice().step

  const chapters = []
  for (const s of STEPS) {
    let ch = chapters.at(-1)
    if (!ch || ch.name !== s.chapter) chapters.push((ch = { name: s.chapter, steps: [] }))
    ch.steps.push(s)
  }

  for (const ch of chapters) {
    const total = ch.steps.length
    const finished = ch.steps.filter((s) => isDone(s.id)).length
    const hasCurrent = ch.steps.some((s) => s === current || s === lesterNow)

    const details = el('details', 'chapter')
    details.open = hasCurrent || openChapters.has(ch.name)
    if (finished === total) details.classList.add('chapter-done')
    const summary = el('summary', 'chapter-head')
    // Remember only chapters the user opens by hand (the click fires before the
    // details element flips), not ones auto-opened for the current mission.
    summary.addEventListener('click', () => {
      if (details.open) openChapters.delete(ch.name)
      else openChapters.add(ch.name)
      store.set(KEY_OPEN, [...openChapters])
    })
    summary.append(el('span', 'chapter-name', ch.name), el('span', 'chapter-count', `${finished}/${total}`))
    details.append(summary)

    const list = el('ol', 'timeline')
    for (const s of ch.steps) {
      const li = el('li', `item kind-${s.kind}`)
      if (isDone(s.id)) li.classList.add('done')
      if (s === current || s === lesterNow) li.classList.add('current')

      const label = el('label', 'item-row')
      const box = el('input')
      box.type = 'checkbox'
      box.checked = isDone(s.id)
      box.addEventListener('change', () => toggle(s.id, box.checked, false))

      const body = el('span', 'item-body')
      body.append(el('span', 'item-title', s.title))
      const meta = [KIND_LABEL[s.kind], s.before?.ticker, s.floating ? 'whenever Lester offers it' : null]
        .filter(Boolean)
        .join(' · ')
      body.append(el('span', 'item-meta', meta))

      label.append(box, body, el('span', 'item-est', s.est ? fmt(s.est) : ''))
      li.append(label)
      list.append(li)
    }
    details.append(list)
    root.append(details)
  }

  $('count').textContent = `${done.size} / ${STEPS.length} done`
}

let passedTimer
function showPassed(id) {
  const step = nextStep()
  const lester = lesterAdvice()
  let line = step ? `Next: ${step.title}` : 'You’re a billionaire'
  if (lester.step && lester.step.id !== id) line += ` · Lester: ${lester.step.title}`
  $('passed-title').textContent = byId(id).kind === 'stock' ? 'Stock sold' : 'Mission passed'
  $('passed-next').textContent = line
  const banner = $('passed')
  banner.hidden = false
  banner.classList.remove('show')
  void banner.offsetWidth
  banner.classList.add('show')
  clearTimeout(passedTimer)
  passedTimer = setTimeout(() => (banner.hidden = true), 2600)
}

function toggle(id, on, scroll = true) {
  if (on) done.add(id)
  else done.delete(id)
  store.set(KEY_DONE, [...done].filter(byId))
  render()
  if (on) {
    showPassed(id)
    if (scroll) $('next').scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

function render() {
  renderBank()
  renderNext()
  renderLester()
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
