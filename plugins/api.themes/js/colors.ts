import { getModules } from '@revenge-mod/modules/finders'
import { withProps } from '@revenge-mod/modules/finders/filters'
import { instead } from '@revenge-mod/patcher'
import type { PreInitPluginApi } from '@revenge-mod/plugins/types'
import type { ThemeBase, ThemeColors } from './types'

type PluginCleanupApi = PreInitPluginApi['cleanup']

interface SemanticColorContext {
	isProfileTheme?: boolean
	gradient?: unknown
}

// ../discord_common/js/packages/tokens/native.tsx
interface TokensModule {
	RawColor: Record<string, string>
	SemanticColor: Record<string, unknown>
	default: {
		/** Opaque tokens by semantic name, what `resolveSemanticColor` takes. `SemanticColor` holds their definitions. */
		colors: Record<string, object>
		internal: {
			getSemanticColorName(color: object): string
			resolveSemanticColor(
				theme: ThemeBase,
				color: object,
				context?: SemanticColorContext,
			): string
		}
	}
}

let colors: ThemeColors | undefined
let rawColors: Record<string, string> | undefined
let tokensModule: TokensModule | undefined
/** Original raw colors replaced by {@link colors}. */
const rawOriginals: Record<string, string> = {}

/**
 * Patches Discord's color tokens, now or once the module initializes. Clean up with {@link cleanup}.
 * Raw colors restore with other selections in `unloadSelections`.
 */
export function patchColorTokens(cleanup: PluginCleanupApi) {
	// Already-initialized modules resolve a tick later, which unsubscribing cannot cancel
	let stopped = false

	cleanup(
		() => {
			stopped = true
		},
		getModules(
			withProps<TokensModule>('RawColor', 'SemanticColor'),
			tokens => {
				if (stopped) return

				tokensModule = tokens
				// Shared object resolveSemanticColor reads raw colors from
				rawColors = tokens.RawColor
				applyRawColors()

				const { internal } = tokens.default
				cleanup(
					instead(internal, 'resolveSemanticColor', (args, original) => {
						const [theme, color, context] = args
						// User-picked colors for profile themes
						if (
							colors?.semantic &&
							!context?.isProfileTheme &&
							!context?.gradient
						) {
							const name = internal.getSemanticColorName(color)
							const value = colors.semantic[theme]?.[name]
							if (value) return value
						}

						return Reflect.apply(original, internal, args)
					}),
				)
			},
			{ cached: true },
		),
	)
}

/**
 * Resolves semantic colors as {@link preview} would, without applying them. Pass `undefined` to preview Discord's colors.
 *
 * @param names Semantic color names, such as `BACKGROUND_BRAND`.
 * @param context Discord's semantic color context, such as contrast and saturation settings.
 * @returns `undefined` before Discord's tokens initialize.
 */
export function resolvePreviewColors(
	preview: ThemeColors | undefined,
	theme: ThemeBase,
	names: string[],
	context?: SemanticColorContext,
) {
	if (!tokensModule) return

	const { colors: tokens, internal } = tokensModule.default
	const current = colors
	setThemeColors(preview)
	try {
		return names.map(name =>
			internal.resolveSemanticColor(theme, tokens[name]!, context),
		)
	} finally {
		setThemeColors(current)
	}
}

/** Updates active colors for future resolutions. Rendered components keep existing colors until re-render. */
export function setThemeColors(next: ThemeColors | undefined) {
	restoreRawColors()
	colors = next
	applyRawColors()
}

function applyRawColors() {
	if (!rawColors || !colors?.raw) return

	for (const [name, value] of Object.entries(colors.raw)) {
		if (!(name in rawColors)) continue
		rawOriginals[name] ??= rawColors[name]!
		rawColors[name] = value
	}
}

function restoreRawColors() {
	if (!rawColors) return

	for (const name in rawOriginals) {
		rawColors[name] = rawOriginals[name]!
		delete rawOriginals[name]
	}
}
