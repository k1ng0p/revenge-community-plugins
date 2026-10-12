import { getModules } from '@revenge-mod/modules/finders'
import { createFilterGenerator } from '@revenge-mod/modules/finders/filters'
import { after, instead } from '@revenge-mod/patcher'
import { useEffect } from 'react'
import { Pressable } from 'react-native'
import { SizeTagWrapper } from './components'
import type {
	Filter,
	FilterGenerator,
	FilterScopes,
} from '@revenge-mod/modules/finders/filters'
import type { InsteadHook } from '@revenge-mod/patcher/types'
import type { FC, MemoExoticComponent, ReactElement, ReactNode } from 'react'
import type { PressableProps } from 'react-native'

let stopped = false

export default plugin({
	start({ cleanup, plugin }) {
		// Patches the MediaKeyboardImage component to wrap its children in a SizeTagWrapper if we have a URI
		const mkiPatch: InsteadHook<MediaKeyboardImageElement['type']> = (
			args,
			orig,
		) => {
			const [props] = args
			const tree = Reflect.apply(orig, undefined, args) as ReactElement<
				any,
				MemoExoticComponent<FC<PressableProps>>
			>

			const uri = props.item?.node?.image?.uri
			if (typeof uri !== 'string') return tree

			if (tree.type !== Pressable) {
				plugin.reportError('MediaKeyboardImage rendered non-Pressable element')
				plugin.disable()
			}

			tree.props.children = (
				<SizeTagWrapper uri={uri}>{tree.props.children}</SizeTagWrapper>
			)

			return tree
		}

		cleanup(
			getModules(
				withMemoizedExoticComponent('MediaKeyboardItem'),
				MediaKeyboardItem => {
					// No cleanup here to not break rules of hooks after stopping the plugin
					after(MediaKeyboardItem, 'type', node_ => {
						const cleanups: Array<() => void> = []

						// Cleanup once the sheet (and by extension, these items) is unmounted
						useEffect(() => {
							return () => {
								for (const cleanup of cleanups) cleanup()
							}
						})

						if (stopped) return node_

						const node = node_ as ReactElement<{ children?: ReactNode }>
						if (node.props.children == null) return node

						const children = Array.isArray(node.props.children)
							? node.props.children
							: [node.props.children]

						for (const child of children) {
							if (child?.type?.name === 'MediaKeyboardImage') {
								cleanups.push(
									instead(child as MediaKeyboardImageElement, 'type', mkiPatch),
								)
							}
						}

						return node
					})
				},
			),
		)
	},
	stop() {
		stopped = true
	},
})

interface MediaKeyboardImageProps {
	item: {
		node: {
			image: {
				uri: string
			}
		}
	}
}

type MediaKeyboardImageElement = ReactElement<any, FC<MediaKeyboardImageProps>>

type WithMemoizedExoticComponent = FilterGenerator<
	<P = object>(
		name: string,
	) => Filter<{
		Result: MemoExoticComponent<FC<P>>
		Scopes: [typeof FilterScopes.Initialized]
	}>
>

const withMemoizedExoticComponent = createFilterGenerator(
	([name], _, exports) =>
		exports?.type?.length === 1 && exports.type.name === name,
	([name]) => `memoizedExoticComponent(${name})`,
) as WithMemoizedExoticComponent
