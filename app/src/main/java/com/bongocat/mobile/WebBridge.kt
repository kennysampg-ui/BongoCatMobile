package com.bongocat.mobile

import android.webkit.JavascriptInterface

/**
 * Ponte JavaScript -> Kotlin usada SÓ pela interface do app (index.html).
 * Os métodos rodam numa thread da WebView; tudo que mexe com UI é repassado à MainActivity,
 * que usa runOnUiThread. A página da sobreposição não recebe esta ponte.
 */
class WebBridge(host: MainActivity) {

    @Volatile
    private var host: MainActivity? = host

    fun detach() {
        host = null
    }

    @JavascriptInterface
    fun getState(): String = host?.buildState() ?: "{}"

    @JavascriptInterface
    fun saveSettings(json: String): Boolean {
        val h = host ?: return false
        return try {
            h.store.save(json)
            h.onSettingsSaved()
            true
        } catch (_: Exception) {
            false
        }
    }

    @JavascriptInterface
    fun upsertCharacter(json: String): Boolean {
        val h = host ?: return false
        val ok = h.library.upsert(json)
        if (ok) h.onSettingsSaved()
        return ok
    }

    @JavascriptInterface
    fun deleteCharacter(id: String): Boolean {
        val h = host ?: return false
        val ok = h.library.delete(id)
        if (ok) h.onSettingsSaved()
        return ok
    }

    @JavascriptInterface
    fun discardDraft(id: String) {
        host?.library?.discardDraft(id)
    }

    @JavascriptInterface
    fun pickFile(requestId: String, charId: String) {
        host?.launchPicker(requestId, charId)
    }

    @JavascriptInterface
    fun startOverlay(): String = host?.startOverlayFromUi() ?: "error"

    @JavascriptInterface
    fun stopOverlay() {
        host?.stopOverlayFromUi()
    }

    @JavascriptInterface
    fun setOverlayHidden(hidden: Boolean) {
        host?.setOverlayHiddenFromUi(hidden)
    }

    @JavascriptInterface
    fun requestOverlayPermission() {
        host?.requestOverlayPermission()
    }

    @JavascriptInterface
    fun requestNotificationPermission() {
        host?.requestNotificationPermission()
    }

    @JavascriptInterface
    fun openAccessibilitySettings() {
        host?.openAccessibilitySettings()
    }

    @JavascriptInterface
    fun requestShizuku() {
        host?.requestShizuku()
    }

    @JavascriptInterface
    fun openAppSettings() {
        host?.openAppSettings()
    }

    @JavascriptInterface
    fun playSound(kind: String) {
        host?.playSoundKind(kind)
    }
}
