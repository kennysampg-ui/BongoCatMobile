package com.bongocat.mobile

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.Rect
import android.graphics.RectF
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowManager
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Duas áreas flutuantes e transparentes, independentes do personagem:
 *  - "mouse": funciona como touchpad (arrastar o dedo move o mouse; toque = clique esquerdo;
 *             dois dedos = clique direito; mouse físico passando por cima também move);
 *  - "keys":  toque numa faixa aciona a tecla/pata correspondente (várias ao mesmo tempo).
 *
 * As áreas SÓ recebem toques dentro do próprio retângulo; o resto da tela segue normal.
 * Posições são guardadas em frações da área útil, por modo (osu!, Mania, Taiko, Catch).
 */
class InputZones(
    private val context: Context,
    private val wm: WindowManager,
    private val listener: Listener
) {
    interface Listener {
        /** Toque na faixa [lane] de [lanes] da área do teclado. */
        fun onLane(lane: Int, lanes: Int)

        /** Dedo arrastando na área do mouse (deslocamento em px e tamanho da área). */
        fun onPadDrag(dx: Float, dy: Float, w: Int, h: Int)

        /** Posição absoluta (0..1) de um mouse físico sobre a área. */
        fun onPadHover(nx: Float, ny: Float)

        fun onPadClick(right: Boolean)

        /** O usuário terminou de mover/redimensionar uma área: [rect] = x, y, w, h em frações. */
        fun onZoneEdited(kind: String, rect: DoubleArray)
    }

    companion object {
        const val MOUSE = "mouse"
        const val KEYS = "keys"
        private val DEFAULT_MOUSE = doubleArrayOf(0.03, 0.55, 0.42, 0.38)
        private val DEFAULT_KEYS = doubleArrayOf(0.55, 0.55, 0.42, 0.38)
    }

    private class Zone(val kind: String) {
        var view: ZoneView? = null
        var params: WindowManager.LayoutParams? = null
    }

    private val zones = mapOf(MOUSE to Zone(MOUSE), KEYS to Zone(KEYS))
    private var bounds = Rect(0, 0, 1080, 1920)
    private var visible = true

    private fun dp(v: Float) = (v * context.resources.displayMetrics.density).roundToInt()

    /** Cria, atualiza ou remove as áreas conforme as configurações. */
    fun apply(settings: JSONObject, b: Rect, lanes: Int) {
        bounds = Rect(b)
        if (!settings.optBoolean("zonesOn", false)) {
            removeAll()
            return
        }
        val mode = settings.optString("displayMode", "classic")
        val saved = settings.optJSONObject("zones")?.optJSONObject(mode)
        val locked = settings.optBoolean("zonesLocked", true)
        val visualOnly = settings.optBoolean("zonesVisualOnly", false) && locked
        val alpha = settings.float("zonesAlpha", 0.35f)
        for (zone in zones.values) {
            val rect = readRect(saved?.optJSONArray(zone.kind))
                ?: (if (zone.kind == MOUSE) DEFAULT_MOUSE else DEFAULT_KEYS)
            ensure(zone)
            val view = zone.view ?: continue
            val lp = zone.params ?: continue
            view.lanes = max(1, lanes)
            view.alphaF = alpha
            view.editing = !locked
            lp.x = bounds.left + (rect[0] * bounds.width()).roundToInt()
            lp.y = bounds.top + (rect[1] * bounds.height()).roundToInt()
            lp.width = max(dp(72f), (rect[2] * bounds.width()).roundToInt())
            lp.height = max(dp(72f), (rect[3] * bounds.height()).roundToInt())
            lp.flags = flags(visualOnly)
            view.visibility = if (visible) View.VISIBLE else View.GONE
            view.invalidate()
            try {
                wm.updateViewLayout(view, lp)
            } catch (_: Exception) {
            }
        }
    }

    fun setVisible(v: Boolean) {
        visible = v
        for (zone in zones.values) zone.view?.visibility = if (v) View.VISIBLE else View.GONE
    }

    fun removeAll() {
        for (zone in zones.values) {
            val v = zone.view ?: continue
            try {
                wm.removeViewImmediate(v)
            } catch (_: Exception) {
            }
            zone.view = null
            zone.params = null
        }
    }

    private fun readRect(a: JSONArray?): DoubleArray? {
        if (a == null || a.length() != 4) return null
        val r = DoubleArray(4) { a.optDouble(it, Double.NaN) }
        return if (r.any { it.isNaN() }) null else r
    }

    private fun flags(visualOnly: Boolean): Int {
        var f = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
            WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED
        if (visualOnly) f = f or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
        return f
    }

    private fun ensure(zone: Zone) {
        if (zone.view != null) return
        val view = ZoneView(zone.kind)
        val lp = WindowManager.LayoutParams(
            dp(160f), dp(160f),
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            flags(false),
            PixelFormat.TRANSLUCENT
        )
        lp.gravity = Gravity.TOP or Gravity.LEFT
        lp.title = "BongoCatZone-" + zone.kind
        try {
            wm.addView(view, lp)
            zone.view = view
            zone.params = lp
        } catch (_: Exception) {
        }
    }

    private fun commit(zone: Zone) {
        val lp = zone.params ?: return
        val bw = max(1, bounds.width()).toDouble()
        val bh = max(1, bounds.height()).toDouble()
        listener.onZoneEdited(
            zone.kind,
            doubleArrayOf(
                (lp.x - bounds.left) / bw, (lp.y - bounds.top) / bh,
                lp.width / bw, lp.height / bh
            )
        )
    }

    // ------------------------------------------------------------------ view de uma área

    @SuppressLint("ViewConstructor")
    private inner class ZoneView(val kind: String) : View(context) {
        var lanes = 2
        var alphaF = 0.35f
        var editing = false

        private val accent = if (kind == MOUSE) 0xFF4A8FE8.toInt() else 0xFF58B86A.toInt()
        private val fill = Paint(Paint.ANTI_ALIAS_FLAG)
        private val line = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = dp(2f).toFloat()
            pathEffect = DashPathEffect(floatArrayOf(dp(8f).toFloat(), dp(6f).toFloat()), 0f)
        }
        private val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            textAlign = Paint.Align.CENTER
            textSize = dp(13f).toFloat()
            isFakeBoldText = true
        }
        private val rect = RectF()
        private val slop = ViewConfiguration.get(context).scaledTouchSlop
        private val handle = dp(40f)

        // estado do gesto
        private var lastX = 0f
        private var lastY = 0f
        private var downX = 0f
        private var downY = 0f
        private var downTime = 0L
        private var moved = false
        private var maxPointers = 1
        private var secondary = false
        private var startX = 0
        private var startY = 0
        private var startW = 0
        private var startH = 0
        private var resizing = false

        override fun onDraw(c: Canvas) {
            val w = width.toFloat()
            val h = height.toFloat()
            val a = (alphaF * 255).roundToInt().coerceIn(0, 255)
            fill.color = (accent and 0x00FFFFFF) or ((a / 2) shl 24)
            line.color = (accent and 0x00FFFFFF) or (min(255, a + 60) shl 24)
            val inset = line.strokeWidth
            rect.set(inset, inset, w - inset, h - inset)
            val r = dp(14f).toFloat()
            c.drawRoundRect(rect, r, r, fill)
            c.drawRoundRect(rect, r, r, line)
            text.alpha = min(255, a + 80)
            if (kind == KEYS && lanes > 1) {
                for (i in 1 until lanes) {
                    val x = w * i / lanes
                    c.drawLine(x, inset * 3, x, h - inset * 3, line)
                }
                for (i in 0 until lanes) c.drawText((i + 1).toString(), w * (i + 0.5f) / lanes, h / 2f, text)
            }
            val label = when {
                editing && kind == MOUSE -> "MOUSE · arraste · canto = tamanho"
                editing -> "TECLADO · arraste · canto = tamanho"
                kind == MOUSE -> "MOUSE"
                else -> "TECLADO"
            }
            if (editing || kind == MOUSE) c.drawText(label, w / 2f, dp(22f).toFloat(), text)
            else c.drawText(label, w / 2f, dp(22f).toFloat(), text)
            if (editing) {
                val s = dp(16f).toFloat()
                c.drawLine(w - s - inset * 2, h - inset * 3, w - inset * 3, h - s - inset * 2, line)
                c.drawLine(w - s * 0.5f - inset * 2, h - inset * 3, w - inset * 3, h - s * 0.5f - inset * 2, line)
            }
        }

        override fun onTouchEvent(e: MotionEvent): Boolean =
            if (editing) editTouch(e) else useTouch(e)

        override fun onHoverEvent(e: MotionEvent): Boolean {
            if (editing || kind != MOUSE) return false
            if (e.actionMasked == MotionEvent.ACTION_HOVER_MOVE || e.actionMasked == MotionEvent.ACTION_HOVER_ENTER) {
                listener.onPadHover(e.x / max(1, width), e.y / max(1, height))
            }
            return true
        }

        // ---- uso normal (área travada)
        private fun useTouch(e: MotionEvent): Boolean {
            val isMouse = e.getToolType(e.actionIndex) == MotionEvent.TOOL_TYPE_MOUSE
            if (kind == KEYS) {
                if (e.actionMasked == MotionEvent.ACTION_DOWN || e.actionMasked == MotionEvent.ACTION_POINTER_DOWN) {
                    val i = e.actionIndex
                    val lane = (e.getX(i) / max(1, width) * lanes).toInt().coerceIn(0, lanes - 1)
                    listener.onLane(lane, lanes)
                }
                return true
            }
            when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    lastX = e.x; lastY = e.y; downX = e.x; downY = e.y
                    downTime = e.eventTime
                    moved = false
                    maxPointers = 1
                    secondary = isMouse && (e.buttonState and MotionEvent.BUTTON_SECONDARY) != 0
                    if (isMouse) listener.onPadHover(e.x / max(1, width), e.y / max(1, height))
                }
                MotionEvent.ACTION_POINTER_DOWN -> {
                    maxPointers = max(maxPointers, e.pointerCount)
                    lastX = e.getX(0); lastY = e.getY(0)
                }
                MotionEvent.ACTION_MOVE -> {
                    if (isMouse) {
                        listener.onPadHover(e.x / max(1, width), e.y / max(1, height))
                        if (abs(e.x - downX) > slop || abs(e.y - downY) > slop) moved = true
                    } else {
                        val x = e.getX(0)
                        val y = e.getY(0)
                        if (abs(x - downX) > slop || abs(y - downY) > slop) moved = true
                        if (e.pointerCount == 1 && moved) listener.onPadDrag(x - lastX, y - lastY, width, height)
                        lastX = x; lastY = y
                    }
                }
                MotionEvent.ACTION_UP -> {
                    val quick = e.eventTime - downTime < 350
                    if (!moved && quick) listener.onPadClick(secondary || maxPointers >= 2)
                }
            }
            return true
        }

        // ---- modo de edição: arrastar a área ou redimensionar pelo canto inferior direito
        private fun editTouch(e: MotionEvent): Boolean {
            val zone = zones[kind] ?: return false
            val lp = zone.params ?: return false
            when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    downX = e.rawX; downY = e.rawY
                    startX = lp.x; startY = lp.y; startW = lp.width; startH = lp.height
                    resizing = e.x > width - handle && e.y > height - handle
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = (e.rawX - downX).roundToInt()
                    val dy = (e.rawY - downY).roundToInt()
                    if (resizing) {
                        lp.width = (startW + dx).coerceIn(dp(72f), max(dp(72f), bounds.right - lp.x))
                        lp.height = (startH + dy).coerceIn(dp(72f), max(dp(72f), bounds.bottom - lp.y))
                    } else {
                        lp.x = (startX + dx).coerceIn(bounds.left, max(bounds.left, bounds.right - lp.width))
                        lp.y = (startY + dy).coerceIn(bounds.top, max(bounds.top, bounds.bottom - lp.height))
                    }
                    try {
                        wm.updateViewLayout(this, lp)
                    } catch (_: Exception) {
                    }
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> commit(zone)
            }
            return true
        }
    }
}
