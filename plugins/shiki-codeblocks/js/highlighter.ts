import { createHighlighterCoreSync } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import { getIndex, readAsset } from './assets'
import type { LanguageRegistration, ThemeRegistration } from 'shiki/core'
import type { ThemeName } from './themes'

/** Hightlight cache, see `Highlight` in Highlights.kt. */
export interface Highlight {
	lang: string
	content: string
	fg: number
	bg: number
	/** Flat `start, end, color, fontStyle` quadruples. */
	spans: number[]
}

/** Upper limit in case Discord manages to render a large code block. */
const MaxContentLength = 20_000

export function createHighlighter() {
	const shiki = createHighlighterCoreSync({
		// Hermes has no WebAssembly or RegExp `v` flag. Unsupported patterns are skipped instead of failing the grammar.
		engine: createJavaScriptRegexEngine({ target: 'ES2018', forgiving: true }),
	})

	// Marked before loading, so grammars embedding each other don't recurse forever
	const languages = new Set<string>()
	const loadLanguage = (name: string) => {
		if (languages.has(name)) return
		languages.add(name)

		const grammar = readAsset<LanguageRegistration>(`langs/${name}`)
		for (const embedded of grammar.embeddedLangs ?? []) loadLanguage(embedded)
		shiki.loadLanguageSync(grammar)
	}

	const loadTheme = (name: string) => {
		if (!shiki.getLoadedThemes().includes(name))
			shiki.loadThemeSync(readAsset<ThemeRegistration>(`themes/${name}`))
	}

	/** Highlights a code block. Returns `null` for languages that aren't shipped. */
	return function highlight(
		lang: string,
		content: string,
		theme: ThemeName,
	): Highlight | null {
		if (content.length > MaxContentLength) return null

		const name = getIndex().languages[lang.trim().toLowerCase()]
		if (!name) return null

		loadLanguage(name)
		loadTheme(theme)

		const result = shiki.codeToTokens(content, { lang: name, theme })
		const fg = parseColor(result.fg) ?? White
		const bg = parseColor(result.bg) ?? Black

		const spans: number[] = []
		for (const line of result.tokens)
			for (const token of line) {
				const color = parseColor(token.color) ?? fg
				const style = Math.max(token.fontStyle ?? 0, 0)
				if (color === fg && !style) continue

				const start = token.offset
				const end = start + token.content.length
				const last = spans.length - 4

				// Adjacent tokens of the same style become one span
				if (
					last >= 0 &&
					spans[last + 1] === start &&
					spans[last + 2] === color &&
					spans[last + 3] === style
				)
					spans[last + 1] = end
				else spans.push(start, end, color, style)
			}

		return { lang: lang.trim(), content, fg, bg, spans }
	}
}

const White = 0xffffffff | 0
const Black = 0xff000000 | 0

const colors = new Map<string, number | null>()

/** Parses `#RGB`, `#RGBA`, `#RRGGBB` or `#RRGGBBAA` to a signed 32-bit ARGB int, like Android's `Color`. */
export function parseColor(hex: string | undefined): number | null {
	if (!hex) return null

	let color = colors.get(hex)
	if (color !== undefined) return color

	let body = hex.startsWith('#') ? hex.slice(1) : ''
	if (body.length === 3 || body.length === 4)
		body = body.replace(/./g, digit => digit + digit)
	if (body.length === 6) body += 'ff'

	color =
		body.length === 8 && /^[\da-f]+$/i.test(body)
			? (Number.parseInt(body.slice(6), 16) << 24) |
				Number.parseInt(body.slice(0, 6), 16)
			: null

	colors.set(hex, color)
	return color
}
