import { Stores } from '@revenge-mod/discord/flux'
import { getModules } from '@revenge-mod/modules/finders'
import { withProps } from '@revenge-mod/modules/finders/filters'
import { createElement, useSyncExternalStore } from 'react'
import { Image, StyleSheet, useWindowDimensions, View } from 'react-native'
import { ownGradientSettings, resolveSemanticColor } from './colors'
import { activeBackgroundOf, themesStore } from './store'
import type { PreInitPluginApi } from '@revenge-mod/plugins/types'
import type { ComponentType } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import type { ActiveBackground } from './store'
import type { ThemeBase } from './types'

type PluginCleanupApi = PreInitPluginApi['cleanup']

interface CustomThemeSettings {
	colors: string[]
	gradientColorStops: number[]
	gradientAngle: number
	baseMix: number
}

interface CustomThemeDisplaySettings {
	baseTheme: ThemeBase
	customTheme: CustomThemeSettings
}

// ../discord_app/modules/client_themes/native/useCustomThemeDisplaySettings.tsx
interface CustomThemeDisplaySettingsModule {
	useCustomThemeDisplaySettings(
		...args: unknown[]
	): CustomThemeDisplaySettings | undefined
}

// ../discord_app/modules/client_themes/native/useActiveTheme.tsx
interface ActiveThemeModule {
	useIsClientThemeOrCustomThemeActive(): boolean
	useActiveThemeType: unknown
}

interface ThemedGradientProps {
	absolute?: boolean
	/** Window width, past the container. Screen-aligned layers shift the container to line up with the screen. */
	wide?: boolean
	/** Window height, past the container. */
	tall?: boolean
	/** Blends the gradient toward the base, behind surfaces without their own dimming overlay. */
	mix?: boolean
	style?: StyleProp<ViewStyle>
	/** Specific gradient to draw, such as a theme picker swatch. */
	gradientOverride?: unknown
}

interface ThemeStore {
	theme: ThemeBase
	addChangeListener(listener: () => void): void
	removeChangeListener(listener: () => void): void
}

// ../discord_app/modules/client_themes/native/ThemedGradient.tsx
interface ThemedGradientModule {
	default: ComponentType<ThemedGradientProps>
	CustomThemedGradient: unknown
	validateColors: unknown
}

/** How much the gradient tints Discord's surfaces, from 0 to 100. */
const BaseMix = 100

/** Theme's main background, which Discord's surfaces should match. */
const SurfaceColor = 'BACKGROUND_BASE_LOWER'

// ../discord_app/modules/client_themes/native/ClientThemesUtils.tsx: surfaces mix the gradient at
// 0.12 + 0.2 * baseMix (0.3 + ... in light) over black (white in light)
const GradientWeight = {
	dark: 0.12 + 0.2 * (BaseMix / 100),
	light: 0.3 + 0.2 * (BaseMix / 100),
}

// ThemedGradient.tsx: mixed layers keep this much of the gradient color over black (white in light)
const MixWeight = { dark: 0.3, light: 0.2 }

let displaySettings:
	| {
			background: ActiveBackground
			baseTheme: ThemeBase
			surface: string
			value: CustomThemeDisplaySettings
	  }
	| undefined

/**
 * Shows the active theme's background through Discord's custom theme gradient path:
 * surfaces turn translucent as with a gradient theme, and gradient layers draw the image.
 * Discord's own custom theme, preview, or server theme still takes precedence.
 */
