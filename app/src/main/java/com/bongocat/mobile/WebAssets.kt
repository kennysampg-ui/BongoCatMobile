package com.bongocat.mobile

import android.annotation.SuppressLint
import android.content.Context
import android.view.View
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader
import java.io.File

/** Configuração compartilhada e segura das WebViews (interface do app e sobreposição). */
object WebAssets {
    const val HOST = "appassets.androidplatform.net"
    const val BASE = "https://appassets.androidplatform.net"

    /**
     * Mapeia URLs virtuais para recursos locais:
     *   /assets/...  -> app/src/main/assets/...
     *   /chars/...   -> filesDir/characters/...  (arquivos importados pelo usuário)
     */
    fun createLoader(context: Context, charsDir: File): WebViewAssetLoader {
        charsDir.mkdirs()
        return WebViewAssetLoader.Builder()
            .setDomain(HOST)
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(context))
            .addPathHandler("/chars/", WebViewAssetLoader.InternalStoragePathHandler(context, charsDir))
            .build()
    }

    @SuppressLint("SetJavaScriptEnabled")
    fun configure(web: WebView) {
        val s = web.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = false
        s.allowFileAccess = false
        s.allowContentAccess = false
        s.blockNetworkLoads = true          // nenhuma requisição de rede, jamais
        s.setSupportZoom(false)
        s.builtInZoomControls = false
        s.setGeolocationEnabled(false)
        s.mediaPlaybackRequiresUserGesture = true
        s.cacheMode = WebSettings.LOAD_DEFAULT
        web.isVerticalScrollBarEnabled = false
        web.isHorizontalScrollBarEnabled = false
        web.overScrollMode = View.OVER_SCROLL_NEVER
    }

    class AssetClient(
        private val loader: WebViewAssetLoader,
        private val onLoaded: () -> Unit = {},
        private val onGone: () -> Unit = {}
    ) : WebViewClient() {

        override fun shouldInterceptRequest(
            view: WebView,
            request: WebResourceRequest
        ): WebResourceResponse? = loader.shouldInterceptRequest(request.url)

        // Só navega dentro do nosso domínio virtual.
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
            request.url.host != HOST

        override fun onPageFinished(view: WebView, url: String?) {
            onLoaded()
        }

        // Se o processo de renderização morrer (pouca memória), evita derrubar o app.
        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
            onGone()
            return true
        }
    }
}
