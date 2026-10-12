import { getAssetIdByName } from '@revenge-mod/assets'
import Page from '@revenge-mod/components/Page'
import { Design } from '@revenge-mod/discord/design'
import { useState } from 'react'
import { ScrollView } from 'react-native'
import { DEFAULT_CHARSET, DEFAULT_LEN, MAX_LEN } from '.'
import type { PluginSettingsComponent } from '@revenge-mod/plugins/types'
import type { ComponentProps } from 'react'
import type { Settings } from '.'

const { Button, Stack, TextInput } = Design

type Props = ComponentProps<PluginSettingsComponent<{ jsonStorage: Settings }>>

export default function SettingsComponent({
	api: { jsonStorage: storage },
}: Props) {
	const { length, charset } = storage.use()!
	const [lengthError, setLengthError] = useState('')
	const [charsetError, setCharsetError] = useState('')

	return (
		<ScrollView keyboardShouldPersistTaps="handled">
			<Page>
				<TextInput
					label="File name length"
					placeholder={String(DEFAULT_LEN)}
					defaultValue={String(length ?? DEFAULT_LEN)}
					status={lengthError ? 'error' : 'default'}
					errorMessage={lengthError || undefined}
					onChange={value => {
						const n = Number(value)

						if (Number.isNaN(n) || n < 1 || n > MAX_LEN) {
							setLengthError(`Length must be a number between 1 and ${MAX_LEN}`)
							return
						}

						setLengthError('')
						storage.set({ length: n })
					}}
				/>
				<Stack>
					<TextInput
						label="Character set"
						placeholder={DEFAULT_CHARSET}
						defaultValue={charset ?? ''}
						status={charsetError ? 'error' : 'default'}
						errorMessage={charsetError || undefined}
						onChange={value => {
							if (value.length === 0) {
								setCharsetError('Character set cannot be empty')
								return
							}

							setCharsetError('')
							storage.set({ charset: value })
						}}
					/>
					<Button
						variant="secondary"
						size="sm"
						icon={getAssetIdByName('RetryIcon')}
						text="Reset to default character set"
						onPress={() => storage.set({ charset: DEFAULT_CHARSET })}
					/>
				</Stack>
			</Page>
		</ScrollView>
	)
}
