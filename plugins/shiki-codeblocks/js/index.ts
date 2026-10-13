import { Stores } from '@revenge-mod/discord/flux'
import { JsonStorageUpdateMode } from '@revenge-mod/json-storage'
import { getModules } from '@revenge-mod/modules/finders'
import { withProps } from '@revenge-mod/modules/finders/filters'
import { before } from '@revenge-mod/patcher'
import { createHighlighter } from './highlighter'
import { clearHighlights, putHighlights } from './native'
import SettingsComponent from './settings'
import { getThemes } from './themes'
import type { DiscordModules } from '@revenge-mod/discord/types'
import type { Highlight } from './highlighter'
import type { ThemeName } from './themes'

export interface Settings {
	/** For Discord's dark, darker and midnight themes. */
	dark: ThemeName
	light: ThemeName
}

export const DefaultSettings: Settings = {
	dark: 'github-dark-default',
	light: 'github-light-default',
}

/** Commands of Discord's native chat list. Rows are serialized to JSON after this. */
interface ChatListCommands {
	updateRows(ref: unknown, data: { rows: unknown[] }): void
	clearRows(ref: unknown): void
	scrollToBottom(ref: unknown): void
}

interface CodeBlockNode {
	type: 'codeBlock'
	lang: string
	content: string
}

type ThemeStore = DiscordModules.Flux.Store<{
	theme: 'light' | 'dark' | 'darker' | 'midnight'
}>

/** How many highlights to keep, so blocks in updated rows aren't tokenized again. */
const MemoCapacity = 256

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: { load: true, default: DefaultSettings },
	start({ cleanup, jsonStorage, plugin }) {
		// Key to highlight (or null for languages that aren't shipped), least recently used first
		const memo = new Map<string, Highlight | null>()
		const highlight = createHighlighter()
		let reported = false

		clearHighlights()
		cleanup(clearHighlights)

		// Rows already rendered keep their highlights, and Discord doesn't send them again for this
		cleanup(
			jsonStorage.subscribe((_, mode) => {
				if (mode !== JsonStorageUpdateMode.Load) plugin.requireReload()
			}),
		)

		const prepare = (rows: unknown[]) => {
			const type =
				(Stores.ThemeStore as ThemeStore).theme === 'light' ? 'light' : 'dark'
			// Stored themes may be missing, or removed in a later version
			const stored = (jsonStorage.cache as Partial<Settings> | undefined)?.[
				type
			]
			const theme =
				stored && stored in getThemes() ? stored : DefaultSettings[type]

			const nodes: CodeBlockNode[] = []
			collectCodeBlocks(rows, nodes)

			// Every block in the rows is sent, even if it was before. Native hands them to the nodes made from these rows,
			// so it never has to remember a block for later, and can't disagree with JS on what it has.
			const keys = new Set<string>()
			const blocks: Highlight[] = []
			for (const { lang, content } of nodes) {
				// Switching between light and dark sends every row again, which then get the other theme
				const key = `${theme}\0${lang.trim()}\0${content}`
				if (keys.has(key)) continue
				keys.add(key)

				let result = memo.get(key)
				if (result === undefined) result = highlight(lang, content, theme)
				else memo.delete(key)

				memo.set(key, result)
				if (memo.size > MemoCapacity) memo.delete(memo.keys().next().value!)
				if (result) blocks.push(result)
			}

			if (blocks.length) putHighlights(blocks)
		}

		cleanup(
			getModules(
				withProps<ChatListCommands>(
					'updateRows',
					'clearRows',
					'scrollToBottom',
				),
				commands => {
					cleanup(
						before(commands, 'updateRows', args => {
							try {
								const rows = args[1]?.rows
								if (Array.isArray(rows)) prepare(rows)
							} catch (e) {
								// Discord falls back to its own highlighting, so chat keeps working
								if (!reported) plugin.reportError(e)
								reported = true
							}
							return args
						}),
					)
				},
			),
		)
	},
	stop({ plugin }) {
		// Rendered rows keep their highlights
		plugin.requireReload()
	},
	SettingsComponent,
})

function collectCodeBlocks(value: unknown, out: CodeBlockNode[]) {
	if (Array.isArray(value)) {
		for (const item of value) collectCodeBlocks(item, out)
		return
	}

	if (!value || typeof value !== 'object') return

	const node = value as Partial<CodeBlockNode>
	if (
		node.type === 'codeBlock' &&
		typeof node.lang === 'string' &&
		typeof node.content === 'string'
	) {
		out.push(node as CodeBlockNode)
		return
	}

	for (const key in value)
		collectCodeBlocks((value as Record<string, unknown>)[key], out)
}
