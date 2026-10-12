import Page from '@revenge-mod/components/Page'
import { Design } from '@revenge-mod/discord/design'
import { useState } from 'react'
import { DEFAULT_LEN } from '.'
import type { PluginSettingsComponent } from '@revenge-mod/plugins/types'
import type { ComponentProps } from 'react'
import type { Settings } from '.'

type Props = ComponentProps<PluginSettingsComponent<{ jsonStorage: Settings }>>

export default function SettingsComponent({
	api: { jsonStorage: storage },
}: Props) {
	const { nameLength } = storage.use()!
	const [error, setError] = useState(false)

	return (
		<Page>
			<Design.TextInput
				label="File name length"
				placeholder={String(DEFAULT_LEN)}
				value={String(nameLength ?? DEFAULT_LEN)}
				status={error ? 'error' : 'default'}
				errorMessage={error ? 'Enter a valid number' : undefined}
				onChange={value => {
					const n = Number(value)

					if (Number.isNaN(n)) {
						setError(true)
						return
					}

					setError(false)
					storage.set({ nameLength: Math.max(1, n) })
				}}
			/>
		</Page>
	)
}
