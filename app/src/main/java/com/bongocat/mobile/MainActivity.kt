package com.bongocat.mobile

import android.Manifest
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.hardware.input.InputManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.ViewGroup
import android.webkit.WebView
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import org.json.JSONObject
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Tela principal: hospeda UMA WebView com a interface em HTML/CSS/JS (assets/www/index.html).
 * Todo o resto (sobreposição, permissões, arquivos, som) é nativo e exposto pela WebBridge.
 */
class MainActivity : ComponentActivity() {

    lateinit var store: SettingsStore
        private set
    lateinit var library: CharacterLibrary
        private set

    private lateinit var rootLayout: FrameLayout
    private lateinit var sounds: SoundManager
    private var web: WebView? = null
    private var bridge: WebBridge? = null
    private val io: ExecutorService = Executors.newSingleThreadExecutor()
    private var pendingPick: Pair<String, String>? = null

    private val pickLauncher =
        registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> onPicked(uri) }

    private val notificationLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { refreshUi() }

    private val inputListener = object : InputManager.InputDeviceListener {
        override fun onInputDeviceAdded(deviceId: Int) = refreshUi()
        override fun onInputDeviceRemoved(deviceId: Int) = refreshUi()
        override fun onInputDeviceChanged(deviceId: Int) = refreshUi()
    }

    // ---------------------------------------------------------------- ciclo de vida

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        if (Build.VERSION.SDK_INT >= 29) window.isNavigationBarContrastEnforced = false

        store = SettingsStore(this)
        library = CharacterLibrary(this)
        sounds = SoundManager(this)
        library.cleanupStale()

        rootLayout = FrameLayout(this)
        rootLayout.setBackgroundColor(getColor(R.color.surface))

        val webView = WebView(this)
        WebAssets.configure(webView)
        webView.setBackgroundColor(getColor(R.color.surface))
        val loader = WebAssets.createLoader(this, library.rootDir)
        webView.webViewClient = WebAssets.AssetClient(loader, onGone = { runOnUiThread { recreate() } })
        val b = WebBridge(this)
        webView.addJavascriptInterface(b, "Android")
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        bridge = b
        web = webView

        rootLayout.addView(
            webView,
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        )
        setContentView(rootLayout)

        // Respeita barras do sistema, recorte (notch) e teclado.
        ViewCompat.setOnApplyWindowInsetsListener(rootLayout) { v, insets ->
            val i = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or
                    WindowInsetsCompat.Type.displayCutout() or
                    WindowInsetsCompat.Type.ime()
            )
            v.setPadding(i.left, i.top, i.right, i.bottom)
            WindowInsetsCompat.CONSUMED
        }
        applyBarStyle()

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                val w = web
                if (w == null) {
                    finish()
                    return
                }
                w.evaluateJavascript(
                    "(window.BongoUI&&BongoUI.onBack&&BongoUI.onBack())?'1':'0'"
                ) { r -> if (r == null || !r.contains('1')) finish() }
            }
        })

        webView.loadUrl("${WebAssets.BASE}/assets/www/index.html")
    }

    override fun onStart() {
        super.onStart()
        (getSystemService(Context.INPUT_SERVICE) as InputManager).registerInputDeviceListener(inputListener, null)
    }

    override fun onStop() {
        (getSystemService(Context.INPUT_SERVICE) as InputManager).unregisterInputDeviceListener(inputListener)
        super.onStop()
    }

    override fun onResume() {
        super.onResume()
        web?.onResume()
        js("window.BongoUI&&BongoUI.setPaused&&BongoUI.setPaused(false)")
        refreshUi()
    }

    override fun onPause() {
        js("window.BongoUI&&BongoUI.setPaused&&BongoUI.setPaused(true)")
        web?.onPause() // pausa timers/renderização da interface enquanto o app não está visível
        super.onPause()
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        rootLayout.setBackgroundColor(getColor(R.color.surface))
        web?.setBackgroundColor(getColor(R.color.surface))
        applyBarStyle()
    }

    override fun onDestroy() {
        bridge?.detach()
        bridge = null
        io.shutdownNow()
        web?.let { w ->
            w.removeJavascriptInterface("Android")
            w.stopLoading()
            (w.parent as? ViewGroup)?.removeView(w)
            w.destroy() // sem WebView vazada
        }
        web = null
        sounds.release()
        super.onDestroy()
    }

    private fun applyBarStyle() {
        val night = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
            Configuration.UI_MODE_NIGHT_YES
        val c = WindowCompat.getInsetsController(window, window.decorView)
        c.isAppearanceLightStatusBars = !night
        c.isAppearanceLightNavigationBars = !night
    }

    // ---------------------------------------------------------------- JS helpers

    private fun js(script: String) {
        val w = web ?: return
        if (isDestroyed) return
        w.evaluateJavascript(script, null)
    }

    private fun refreshUi() {
        runOnUiThread { js("window.BongoUI&&BongoUI.refresh&&BongoUI.refresh()") }
    }

    // ---------------------------------------------------------------- chamadas vindas da WebBridge

    fun buildState(): String {
        val o = JSONObject()
        o.put("settings", store.read())
        o.put("library", library.all())
        val svc = OverlayService.instance
        o.put(
            "overlay",
            JSONObject()
                .put("permission", Settings.canDrawOverlays(this))
                .put("running", svc != null)
                .put("hidden", svc?.hidden ?: false)
        )
        val notif: Any = if (Build.VERSION.SDK_INT >= 33) {
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) ==
                PackageManager.PERMISSION_GRANTED
        } else {
            JSONObject.NULL
        }
        o.put("notifications", notif)
        o.put("a11y", JSONObject().put("enabled", isAccessibilityEnabled()))
        o.put(
            "shizuku",
            JSONObject()
                .put("installed", ShizukuInput.installed(this))
                .put("running", ShizukuInput.running())
                .put("granted", ShizukuInput.granted())
        )
        o.put("devices", InputDevicesInfo.snapshot())
        o.put(
            "app",
            JSONObject()
                .put("version", BuildConfig.VERSION_NAME)
                .put("sdk", Build.VERSION.SDK_INT)
                .put("debug", BuildConfig.DEBUG)
        )
        return o.toString()
    }

    private fun isAccessibilityEnabled(): Boolean {
        val enabled: String? = try {
            Settings.Secure.getString(contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES)
        } catch (_: Exception) {
            null
        }
        if (enabled.isNullOrEmpty()) return false
        val me = ComponentName(this, KeyPulseAccessibilityService::class.java)
        return enabled.split(':').any { ComponentName.unflattenFromString(it) == me }
    }

    fun onSettingsSaved() {
        runOnUiThread { OverlayService.instance?.applySettings() }
    }

    fun startOverlayFromUi(): String {
        if (!Settings.canDrawOverlays(this)) return "no_permission"
        runOnUiThread { OverlayService.start(this) }
        return "ok"
    }

    fun stopOverlayFromUi() {
        runOnUiThread { OverlayService.stop(this) }
    }

    fun setOverlayHiddenFromUi(hidden: Boolean) {
        runOnUiThread { OverlayService.instance?.setHidden(hidden) }
    }

    fun requestOverlayPermission() {
        runOnUiThread {
            startActivity(
                Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName"))
            )
        }
    }

    fun requestNotificationPermission() {
        runOnUiThread {
            if (Build.VERSION.SDK_INT >= 33) {
                notificationLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }

    fun openAccessibilitySettings() {
        runOnUiThread { startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }
    }

    /** Pede a permissão do Shizuku (se ele estiver ativo) ou abre o app/página dele. */
    fun requestShizuku() {
        runOnUiThread {
            try {
                if (ShizukuInput.running()) {
                    ShizukuInput.requestPermission()
                } else {
                    val launch = packageManager.getLaunchIntentForPackage(ShizukuInput.PACKAGE)
                    startActivity(
                        launch ?: Intent(Intent.ACTION_VIEW, Uri.parse("https://shizuku.rikka.app/download/"))
                    )
                }
            } catch (_: Exception) {
            }
        }
    }

    fun openAppSettings() {
        runOnUiThread {
            startActivity(
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))
            )
        }
    }

    fun playSoundKind(kind: String) {
        val s = store.read()
        if (!s.optBoolean("sound", true)) return
        val k = SoundManager.kindFromName(kind)
        if (k < 0) return
        runOnUiThread { sounds.play(k, s.float("volume", 0.7f)) }
    }

    // ---------------------------------------------------------------- importação de arquivos

    fun launchPicker(requestId: String, charId: String) {
        runOnUiThread {
            if (!CharacterLibrary.isValidCharId(charId)) {
                deliverPick(requestId, JSONObject().put("ok", false).put("error", "bad_id"))
                return@runOnUiThread
            }
            pendingPick = Pair(requestId, charId)
            try {
                pickLauncher.launch(arrayOf("image/*"))
            } catch (e: Exception) {
                pendingPick = null
                deliverPick(requestId, JSONObject().put("ok", false).put("error", "no_picker"))
            }
        }
    }

    private fun onPicked(uri: Uri?) {
        val pending = pendingPick ?: return
        pendingPick = null
        val (reqId, charId) = pending
        if (uri == null) {
            deliverPick(reqId, JSONObject().put("ok", false).put("error", "cancelled"))
            return
        }
        io.execute {
            val result = FileImporter.importImage(applicationContext, uri, charId, library.rootDir)
            runOnUiThread { deliverPick(reqId, result) }
        }
    }

    private fun deliverPick(reqId: String, result: JSONObject) {
        js(
            "window.BongoNative&&BongoNative.onPicked(" +
                JSONObject.quote(reqId) + "," + JSONObject.quote(result.toString()) + ")"
        )
    }
}
