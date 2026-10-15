/// <reference types="@revenge-mod/themes-api/hidden" />
/// <reference types="@revenge-mod/types/plugins/settings.plugins" />

import { onSettingsModulesLoaded } from '@revenge-mod/discord/modules/settings'
import { isThemePlugin } from './utils/plugins'
import type { PluginApi, PreInitPluginApi } from '@revenge-mod/plugins/types'

export let themesInternal: PreInitPluginApi['themesInternal']
export let pluginSettings: PluginApi['pluginSettings']

export default plugin({
	preInit({ themesInternal: internal }) {
		themesInternal = internal
	},
	start({ cleanup, pluginSettings: settings }) {
		pluginSettings = settings
		// Manage theme plugins under Themes instead of standard plugins settings
		settings.claimPlugins(isThemePlugin)
		cleanup(
			onSettingsModulesLoaded(() => {
				import('./register').then(({ default: register }) =>
					cleanup(register()),
				)
			}),
		)
	},
})
