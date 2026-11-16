package com.bongocat.mobile

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Rect
import android.graphics.drawable.GradientDrawable
import android.hardware.display.DisplayManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.provider.Settings
import android.util.DisplayMetrics
import android.view.Display
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowManager
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.util.Locale
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Serviço em primeiro plano que mantém a janela flutuante (TYPE_APPLICATION_OVERLAY) com o
 * personagem. Existe NO MÁXIMO uma WebView aqui: ensureOverlay() nunca cria uma segunda.
 *
 * Eventos que conseguimos detectar (limitações reais do Android):
 *  - toque / clique / hover / roda do mouse SOBRE o personagem  -> confiável;
 *  - toque/clique FORA do personagem (em outros apps)            -> só um "aviso" sem coordenadas;
 *  - teclado físico                                              -> só via serviço de acessibilidade opcional;
 *  - movimento do mouse fora do personagem / teclado virtual     -> NÃO detectável (não é entregue a apps).
 */
class OverlayService : Service() {

    companion object {
        const val ACTION_START = "com.bongocat.mobile.action.START"
        const val ACTION_STOP = "com.bongocat.mobile.action.STOP"
        const val ACTION_TOGGLE = "com.bongocat.mobile.action.TOGGLE"

        private const val CHANNEL_ID = "bongo_overlay"
        private const val NOTIF_ID = 4101
        private const val BOX_DP = 150f
        private const val CONTROLS_HIDE_MS = 5000L

        @Volatile
        var instance: OverlayService? = null
            private set

        fun start(context: Context) {
            ContextCompat.startForegroundService(
                context,
                Intent(context, OverlayService::class.java).setAction(ACTION_START)
            )
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, OverlayService::class.java))
        }
    }

    private val handler = Handler(Looper.getMainLooper())
    private lateinit var wm: WindowManager
    private lateinit var store: SettingsStore
    private lateinit var library: CharacterLibrary
    private lateinit var sounds: SoundManager

    private var root: OverlayRootView? = null
    private var web: WebView? = null
    private var charFrame: FrameLayout? = null
    private var controls: LinearLayout? = null
    private var params: WindowManager.LayoutParams? = null
    private var settings: JSONObject = Defaults.settings()
    private var cachedBounds = Rect(0, 0, 1080, 1920)

    private var pageReady = false
    private var screenOn = true
    private var controlsVisible = false
    private var receiverRegistered = false

    var hidden = false
        private set

    private var typeToggle = false
    private var lastOutsideAt = 0L
    private var lastKeyAt = 0L
    private var lastHoverAt = 0L
    private var lastHoverX = 0f
    private var lastHoverY = 0f

    private val hideControlsRunnable = Runnable { setControlsVisible(false) }

    private val screenReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                Intent.ACTION_SCREEN_OFF -> {
                    screenOn = false
                    updateRunState()
                }
                Intent.ACTION_SCREEN_ON -> {
                    screenOn = true
                    updateRunState()
                }
            }
        }
    }

    // ---------------------------------------------------------------- ciclo de vida

    override fun onCreate() {
        super.onCreate()
        instance = this
        wm = getSystemService(WINDOW_SERVICE) as WindowManager
        store = SettingsStore(this)
        library = CharacterLibrary(this)
        sounds = SoundManager(this)
        createChannel()

        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_OFF)
            addAction(Intent.ACTION_SCREEN_ON)
        }
        ContextCompat.registerReceiver(this, screenReceiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
        receiverRegistered = true
        screenOn = (getSystemService(POWER_SERVICE) as PowerManager).isInteractive
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Precisa chamar startForeground logo, senão o Android derruba o app (5 s).
        try {
            startForegroundCompat()
        } catch (e: Exception) {
            stopSelf()
            return START_NOT_STICKY
        }

        when (intent?.action) {
            ACTION_STOP -> {
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_TOGGLE -> {
                if (root != null) {
                    setHidden(!hidden)
                    return START_STICKY
                }
            }
        }

        if (!Settings.canDrawOverlays(this)) {
            stopSelf()
            return START_NOT_STICKY
        }
        ensureOverlay()
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        // Rotação / dobrável: recalcula a área segura depois que o sistema termina de girar.
        handler.postDelayed({ applySettings() }, 250)
    }

    override fun onDestroy() {
        removeOverlay()
        if (receiverRegistered) {
            try {
                unregisterReceiver(screenReceiver)
            } catch (_: Exception) {
            }
            receiverRegistered = false
        }
        sounds.release()
        instance = null
        super.onDestroy()
    }

    // ---------------------------------------------------------------- notificação

    private fun createChannel() {
        val nm = getSystemService(NotificationManager::class.java)
        val ch = NotificationChannel(
            CHANNEL_ID,
            getString(R.string.notif_channel),
            NotificationManager.IMPORTANCE_LOW
        )
        ch.setShowBadge(false)
        nm.createNotificationChannel(ch)
    }

    private fun serviceIntent(action: String, req: Int): PendingIntent =
        PendingIntent.getService(
            this, req,
            Intent(this, OverlayService::class.java).setAction(action),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

    private fun buildNotification(): Notification {
        val open = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_paw)
            .setContentTitle(getString(R.string.notif_title))
            .setContentText(getString(R.string.notif_text))
            .setContentIntent(open)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .addAction(0, getString(if (hidden) R.string.notif_show else R.string.notif_hide), serviceIntent(ACTION_TOGGLE, 1))
            .addAction(0, getString(R.string.notif_close), serviceIntent(ACTION_STOP, 2))
            .build()
    }

    private fun startForegroundCompat() {
        val n = buildNotification()
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(NOTIF_ID, n)
        }
    }

    private fun refreshNotification() {
        getSystemService(NotificationManager::class.java).notify(NOTIF_ID, buildNotification())
    }

    // ---------------------------------------------------------------- criação da janela

    private fun dp(v: Float): Int = (v * resources.displayMetrics.density).roundToInt()

    private fun windowFlags(): Int {
        var f = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
            WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED
        if (settings.optBoolean("reactOutside", true)) {
            f = f or WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH
        }
        return f
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun ensureOverlay() {
        if (root != null) { // já existe: nunca cria uma segunda WebView
            applySettings()
            return
        }
        settings = store.read()
        refreshBounds()

        val webView = WebView(this)
        WebAssets.configure(webView)
        webView.setBackgroundColor(Color.TRANSPARENT)
        webView.isFocusable = false
        webView.isFocusableInTouchMode = false
        webView.isClickable = false
        // Sem ponte JavaScript aqui: a página da sobreposição só RECEBE eventos, não chama o Android.
        val loader = WebAssets.createLoader(this, library.rootDir)
        webView.webViewClient = WebAssets.AssetClient(
            loader,
            onLoaded = {
                pageReady = true
                pushConfig()
                updateRunState()
            },
            onGone = { rebuildOverlay() }
        )

        // View transparente por cima da WebView: recebe arrastar/toque/hover/roda do mouse.
        val shield = View(this)
        val frame = FrameLayout(this)
        frame.addView(webView, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        frame.addView(shield, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))

        val bar = buildControls()
        bar.visibility = View.GONE

        val rootView = OverlayRootView(this)
        rootView.orientation = LinearLayout.VERTICAL
        rootView.addView(frame, LinearLayout.LayoutParams(dp(BOX_DP), dp(BOX_DP)))
        val barLp = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT
        )
        barLp.gravity = Gravity.CENTER_HORIZONTAL
        barLp.topMargin = dp(4f)
        rootView.addView(bar, barLp)
        rootView.onOutside = { e -> handleOutside(e) }

        attachInput(shield)

        val lp = WindowManager.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            windowFlags(),
            PixelFormat.TRANSLUCENT
        )
        lp.gravity = Gravity.TOP or Gravity.LEFT
        lp.x = 0
        lp.y = 0
        lp.title = "BongoCatOverlay"
        lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES

        root = rootView
        web = webView
        charFrame = frame
        controls = bar
        params = lp

        try {
            wm.addView(rootView, lp)
        } catch (e: Exception) {
            removeOverlay()
            stopSelf()
            return
        }
        applySettings()
        webView.loadUrl("${WebAssets.BASE}/assets/www/overlay.html")
    }

    private fun rebuildOverlay() {
        handler.post {
            removeOverlay()
            if (Settings.canDrawOverlays(this)) ensureOverlay()
        }
    }

    private fun removeOverlay() {
        handler.removeCallbacksAndMessages(null)
        val r = root
        if (r != null) {
            try {
                wm.removeViewImmediate(r)
            } catch (_: Exception) {
            }
        }
        val w = web
        if (w != null) {
            w.stopLoading()
            w.webViewClient = WebViewClient()
            (w.parent as? ViewGroup)?.removeView(w)
            w.destroy() // libera a WebView: sem vazamento
        }
        root = null
        web = null
        charFrame = null
        controls = null
        params = null
        pageReady = false
        controlsVisible = false
    }

    // ---------------------------------------------------------------- área segura e posição

    @Suppress("DEPRECATION")
    private fun refreshBounds() {
        val dm = DisplayMetrics()
        val display = (getSystemService(DISPLAY_SERVICE) as DisplayManager).getDisplay(Display.DEFAULT_DISPLAY)
        display.getRealMetrics(dm)
        val w = dm.widthPixels
        val h = dm.heightPixels
        var l = 0
        var t = 0
        var r = w
        var b = h
        if (Build.VERSION.SDK_INT >= 30) {
            // Barras de status/navegação e recorte (notch) reais da tela atual.
            val ins = wm.currentWindowMetrics.windowInsets.getInsetsIgnoringVisibility(
                WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout()
            )
            l = ins.left
            t = ins.top
            r = w - ins.right
            b = h - ins.bottom
        } else {
            // Android 10: getMetrics() exclui a barra de navegação; a de status vem de um recurso.
            val usable = DisplayMetrics()
            display.getMetrics(usable)
            val id = resources.getIdentifier("status_bar_height", "dimen", "android")
            t = if (id > 0) resources.getDimensionPixelSize(id) else dp(24f)
            r = usable.widthPixels
            b = usable.heightPixels
        }
        cachedBounds = Rect(l, t, max(l + 1, r), max(t + 1, b))
    }

    private fun boxPx(): Int {
        val b = cachedBounds
        val raw = (dp(BOX_DP) * settings.float("size", 1f)).roundToInt()
        val limit = (min(b.width(), b.height()) * 0.9f).roundToInt()
        return raw.coerceIn(dp(56f), max(dp(56f), limit))
    }

    private fun moveTo(x: Int, y: Int) {
        val r = root ?: return
        val p = params ?: return
        val b = cachedBounds
        r.measure(
            View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED),
            View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED)
        )
        val w = r.measuredWidth
        val h = r.measuredHeight
        p.x = x.coerceIn(b.left, max(b.left, b.right - w))
        p.y = y.coerceIn(b.top, max(b.top, b.bottom - h))
        try {
            wm.updateViewLayout(r, p)
        } catch (_: Exception) {
        }
    }

    private fun applyPosition() {
        val b = cachedBounds
        val box = boxPx()
        val freeW = max(1, b.width() - box)
        val freeH = max(1, b.height() - box)
        val x = b.left + (settings.float("posX", 0.85f) * freeW).roundToInt()
        val y = b.top + (settings.float("posY", 0.65f) * freeH).roundToInt()
        moveTo(x, y)
    }

    private fun persistPosition() {
        val p = params ?: return
        val b = cachedBounds
        val box = boxPx()
        val freeW = max(1, b.width() - box)
        val freeH = max(1, b.height() - box)
        val px = ((p.x - b.left) / freeW.toFloat()).coerceIn(0f, 1f)
        val py = ((p.y - b.top) / freeH.toFloat()).coerceIn(0f, 1f)
        settings = store.update {
            it.put("posX", px.toDouble())
            it.put("posY", py.toDouble())
        }
    }

    // ---------------------------------------------------------------- configurações

    /** Relê as configurações salvas e aplica tamanho, opacidade, posição, personagem e velocidade. */
    fun applySettings() {
        val r = root ?: return
        val p = params ?: return
        val frame = charFrame ?: return
        settings = store.read()
        refreshBounds()

        val box = boxPx()
        val flp = frame.layoutParams as LinearLayout.LayoutParams
        flp.width = box
        flp.height = box
        frame.layoutParams = flp

        r.alpha = settings.float("opacity", 1f)

        val flags = windowFlags()
        if (p.flags != flags) p.flags = flags

        applyPosition()
        pushConfig()
    }

    private fun pushConfig() {
        val w = web ?: return
        if (!pageReady) return
        val payload = JSONObject()
        payload.put("settings", settings)
        library.find(settings.optString("characterId"))?.let { payload.put("character", it) }
        w.evaluateJavascript("BongoOverlay.configure($payload)", null)
    }

    // ---------------------------------------------------------------- mostrar / ocultar / pausar

    fun setHidden(h: Boolean) {
        hidden = h
        root?.visibility = if (h) View.GONE else View.VISIBLE
        if (h) {
            handler.removeCallbacks(hideControlsRunnable)
            controlsVisible = false
            controls?.visibility = View.GONE
        } else {
            params?.let { moveTo(it.x, it.y) }
        }
        updateRunState()
        refreshNotification()
    }

    /** Pausa a WebView e as animações quando oculto ou com a tela apagada (economia de bateria). */
    private fun updateRunState() {
        val w = web ?: return
        val active = !hidden && screenOn
        if (active) {
            w.onResume()
            if (pageReady) w.evaluateJavascript("BongoOverlay.setPaused(false)", null)
        } else {
            if (pageReady) w.evaluateJavascript("BongoOverlay.setPaused(true)", null)
            handler.postDelayed({
                if (hidden || !screenOn) web?.onPause()
            }, 150)
        }
    }

    // ---------------------------------------------------------------- eventos -> personagem

    private fun emit(type: String, dx: Float = 0f, dy: Float = 0f) {
        if (hidden || !pageReady) return
        web?.evaluateJavascript(
            String.format(Locale.US, "BongoOverlay.event('%s',%.3f,%.3f)", type, dx, dy), null
        )
        if (settings.optBoolean("sound", true)) {
            val vol = settings.float("volume", 0.7f)
            when (type) {
                "keyboard" -> {
                    typeToggle = !typeToggle
                    sounds.play(if (typeToggle) SoundManager.LOW else SoundManager.HIGH, vol)
                }
                "clickLeft" -> sounds.play(SoundManager.LOW, vol)
                "clickRight" -> sounds.play(SoundManager.HIGH, vol)
                "touch" -> sounds.play(SoundManager.TICK, vol)
            }
        }
    }

    /** Chamado pelo serviço de acessibilidade opcional: apenas "uma tecla foi pressionada". */
    fun onKeyPulse() {
        handler.post {
            if (hidden || !pageReady) return@post
            val now = SystemClock.uptimeMillis()
            if (now - lastKeyAt < 25) return@post
            lastKeyAt = now
            emit("keyboard")
        }
    }

    private fun handleOutside(e: MotionEvent) {
        if (!settings.optBoolean("reactOutside", true)) return
        val now = SystemClock.uptimeMillis()
        if (now - lastOutsideAt < 40) return
        lastOutsideAt = now
        val mouse = e.getToolType(0) == MotionEvent.TOOL_TYPE_MOUSE
        val type = when {
            !mouse -> "touch"
            (e.buttonState and MotionEvent.BUTTON_SECONDARY) != 0 -> "clickRight"
            else -> "clickLeft"
        }
        emit(type)
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun attachInput(shield: View) {
        val slop = ViewConfiguration.get(this).scaledTouchSlop
        var downX = 0f
        var downY = 0f
        var startX = 0
        var startY = 0
        var moved = false
        var longFired = false
        var isMouse = false
        var secondary = false
        val longPress = Runnable {
            if (!moved) {
                longFired = true
                toggleControls()
            }
        }

        shield.setOnTouchListener { v, e ->
            val p = params
            when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    refreshBounds()
                    downX = e.rawX
                    downY = e.rawY
                    startX = p?.x ?: 0
                    startY = p?.y ?: 0
                    moved = false
                    longFired = false
                    isMouse = e.getToolType(0) == MotionEvent.TOOL_TYPE_MOUSE
                    secondary = isMouse && (e.buttonState and MotionEvent.BUTTON_SECONDARY) != 0
                    handler.postDelayed(longPress, ViewConfiguration.getLongPressTimeout().toLong())
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = e.rawX - downX
                    val dy = e.rawY - downY
                    if (!moved && (abs(dx) > slop || abs(dy) > slop)) {
                        moved = true
                        handler.removeCallbacks(longPress)
                    }
                    if (moved && !secondary) {
                        moveTo(startX + dx.roundToInt(), startY + dy.roundToInt())
                    }
                }
                MotionEvent.ACTION_UP -> {
                    handler.removeCallbacks(longPress)
                    if (moved) {
                        if (!secondary) persistPosition()
                    } else if (!longFired) {
                        v.performClick()
                        emit(
                            when {
                                !isMouse -> "touch"
                                secondary -> "clickRight"
                                else -> "clickLeft"
                            }
                        )
                    }
                }
                MotionEvent.ACTION_CANCEL -> {
                    handler.removeCallbacks(longPress)
                    if (moved && !secondary) persistPosition()
                }
            }
            true
        }

        // Mouse (USB/Bluetooth) passando por cima do personagem.
        shield.setOnHoverListener { _, e ->
            when (e.actionMasked) {
                MotionEvent.ACTION_HOVER_ENTER -> {
                    lastHoverX = e.x
                    lastHoverY = e.y
                }
                MotionEvent.ACTION_HOVER_MOVE -> {
                    val now = SystemClock.uptimeMillis()
                    if (now - lastHoverAt >= 33) {
                        lastHoverAt = now
                        val unit = max(1f, boxPx() * 0.15f)
                        val dx = ((e.x - lastHoverX) / unit).coerceIn(-1f, 1f)
                        val dy = ((e.y - lastHoverY) / unit).coerceIn(-1f, 1f)
                        lastHoverX = e.x
                        lastHoverY = e.y
                        emit("mouseMove", dx, dy)
                    }
                }
            }
            true
        }

        // Roda do mouse sobre o personagem.
        shield.setOnGenericMotionListener { _, e ->
            if (e.actionMasked == MotionEvent.ACTION_SCROLL) {
                val v = e.getAxisValue(MotionEvent.AXIS_VSCROLL).coerceIn(-1f, 1f)
                emit("mouseMove", 0f, -v)
                true
            } else {
                false
            }
        }
    }

    // ---------------------------------------------------------------- barra de controles

    private fun buildControls(): LinearLayout {
        val bar = LinearLayout(this)
        bar.orientation = LinearLayout.HORIZONTAL
        bar.gravity = Gravity.CENTER
        val bg = GradientDrawable()
        bg.setColor(0xE61E1B2E.toInt())
        bg.cornerRadius = dp(22f).toFloat()
        bar.background = bg
        bar.setPadding(dp(6f), dp(2f), dp(6f), dp(2f))

        fun add(label: String, desc: String, action: () -> Unit) {
            val tv = TextView(this)
            tv.text = label
            tv.textSize = 18f
            tv.setTextColor(Color.WHITE)
            tv.gravity = Gravity.CENTER
            tv.contentDescription = desc
            tv.setOnClickListener {
                action()
                scheduleControlsHide()
            }
            bar.addView(tv, LinearLayout.LayoutParams(dp(40f), dp(40f)))
        }

        add("−", "Diminuir") { changeSize(-0.1f) }
        add("+", "Aumentar") { changeSize(0.1f) }
        add("👁", "Ocultar") { setHidden(true) }
        add("⚙", "Abrir o app") { openApp() }
        add("✕", "Fechar a sobreposição") { stopSelf() }
        return bar
    }

    private fun toggleControls() = setControlsVisible(!controlsVisible)

    private fun setControlsVisible(v: Boolean) {
        controlsVisible = v
        controls?.visibility = if (v) View.VISIBLE else View.GONE
        handler.removeCallbacks(hideControlsRunnable)
        if (v) handler.postDelayed(hideControlsRunnable, CONTROLS_HIDE_MS)
        params?.let { moveTo(it.x, it.y) }
    }

    private fun scheduleControlsHide() {
        handler.removeCallbacks(hideControlsRunnable)
        if (controlsVisible) handler.postDelayed(hideControlsRunnable, CONTROLS_HIDE_MS)
    }

    private fun changeSize(delta: Float) {
        val s = (settings.float("size", 1f) + delta).coerceIn(0.4f, 2.5f)
        settings = store.update { it.put("size", s.toDouble()) }
        applySettings()
    }

    private fun openApp() {
        try {
            startActivity(
                Intent(this, MainActivity::class.java)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            )
        } catch (_: Exception) {
        }
    }
}
