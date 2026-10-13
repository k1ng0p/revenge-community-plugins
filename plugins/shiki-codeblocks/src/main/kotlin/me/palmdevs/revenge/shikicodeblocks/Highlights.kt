package me.palmdevs.revenge.shikicodeblocks

import org.json.JSONObject

/**
 * Shiki's rendering of one code block.
 *
 * [spans] is flat, four ints per token: `start, end, color, fontStyle`, offsets into the block's content.
 * Colors are ARGB, and [fontStyle] bits follow Shiki's `FontStyle`.
 */
internal class Highlight(val fg: Int, val bg: Int, val spans: IntArray)

internal object FontStyle {
    const val ITALIC = 1
    const val BOLD = 2
    const val UNDERLINE = 4
    const val STRIKETHROUGH = 8
}

/** Highlights keyed by language and content, filled by JS before it sends the rows that contain them. */
internal class HighlightCache(private val capacity: Int) {
    private val entries = object : LinkedHashMap<String, Highlight>(capacity, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Highlight>) = size > capacity
    }

    /** Stores every block of a `{ blocks: [{ lang, content, fg, bg, spans }] }` payload. */
    fun putAll(json: String) {
        val blocks = JSONObject(json).getJSONArray("blocks")
        val parsed = (0 until blocks.length()).map { i ->
            val block = blocks.getJSONObject(i)
            val spans = block.getJSONArray("spans")
            keyOf(block.getString("lang"), block.getString("content")) to Highlight(
                fg = block.getInt("fg"),
                bg = block.getInt("bg"),
                spans = IntArray(spans.length()) { spans.getInt(it) },
            )
        }
        synchronized(entries) { for ((key, highlight) in parsed) entries[key] = highlight }
    }

    operator fun get(lang: String, content: String): Highlight? = synchronized(entries) { entries[keyOf(lang, content)] }

    fun clear() = synchronized(entries) { entries.clear() }

    // JS keys by the trimmed language too, as Discord trims it before parsing.
    private fun keyOf(lang: String, content: String) = lang.trim() + '\u0000' + content
}