export function patchBackgrounds(cleanup: PluginCleanupApi) {
	let stopped = false

	cleanup(
		() => {
			stopped = true
		},
		getModules(
			withProps<CustomThemeDisplaySettingsModule>(
				'useCustomThemeDisplaySettings',
			),
			module => {
				const original = module.useCustomThemeDisplaySettings
				if (stopped) return

				// A hook, but adds no hooks of its own, so restoring it mid-render is safe
				function useCustomThemeDisplaySettings(...args: unknown[]) {
					return original(...args) ?? backgroundDisplaySettings()
				}

				module.useCustomThemeDisplaySettings = useCustomThemeDisplaySettings
				cleanup(() => {
					if (
						module.useCustomThemeDisplaySettings ===
						useCustomThemeDisplaySettings
					)
						module.useCustomThemeDisplaySettings = original
				})
			},
			{ cached: true },
		),
		getModules(
			withProps<ThemedGradientModule>('CustomThemedGradient', 'validateColors'),
			module => {
				const Original = module.default
				if (stopped) return

				function ThemedGradient(props: ThemedGradientProps) {
					const background = useSyncExternalStore(
						themesStore.subscribe,
						activeBackground,
					)
					const theme = useSyncExternalStore(subscribeThemeStore, currentTheme)
					const { width, height } = useWindowDimensions()

					if (!background || props.gradientOverride != null)
						return createElement(Original, props)

					// Drawn like Discord draws the gradient. Surfaces above add their own dimming overlays.
					const light = theme === 'light'
					const weight = props.mix
						? light
							? MixWeight.light
							: MixWeight.dark
						: 1

					return createElement(
						View,
						{
							pointerEvents: 'none',
							style: [
								props.absolute ? StyleSheet.absoluteFill : props.style,
								props.wide && { width },
								props.tall && { height },
								{
									backgroundColor: light ? '#ffffff' : '#000000',
									overflow: 'hidden',
								},
							],
						},
						// Window-sized in every layer, so layers crop the image alike
						createElement(Image, {
							source: { uri: background.uri },
							blurRadius: background.blur,
							resizeMode: 'cover',
							style: {
								position: 'absolute',
								top: 0,
								left: 0,
								width,
								height,
								opacity: weight * (background.opacity ?? 1),
							},
						}),
					)
				}

				module.default = ThemedGradient
				cleanup(() => {
					if (module.default === ThemedGradient) module.default = Original
				})
			},
			{ cached: true },
		),
		getModules(
			withProps<ActiveThemeModule>(
				'useIsClientThemeOrCustomThemeActive',
				'useActiveThemeType',
			),
			module => {
				const original = module.useIsClientThemeOrCustomThemeActive
				if (stopped) return

				// Discord only counts saved custom themes, not previews like ours. Adds no hooks, like above.
				function useIsClientThemeOrCustomThemeActive() {
					return original() || activeBackground() !== undefined
				}

				module.useIsClientThemeOrCustomThemeActive =
					useIsClientThemeOrCustomThemeActive
				cleanup(() => {
					if (
						module.useIsClientThemeOrCustomThemeActive ===
						useIsClientThemeOrCustomThemeActive
					)
						module.useIsClientThemeOrCustomThemeActive = original
				})
			},
			{ cached: true },
		),
	)
}

function activeBackground() {
	return activeBackgroundOf(themesStore.getState())
}

function themeStore() {
	return Stores.ThemeStore as unknown as ThemeStore
}

function subscribeThemeStore(listener: () => void) {
	themeStore().addChangeListener(listener)
	return () => themeStore().removeChangeListener(listener)
}

function currentTheme() {
	return themeStore().theme
}

/** Custom theme Discord renders while a background is active. The same object until something it uses changes. */
function backgroundDisplaySettings() {
	const state = themesStore.getState()
	const background = activeBackgroundOf(state)
	if (!background) return

	const baseTheme = currentTheme()
	const surface = resolveSemanticColor(baseTheme, SurfaceColor)
	if (!surface || !/^#[0-9a-f]{6}/i.test(surface)) return

	if (
		displaySettings?.background === background &&
		displaySettings.baseTheme === baseTheme &&
		displaySettings.surface === surface
	)
		return displaySettings.value

	const customTheme: CustomThemeSettings = {
		colors: [gradientColorFor(surface, baseTheme === 'light')],
		gradientColorStops: [],
		gradientAngle: 0,
		baseMix: BaseMix,
	}
	ownGradientSettings.add(customTheme)

	displaySettings = {
		background,
		baseTheme,
		surface,
		value: { baseTheme, customTheme },
	}
	return displaySettings.value
}

/** Gradient color whose mix Discord renders as the theme's own surface color. */
function gradientColorFor(surface: string, light: boolean) {
	const weight = light ? GradientWeight.light : GradientWeight.dark
	const overlay = light ? 255 : 0

	let hex = '#'
	for (let i = 1; i < 7; i += 2) {
		const value = Number.parseInt(surface.slice(i, i + 2), 16)
		const channel = Math.round((value - (1 - weight) * overlay) / weight)
		hex += Math.min(255, Math.max(0, channel)).toString(16).padStart(2, '0')
	}

	return hex
}
