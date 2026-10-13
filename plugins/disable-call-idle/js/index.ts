import { getModules } from '@revenge-mod/modules/finders'
import { withProps } from '@revenge-mod/modules/finders/filters'
import { instead } from '@revenge-mod/patcher'

interface IdleTimer {
	start(...args: unknown[]): unknown
	stop(): unknown
}

interface CallIdleManager {
	idleTimeout: IdleTimer
	handleVoiceStateUpdates: unknown
	default?: { idleTimeout: IdleTimer }
}

export default plugin({
	start({ cleanup, plugin }) {
		let restore: (() => void) | undefined

		cleanup(
			getModules(
				withProps<CallIdleManager>('idleTimeout', 'handleVoiceStateUpdates'),
				manager => {
					try {
						const timer = manager.idleTimeout ?? manager.default?.idleTimeout

						timer.stop()
						restore = instead(timer, 'start', () => {})
					} catch (e) {
						plugin.reportError(e)
					}
				},
				{ max: 1 },
			),
		)
		cleanup(() => restore?.())
	},
})
