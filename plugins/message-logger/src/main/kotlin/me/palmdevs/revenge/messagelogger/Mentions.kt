package me.palmdevs.revenge.messagelogger

import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.TextPaint
import android.text.TextUtils
import android.text.style.CharacterStyle
import android.text.style.UpdateAppearance

// Must match the markers in JS
private const val MENTION_START = ''
private const val MENTION_SEPARATOR = ''
private const val MENTION_END = ''

/** Recolors mentions of deleted messages. Must run before [styleHistory], so edits look faded as well. */
internal fun SpannableStringBuilder.styleMentions() {
    if (TextUtils.indexOf(this, MENTION_START) < 0) return

    // Backwards, so earlier markers keep their positions
    while (true) {
        val text = toString()
        val start = text.lastIndexOf(MENTION_START)
        if (start < 0) return

        val separator = text.indexOf(MENTION_SEPARATOR, start)
        val end = text.indexOf(MENTION_END, start)
        if (separator !in 0..end) {
            delete(start, start + 1)
            continue
        }

        val color = text.substring(start + 1, separator).toIntOrNull()
        delete(end, end + 1)
        delete(start, separator + 1)

        val mentionEnd = start + end - separator - 1
        if (color != null) setSpan(MentionColorSpan(color), start, mentionEnd, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
    }
}

// Added after the mention's own spans, so it wins over their colors and role gradients
private class MentionColorSpan(private val color: Int) : CharacterStyle(), UpdateAppearance {
    override fun updateDrawState(paint: TextPaint) {
        paint.color = color
        paint.shader = null
    }
}
