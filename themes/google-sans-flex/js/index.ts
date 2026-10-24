/// <reference types="@revenge-mod/themes-api" />

import type { FontVariant } from '@revenge-mod/themes-api/types'

const Font = 'assets/fonts/GoogleSansFlex.ttf'

/** Discord asks for these family names. The style is part of the name. */
const Weights: Record<string, number> = {
	Normal: 400,
	Medium: 500,
	Semibold: 600,
	Bold: 700,
	ExtraBold: 800,
}

const families: Record<string, FontVariant[]> = {}
for (const [style, wght] of Object.entries(Weights))
	families[`ggsans-${style}`] = [
		{ path: Font, weight: wght, axes: { wght } },
		{ path: Font, weight: wght, italic: true, axes: { wght, slnt: -10 } },
	]

export default plugin({
	preInit({ themes }) {
		themes.registerGroup('google', {
			name: 'Google',
			description: 'Fonts by Google',
		})

		themes.registerFontPack('google', 'google-sans-flex', {
			name: 'Google Sans Flex',
			description:
				"The variable-font member of Google's Sans type family, giving a single font file the range of dozens of styles.",
			families,
		})
	},
})
