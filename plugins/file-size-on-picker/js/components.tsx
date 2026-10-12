import { Tokens } from '@revenge-mod/discord/common/tokens'
import { Design } from '@revenge-mod/discord/design'
import { FileModule } from '@revenge-mod/discord/native'
import { proxify } from '@revenge-mod/utils/proxy'
import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import type { ReactNode } from 'react'

const { Text } = Design

const SIZE_DANGER_THRESHOLD = 25_000_000 // 25 MB

const sizeCache = new Map<string, number>()

const styles = StyleSheet.create({
	wrapper: {
		position: 'relative',
	},
})

const useSizeTagStyles = proxify(() =>
	Design.createStyles({
		container: {
			backgroundColor: Tokens.default.colors.MOBILE_KEYBOARD_PANEL_BACKGROUND,
			borderRadius: 4,
			paddingHorizontal: 5,
			paddingVertical: 4,
			position: 'absolute',
			top: 8,
			left: 8,
		},
	}),
)

async function readFileSize(uri: string): Promise<number> {
	const value: unknown = await FileModule.getSize(uri)
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
		throw new Error('File size is unavailable')
	}

	return value
}

function formatBytes(bytes: number, decimals = 2): string {
	if (!+bytes) return '0 bytes'

	const k = 1024
	const dm = decimals < 0 ? 0 : decimals

	const sizes = ['bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']

	const i = Math.floor(Math.log(bytes) / Math.log(k))

	return `${parseFloat((bytes / k ** i).toFixed(dm))} ${sizes[i]}`
}

function SizeTag({ uri }: { uri: string }) {
	const styles = useSizeTagStyles()

	const cached = sizeCache.get(uri)

	const [size, setSize] = useState<number | null>(cached ?? null)
	const [loading, setLoading] = useState(cached === undefined)

	useEffect(() => {
		if (cached !== undefined) {
			setSize(cached)
			setLoading(false)
			return
		}

		let cancelled = false
		setSize(null)
		setLoading(true)

		readFileSize(uri)
			.then(value => {
				if (cancelled) return

				sizeCache.set(uri, value)
				setSize(value)
				setLoading(false)
			})
			.catch(() => {
				if (cancelled) return

				setLoading(false)
			})

		return () => {
			cancelled = true
		}
	}, [uri])

	return loading || size === null ? null : (
		<View style={styles.container}>
			<Text
				color={
					size >= SIZE_DANGER_THRESHOLD
						? 'text-feedback-critical'
						: 'text-overlay-light'
				}
				variant="text-xs/bold"
			>
				{formatBytes(size)}
			</Text>
		</View>
	)
}

export function SizeTagWrapper({
	uri,
	children,
}: {
	uri: string
	children: ReactNode
}) {
	return (
		<View style={styles.wrapper}>
			{children}
			<SizeTag uri={uri} />
		</View>
	)
}
