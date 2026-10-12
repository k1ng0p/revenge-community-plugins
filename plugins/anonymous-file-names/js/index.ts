import { getModules } from '@revenge-mod/modules/finders'
import { withProps } from '@revenge-mod/modules/finders/filters'
import { before } from '@revenge-mod/patcher'
import SettingsComponent from './settings'

export interface Settings {
	length: number
	charset: string
}

export const DEFAULT_LEN = 10
export const DEFAULT_CHARSET =
	'0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'

// https://docs.discord.food/resources/message#attachment-object
export const MAX_LEN = 1024

function randStr(charset: string, len: number) {
	const bytes = crypto.getRandomValues(new Uint8Array(len))
	let s = ''
	for (let i = 0; i < len; i++) s += charset[bytes[i] % charset.length]
	return s
}

function rename(file: any, charset: string, len: number) {
	const f = file?.file ?? file
	const name = f?.filename ?? f?.name
	if (typeof name !== 'string') return

	const dot = name.lastIndexOf('.')
	const ext = dot !== -1 ? name.slice(dot) : ''
	if (dot === len && name.length === len + ext.length) return

	const newName = randStr(charset, len) + ext
	if (f.filename) f.filename = newName
	if (f.name) f.name = newName
}

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: {
		load: true,
		default: { length: DEFAULT_LEN, charset: DEFAULT_CHARSET },
	},
	start({ cleanup, jsonStorage: storage }) {
		const getLen = () => {
			const n = Number(storage.cache?.length)
			if (n > 0) return n
			storage.set({ length: DEFAULT_LEN })
			return DEFAULT_LEN
		}

		const getCharset = () => {
			const s = storage.cache?.charset
			if (typeof s === 'string' && s.length > 0) return s
			storage.set({ charset: DEFAULT_CHARSET })
			return DEFAULT_CHARSET
		}

		cleanup(
			getModules(withProps('uploadLocalFiles'), mod => {
				cleanup(
					before(mod, 'uploadLocalFiles', args => {
						const files = args[0]?.items ?? args[0]?.files ?? args[0]?.uploads

						const len = getLen()
						const charset = getCharset()

						if (Array.isArray(files))
							files.forEach(f => rename(f, charset, len))

						return args
					}),
				)
			}),
		)

		cleanup(
			getModules(withProps('CloudUpload'), mod => {
				cleanup(
					before(mod, 'CloudUpload', args => {
						if (args[0]) rename(args[0], getCharset(), getLen())
						return args
					}),
				)
			}),
		)
	},
	SettingsComponent,
})
