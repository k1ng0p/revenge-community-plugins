import { getModules } from '@revenge-mod/modules/finders'
import { withProps } from '@revenge-mod/modules/finders/filters'
import { before } from '@revenge-mod/patcher'
import SettingsComponent from './settings'

export interface Settings {
	nameLength: number
}

export const DEFAULT_LEN = 10

const CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'

function randStr(len: number) {
	const bytes = crypto.getRandomValues(new Uint8Array(len))
	let s = ''
	for (let i = 0; i < len; i++) s += CHARS[bytes[i] % CHARS.length]
	return s
}

function rename(file: any, len: number) {
	const f = file?.file ?? file
	const name = f?.filename ?? f?.name
	if (typeof name !== 'string') return

	const dot = name.lastIndexOf('.')
	const ext = dot !== -1 ? name.slice(dot) : ''
	if (dot === len && name.length === len + ext.length) return

	const newName = randStr(len) + ext
	if (f.filename) f.filename = newName
	if (f.name) f.name = newName
}

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: {
		load: true,
		default: { nameLength: DEFAULT_LEN },
	},
	start({ cleanup, jsonStorage: storage }) {
		const getLen = () => {
			const n = Number(storage.cache?.nameLength)
			return n > 0 ? n : DEFAULT_LEN
		}

		cleanup(
			getModules(withProps('uploadLocalFiles'), mod => {
				cleanup(
					before(mod, 'uploadLocalFiles', args => {
						const files = args[0]?.items ?? args[0]?.files ?? args[0]?.uploads
						if (Array.isArray(files)) files.forEach(f => rename(f, getLen()))
						return args
					}),
				)
			}),
		)

		cleanup(
			getModules(withProps('CloudUpload'), mod => {
				cleanup(
					before(mod, 'CloudUpload', args => {
						if (args[0]) rename(args[0], getLen())
						return args
					}),
				)
			}),
		)
	},
	SettingsComponent,
})
