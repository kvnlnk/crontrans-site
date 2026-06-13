import './styles/main.css'

// ============================================================
// Cron Expression Parser (client-side, no deps)
// Handles: numbers, ranges, steps, wildcards, lists, @shorthands
// ============================================================

const MONTHS = [
  null, 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const DAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
]

const SHORTHANDS = {
  '@yearly':  '0 0 1 1 *',
  '@annually':'0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly':  '0 0 * * 0',
  '@daily':   '0 0 * * *',
  '@hourly':  '0 * * * *',
}

// ---- Field parsing -----------------------------------------

function expandField(part, min, max) {
  if (part === '*') {
    // Return range string like "every hour" or "every minute"
    return { type: 'every', values: null }
  }

  // Step: */15 or 1-10/2
  const stepMatch = part.match(/^(.+?)\/(\d+)$/)
  if (stepMatch) {
    const base = stepMatch[1]
    const step = parseInt(stepMatch[2], 10)
    if (base === '*') {
      return { type: 'step', step, values: null }
    }
    const [rMin, rMax] = base.includes('-') ? base.split('-').map(Number) : [parseInt(base, 10), max]
    const vals = []
    for (let v = rMin; v <= (rMax || rMin); v += step) {
      vals.push(v)
    }
    return { type: 'list', values: vals }
  }

  // List: 1,3,5
  if (part.includes(',')) {
    const vals = part.split(',').map(s => parseInt(s.trim(), 10))
    return { type: 'list', values: vals }
  }

  // Range: 1-5
  if (part.includes('-')) {
    const [a, b] = part.split('-').map(Number)
    if (b < a) return { type: 'list', values: [a, b] }
    const vals = []
    for (let v = a; v <= b; v++) vals.push(v)
    return { type: 'list', values: vals }
  }

  // Single number
  const n = parseInt(part, 10)
  if (!isNaN(n)) {
    return { type: 'list', values: [n] }
  }

  return { type: 'invalid' }
}

function ord(n) {
  if (n === 1) return '1st'
  if (n === 2) return '2nd'
  if (n === 3) return '3rd'
  return n + 'th'
}

function formatTime(h) {
  if (h === 0 || h === 24) return 'midnight'
  if (h === 12) return '12:00pm'
  return h < 12 ? `${h}:00am` : `${h - 12}:00pm`
}

function formatMinute(m) {
  if (m === 0) return ''
  if (m < 10) return `:0${m}`
  return `:${m}`
}

function formatMinuteInterval(m) {
  if (m === 1) return 'every minute'
  if (m < 60) return `every ${m} minutes`
  return `every ${m} minutes`
}

// ---- Cron -> English ---------------------------------------

