import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { render } from '@testing-library/react'
import Icon from './Icon'

const SKIP = new Set(['node_modules', 'dist', 'coverage'])

/** Every literal `<Icon name="…">` in src, with the files asking for it. */
function literalIconNames(root, found = new Map()) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP.has(entry.name)) literalIconNames(join(root, entry.name), found)
      continue
    }
    if (!/\.(jsx|js)$/.test(entry.name) || entry.name === 'Icon.jsx' || /\.test\.(jsx|js)$/.test(entry.name)) continue
    const file = join(root, entry.name)
    for (const match of readFileSync(file, 'utf8').matchAll(/<Icon[^>]*?name="([a-zA-Z]+)"/g)) {
      if (!found.has(match[1])) found.set(match[1], [])
      found.get(match[1]).push(file)
    }
  }
  return found
}

describe('Icon', () => {
  it('draws a stroke svg for every name the app asks for', () => {
    // `Icon` returns null for a name it does not know, which leaves the control
    // around it present, labelled and testable but painted empty — that is how
    // both pager chevrons shipped invisible. So the registry is checked against
    // the names actually used in the source, not a list to remember to update.
    const names = literalIconNames(join(process.cwd(), 'src'))
    expect(names.size).toBeGreaterThan(30)
    const missing = [...names]
      .filter(([name]) => !render(<Icon name={name} />).container.querySelector('svg'))
      .map(([name]) => `${name} (${names.get(name).join(', ')})`)
    expect(missing).toEqual([])
  })

  it('renders nothing for an unknown name', () => {
    expect(render(<Icon name="notAnIcon" />).container.innerHTML).toBe('')
  })

  it('paints the chevrons at the requested size', () => {
    const svg = render(<Icon name="chevronLeft" size={16} />).container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg.getAttribute('width')).toBe('16')
    expect(svg.getAttribute('stroke')).toBe('currentColor')
    expect(svg.querySelector('path')).not.toBeNull()
  })
})
