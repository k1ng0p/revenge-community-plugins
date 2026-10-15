/// <reference types="node" />

// Writes the grammars and themes in `shiki.config.ts` and index to `assets/shiki`.

import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { bundledLanguages } from 'shiki/langs'
import { bundledThemes } from 'shiki/themes'
import { Languages, Themes } from '../shiki.config'
import type { ShikiIndex } from '../js/types'

const root = join(import.meta.dirname, '..')
const assets = join(root, 'assets/shiki')

await rm(assets, { recursive: true, force: true })
await mkdir(join(assets, 'langs'), { recursive: true })
await mkdir(join(assets, 'themes'), { recursive: true })

const index: ShikiIndex = { languages: {}, themes: {} }

for (const id of Languages) {
	// The language comes last, after the languages it embeds
	const { default: grammars } = await bundledLanguages[id]()
	for (const grammar of grammars) {
		await writeFile(
			join(assets, 'langs', `${grammar.name}.json`),
			JSON.stringify(grammar),
		)
		for (const alias of [grammar.name, ...(grammar.aliases ?? [])])
			index.languages[alias] = grammar.name
	}
}

for (const [id, label] of Object.entries(Themes)) {
	const { default: theme } = await bundledThemes[id as keyof typeof Themes]!()
	await writeFile(join(assets, 'themes', `${id}.json`), JSON.stringify(theme))
	index.themes[id] = {
		label: label!,
		type: theme.type === 'light' ? 'light' : 'dark',
	}
}

await writeFile(join(assets, 'index.json'), JSON.stringify(index))

console.log(
	`Wrote ${new Set(Object.values(index.languages)).size} grammars and ${Object.keys(index.themes).length} themes`,
)
