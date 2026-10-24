package me.palmdevs.revenge.messagelogger

import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Paint
import android.os.Handler
import android.os.Looper
import android.text.SpannableStringBuilder
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import de.robv.android.xposed.XC_MethodHook
import de.robv.android.xposed.XposedBridge
import io.github.revenge.xposed.api.DexFinder
import org.json.JSONArray
import org.luckypray.dexkit.wrap.DexMethod
import java.lang.reflect.Field
import java.lang.reflect.Method
import java.lang.reflect.Modifier
import java.util.Collections
import java.util.WeakHashMap
import java.util.concurrent.ConcurrentHashMap

private const val DRAWEE_SPAN_TEXT_VIEW = "com.facebook.drawee.span.SimpleDraweeSpanTextView"
private const val MESSAGE = "com.discord.chat.bridge.Message"
private const val MESSAGE_VIEW = "com.discord.chat.presentation.message.MessageView"

private const val GREYED_ALPHA = 0.5f

internal class LoggerHooks(dexFinder: DexFinder) {
    private val dimmed = ConcurrentHashMap.newKeySet<String>()

    // Main thread only. Views showing an attachment, or a message's avatar
    private val bound = WeakHashMap<View, String>()
    private val greyed = Collections.newSetFromMap(WeakHashMap<View, Boolean>())
    private var viewIds: ViewIds? = null

    private val mainHandler = Handler(Looper.getMainLooper())

    private val greyedPaint = Paint().apply {
        colorFilter = ColorMatrixColorFilter(ColorMatrix().apply { setSaturation(0f) })
        alpha = (GREYED_ALPHA * 255).toInt()
    }

    private val attachmentOf: Method
    private val accessoryClass: Class<*>
    private val itemViewField: Field
    private var attachmentIdField: Field? = null

    private val messageClass = dexFinder.classLoader.loadClass(MESSAGE)
    private val messageIdField = messageClass.getDeclaredField("id").apply { isAccessible = true }
    private val textColorField = messageClass.getDeclaredField("textColor").apply { isAccessible = true }

    private val unhooks: List<XC_MethodHook.Unhook>

    init {
        // Message content is set with this after Discord appends its edited label
        val setDraweeSpanStringBuilder = dexFinder.classLoader.loadClass(DRAWEE_SPAN_TEXT_VIEW).declaredMethods
            .single { it.name == "setDraweeSpanStringBuilder" }

        val attachmentClass = dexFinder.findClass {
            matcher {
                usingEqStrings("Attachment(id=", ", filename=")
            }
        } ?: error("Attachment not found")

        // Returns the accessory showing an attachment, the class all attachment accessories extend
        accessoryClass = dexFinder.findMethod {
            matcher {
                paramTypes(attachmentClass.name, MESSAGE, "int", "int", "int", "java.lang.Boolean")
            }
        }?.returnType ?: error("Attachment accessory factory not found")

        attachmentOf = accessoryClass.declaredMethods.single { it.parameterCount == 0 && it.returnType == attachmentClass }
        val uploadOverlay = accessoryClass.declaredMethods.single {
            it.parameterTypes.singleOrNull()?.name == "kotlin.jvm.functions.Function2"
        }

        val bindAccessory = dexFinder.findMethod {
            matcher {
                paramCount(2)
                usingEqStrings("reactions", "addNewReactionAccessibilityLabel")
            }
        } ?: error("MessageAccessoriesAdapter.onBindViewHolder not found")

        val viewHolderClass = bindAccessory.parameterTypes[0]
        itemViewField = generateSequence<Class<*>>(viewHolderClass) { it.superclass }
            .flatMap { it.declaredFields.asSequence() }
            .first { it.type == View::class.java && !Modifier.isStatic(it.modifiers) }
            .apply { isAccessible = true }

        // Attachments in a grid have an adapter of their own
        val bindGridAttachment = dexFinder.findMethod {
            matcher {
                paramTypes(viewHolderClass.name, "int")
                addInvoke(DexMethod(uploadOverlay).serialize())
            }
        } ?: error("Attachment grid adapter onBindViewHolder not found")

        val setMessage = dexFinder.findMethod {
            matcher {
                declaredClass(MESSAGE_VIEW)
                usingEqStrings("message", "messageContext", "eventHandler")
            }
        } ?: error("MessageView.setMessage not found")

        unhooks = listOf(
            setMessage.hook(after = ::bindMessage),
            setDraweeSpanStringBuilder.hook(before = { param ->
                (param.args[0] as? SpannableStringBuilder)?.run {
                    styleMentions()
                    styleHistory()
                }
            }),
            bindAccessory.hook(after = attachmentBinder(bindAccessory)),
            bindGridAttachment.hook(after = attachmentBinder(bindGridAttachment)),
        )
    }