function parseCron(expr) {
  // Normalise
  expr = expr.trim().replace(/\s+/g, ' ')

  // Check shorthand
  const shorthand = SHORTHANDS[expr.toLowerCase()]
  if (shorthand) expr = shorthand

  const parts = expr.split(' ')
  if (parts.length !== 5) {
    return { error: `Expected 5 fields, got ${parts.length}. Use format: minute hour day month weekday` }
  }

  const [minute, hour, day, month, weekday] = parts

  const mField = expandField(minute, 0, 59)
  const hField = expandField(hour, 0, 23)
  const dField = expandField(day, 1, 31)
  const monField = expandField(month, 1, 12)
  const wField = expandField(weekday, 0, 6)

  if (mField.type === 'invalid' || hField.type === 'invalid' ||
      dField.type === 'invalid' || monField.type === 'invalid' || wField.type === 'invalid') {
    return { error: 'Invalid field — use numbers, ranges (1-5), steps (*/15), lists (1,3,5), or wildcards (*)' }
  }

  // Build parts of the English description
  const fragments = []

  // --- Minute ---
  let minuteDesc = ''
  if (mField.type === 'every') {
    minuteDesc = 'every minute'
  } else if (mField.type === 'step') {
    const step = mField.step
    if (step >= 60) {
      minuteDesc = formatMinuteInterval(step)
    } else if (step === 1) {
      minuteDesc = 'every minute'
    } else if (step === 15) {
      minuteDesc = 'every 15 minutes'
    } else if (step === 30) {
      minuteDesc = 'every 30 minutes'
    } else {
      minuteDesc = formatMinuteInterval(step)
    }
  } else if (mField.values.length === 1) {
    // Single minute — will be combined with hour
    minuteDesc = mField.values[0]
  } else {
    minuteDesc = `at minutes ${mField.values.join(', ')}`
  }

  // --- Hour ---
  let hourDesc = ''
  if (hField.type === 'every') {
    hourDesc = 'every hour'
  } else if (hField.type === 'step') {
    hourDesc = `every ${hField.step} hours`
  } else if (hField.values.length === 1) {
    hourDesc = formatTime(hField.values[0])
  } else {
    hourDesc = `${hField.values[0] > 12 ? hField.values[0] - 12 : (hField.values[0] || 12)}am` +
               ` to ${hField.values[1] > 12 ? hField.values[1] - 12 : (hField.values[1] || 12)}pm`
  }

  // Build time phrase
  if (typeof minuteDesc === 'number') {
    // Single minute + single hour
    if (hField.type === 'list' && hField.values.length === 1) {
      fragments.push(`${formatTime(hField.values[0])}${formatMinute(minuteDesc)}`)
    } else if (hField.type === 'every') {
      fragments.push(`at :${String(minuteDesc).padStart(2, '0')} past every hour`)
    } else if (hField.type === 'step') {
      fragments.push(`:${String(minuteDesc).padStart(2, '0')} past ${hourDesc}`)
    } else {
      // Range hours
      const h1 = hField.values[0]
      const h2 = hField.values[hField.values.length - 1]
      fragments.push(`${formatTime(h1)}${formatMinute(minuteDesc)} to ${formatTime(h2)}`)
    }
  } else if (minuteDesc.startsWith('every ')) {
    const mPart = minuteDesc
    if (hField.type === 'every') {
      fragments.push(mPart === 'every minute' ? 'every minute' : mPart)
    } else if (hField.type === 'list' && hField.values.length === 2) {
      fragments.push(`${mPart}, ${hField.values[0]}am to ${hField.values[1]}pm`)
    } else {
      fragments.push(`${mPart}, ${hourDesc}`)
    }
  } else if (minuteDesc.startsWith('at minutes ')) {
    if (hField.type === 'list' && hField.values.length === 2) {
      fragments.push(`${minuteDesc}, ${hField.values[0]}am to ${hField.values[1]}pm`)
    } else if (hField.type === 'list' && hField.values.length === 1) {
      fragments.push(`${minuteDesc} past ${formatTime(hField.values[0])}`)
    } else {
      fragments.push(`${minuteDesc}, ${hourDesc}`)
    }
  } else {
    // e.g. "every 30 minutes"
    fragments.push(minuteDesc || 'every minute')
  }

  // --- Day of month ---
  if (dField.type === 'list' && dField.values.length === 1 && dField.values[0] !== 1) {
    fragments.push(`on day ${ord(dField.values[0])}`)
  } else if (dField.type === 'list' && dField.values.length > 1 && dField.values.length < 10) {
    fragments.push(`on days ${dField.values.map(ord).join(', ')}`)
  }
  // * is implicit — no fragment

  // --- Month ---
  if (monField.type === 'list' && monField.values.length === 1) {
    fragments.push(`in ${MONTHS[monField.values[0]]}`)
  } else if (monField.type === 'list' && monField.values.length > 1 && monField.values.length < 8) {
    fragments.push(`in ${monField.values.map(v => MONTHS[v]).join(', ')}`)
  } else if (monField.type === 'list' && monField.values.length === 0) {
    // noop
  }
  // * is implicit

  // --- Weekday ---
  let weekdayDesc = ''
  if (wField.type === 'every') {
    // every day (implicit with *)
  } else if (wField.type === 'list' && wField.values.length === 1) {
    const d = wField.values[0]
    if (d >= 0 && d <= 6) weekdayDesc = DAYS[d]
  } else if (wField.type === 'list' && wField.values.length >= 2) {
    const names = wField.values.filter(v => v >= 0 && v <= 6).map(v => DAYS[v])
    if (names.length === 2) {
      weekdayDesc = `${names[0]} through ${names[names.length - 1]}`
    } else if (names.length <= 4) {
      weekdayDesc = names.join(', ')
    } else {
      weekdayDesc = `${names[0]} through ${names[names.length - 1]}`
    }
  }

  if (weekdayDesc) {
    // Check if it's a range like Monday through Friday
    if (wField.type === 'list' && wField.values.length >= 2) {
      // Already formatted
    }
    fragments.push(weekdayDesc)
  }

  // Special: if day and month are specific (e.g. Jan 1)
  if (dField.type === 'list' && dField.values.length === 1 &&
      monField.type === 'list' && monField.values.length === 1 &&
      dField.values[0] === 1 && monField.values[0] === 1) {
    // "January 1st" — already covered by fragments
  }

  // Build sentence
  let result = fragments.join(', ')

  // Clean up
  result = result.replace(/, at minutes/g, 'at minutes')
  result = result.replace(/\s+/g, ' ').trim()

  if (!result) {
    result = 'every minute of every day'
  }

  // Capitalise first letter
  result = result.charAt(0).toUpperCase() + result.slice(1)

  return { text: result, raw: expr }
}

// ============================================================
// UI
// ============================================================

const input = document.getElementById('cron-input')
const output = document.getElementById('cron-output')
const raw = document.getElementById('cron-raw')
const shorthandBtns = document.querySelectorAll('.shorthand-btn')
const copyBtn = document.querySelector('.install__copy')

function update() {
  const expr = input.value.trim()
  if (!expr) {
    output.textContent = 'Waiting for input…'
    output.className = 'translator__output'
    raw.textContent = ''
    return
  }

  const result = parseCron(expr)
  if (result.error) {
    output.textContent = result.error
    output.className = 'translator__output translator__output--error'
    raw.textContent = ''
  } else {
    output.textContent = result.text
    output.className = 'translator__output'
    const shorthand = SHORTHANDS[expr.trim().toLowerCase()]
    raw.textContent = shorthand ? `${expr} → ${shorthand}` : ''
  }
}

input.addEventListener('input', update)

shorthandBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    input.value = btn.dataset.expr
    update()
  })
})

copyBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(copyBtn.dataset.copy).then(() => {
    copyBtn.textContent = 'Copied!'
    copyBtn.classList.add('install__copy--copied')
    setTimeout(() => {
      copyBtn.textContent = 'Copy'
      copyBtn.classList.remove('install__copy--copied')
    }, 2000)
  }).catch(() => {
    // Fallback for environments without clipboard API
    copyBtn.textContent = 'Copy'
  })
})

// Initial render
update()
