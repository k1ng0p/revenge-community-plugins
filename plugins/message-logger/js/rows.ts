import { Tokens } from '@revenge-mod/discord/common/tokens'
import { Stores } from '@revenge-mod/discord/flux'
import { processColor } from 'react-native'
import { getLog, takeChanged } from './logger'
import { setDimmed } from './native'
import type { DiscordModules } from '@revenge-mod/discord/types'
import type { MessageRecord } from './logger'

export interface GenerateArgs {
	message: MessageRecord
}

export interface MessageRow {
	type?: number
	changeType?: number
	message?: RowMessage
}

interface RowMessage {
	id: string
	content?: ContentNode[]
	edited?: string
	editedColor?: number | null
	/** Text & guild tag color */
	textColor?: number
	timestampColor?: number
}

interface ContentNode {
	type?: string
	content?: unknown
	items?: ContentNode[][]
}

export interface RowManager {
	generate(args: GenerateArgs): MessageRow
}

const MessageRowType = 1
const UpdateChangeType = 2

// Must match the markers in native
const HistoryStart = ''
const HistoryEnd = ''
const EditedStart = ''
const EditedSeparator = ''
const EditedEnd = ''
const MentionStart = ''
const MentionSeparator = ''
const MentionEnd = ''

// Mentions color their own text, so textColor doesn't reach them
const MentionTypes = new Set(['mention', 'channelMention'])

type ThemeStore = DiscordModules.Flux.Store<{ theme: string }>

export function styleRow(
	row: MessageRow,
	args: GenerateArgs,
	generate: (args: GenerateArgs) => MessageRow,
) {
	const message = row?.type === MessageRowType ? row.message : undefined
	if (!message) return

	// Discord only sees the same record, so native wouldn't bind it again
	if (takeChanged(message.id)) row.changeType = UpdateChangeType

	const log = getLog(message.id)
	const attachments = args.message.attachments.map(({ id }) => id)

	const deletedAttachments = new Set(
		!log?.highlighted ? [] : log.deleted ? attachments : log.removedAttachments,
	)
	setDimmed(deletedAttachments, true)
	setDimmed(
		attachments.filter(id => !deletedAttachments.has(id)),
		false,
	)
	// The message's avatar
	setDimmed([message.id], !!(log?.deleted && log.highlighted))

	if (!log) return

	if (log.edits.length)
		message.content = [
			...history(log.edits, message, args, generate),
			...(message.content ?? []),
		]

	if (log.deleted && log.highlighted) {
		const color = criticalColor()
		message.textColor = color
		message.timestampColor = color
		if (message.content) message.content = colorMentions(message.content, color)
	}
}

// Discord caches parsed nodes, so they're copied
function colorMentions(nodes: ContentNode[], color: number): ContentNode[] {
	return nodes.flatMap(node => {
		if (node.type && MentionTypes.has(node.type))
			return [
				text(`${MentionStart}${color}${MentionSeparator}`),
				node,
				text(MentionEnd),
			]

		// Formatting nodes can hold mentions too
		if (Array.isArray(node.content))
			node = { ...node, content: colorMentions(node.content, color) }
		if (Array.isArray(node.items))
			node = {
				...node,
				items: node.items.map(item => colorMentions(item, color)),
			}

		return [node]
	})
}

function history(
	edits: MessageRecord[],
	message: RowMessage,
	args: GenerateArgs,
	generate: (args: GenerateArgs) => MessageRow,
) {
	const label = `${EditedStart}${message.editedColor ?? ''}${EditedSeparator} (${message.edited || 'edited'})${EditedEnd}\n`

	return edits.flatMap(record => [
		text(HistoryStart),
		...(generate({ ...args, message: record }).message?.content ?? []),
		text(HistoryEnd),
		text(label),
	])
}

const text = (content: string) => ({ type: 'text', content })

function criticalColor() {
	const theme = (Stores.ThemeStore as ThemeStore).theme
	const { colors, internal } = Tokens.default

	return processColor(
		internal.resolveSemanticColor(theme, colors.TEXT_FEEDBACK_CRITICAL),
	) as number
}