    fun setDimmed(json: String, dim: Boolean) {
        val array = JSONArray(json)
        val ids = (0 until array.length()).map(array::getString).toSet()
        if (dim) dimmed.addAll(ids) else dimmed.removeAll(ids)

        // Attachments that didn't change aren't bound again
        mainHandler.post {
            for ((view, id) in bound) if (id in ids) view.setGreyed(dim)
        }
    }

    fun clear() = dimmed.clear()

    fun dispose() {
        for (unhook in unhooks) unhook.unhook()
        dimmed.clear()

        mainHandler.post {
            for (view in greyed.toList()) view.setGreyed(false)
            bound.clear()
        }
    }

    private fun attachmentBinder(onBindViewHolder: Method): (XC_MethodHook.MethodHookParam) -> Unit {
        // Adapters keep their items in their only list
        val items = onBindViewHolder.declaringClass.declaredFields
            .single { List::class.java.isAssignableFrom(it.type) && !Modifier.isStatic(it.modifiers) }
            .apply { isAccessible = true }

        return { param -> bindAttachment(param, items) }
    }

    private fun bindAttachment(param: XC_MethodHook.MethodHookParam, itemsField: Field) {
        val view = itemViewField.get(param.args[0]) as View
        val item = (itemsField.get(param.thisObject) as List<*>).getOrNull(param.args[1] as Int)
        val id = item?.takeIf(accessoryClass::isInstance)?.let { attachmentId(attachmentOf.invoke(it)!!) }

        if (id != null) bound[view] = id else bound.remove(view)
        view.setGreyed(id != null && id in dimmed)
    }

    private fun bindMessage(param: XC_MethodHook.MethodHookParam) {
        val view = param.thisObject as ViewGroup
        val message = param.args[0]
        val id = messageIdField.get(message) as String
        val ids = viewIds ?: ViewIds(view).also { viewIds = it }

        for (avatar in ids.avatars.mapNotNull(view::childWithId)) {
            bound[avatar] = id
            avatar.setGreyed(id in dimmed)
        }

        // Discord colors guild tags with the theme on every bind, so only deleted ones need it
        if (id !in dimmed) return
        val color = textColorField.get(message) as? Int? ?: return
        val header = view.childWithId(ids.header) ?: return
        for (chiplet in ids.chiplets)
            header.findViewById<View>(chiplet)?.findViewById<TextView>(ids.tag)?.setTextColor(color)
    }

    private class ViewIds(view: View) {
        val avatars = listOf(view.idOf("author_avatar"), view.idOf("author_avatar_decoration"))
        val header = view.idOf("header")
        val chiplets = listOf(view.idOf("clan_tag_chiplet"), view.idOf("lobby_tag_chiplet"))
        val tag = view.idOf("tag")
    }

    private fun View.setGreyed(grey: Boolean) {
        if (grey) {
            if (greyed.add(this)) setLayerType(View.LAYER_TYPE_HARDWARE, greyedPaint)
        } else if (greyed.remove(this)) {
            setLayerType(View.LAYER_TYPE_NONE, null)
        }
    }

    // toString the data class so we can get the fields
    private fun attachmentId(attachment: Any): String? {
        val field = attachmentIdField ?: run {
            val id = attachment.toString().substringAfter("Attachment(id=").substringBefore(", ")
            attachment.javaClass.declaredFields
                .filter { it.type == String::class.java }
                .onEach { it.isAccessible = true }
                .firstOrNull { it.get(attachment) == id }
                ?.also { attachmentIdField = it }
        } ?: return null

        return field.get(attachment) as String?
    }
}

@Suppress("DiscouragedApi")
private fun View.idOf(name: String) = resources.getIdentifier(name, "id", context.packageName)

// Not findViewById, as nested messages (such as replies) have views with the same IDs
private fun ViewGroup.childWithId(id: Int): View? =
    (0 until childCount).asSequence().map(::getChildAt).firstOrNull { it.id == id }

private inline fun Method.hook(
    crossinline before: (XC_MethodHook.MethodHookParam) -> Unit = {},
    crossinline after: (XC_MethodHook.MethodHookParam) -> Unit = {},
): XC_MethodHook.Unhook = XposedBridge.hookMethod(this, object : XC_MethodHook() {
    override fun beforeHookedMethod(param: MethodHookParam) = before(param)
    override fun afterHookedMethod(param: MethodHookParam) = after(param)
})
