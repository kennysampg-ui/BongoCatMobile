package com.bongocat.mobile

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Intent
import android.view.KeyEvent
import android.view.accessibility.AccessibilityEvent

/**
 * OPCIONAL e desativado por padrão. É a única forma suportada pelo Android de saber que uma tecla
 * de TECLADO FÍSICO foi pressionada enquanto outro app está em primeiro plano.
 *
 * Garantias de privacidade (verificáveis neste arquivo):
 *  - não observa eventos de tela (sem accessibilityEventTypes; canRetrieveWindowContent=false);
 *  - em onKeyEvent só olha se foi um "tecla pressionada": o keyCode e o texto são descartados na hora;
 *  - nada é armazenado, registrado ou transmitido (o app nem tem permissão de Internet);
 *  - não consome a tecla (retorna false), então o app em primeiro plano continua recebendo normalmente.
 *
 * O teclado virtual (na tela) NÃO é detectado de propósito: exigiria observar o conteúdo digitado.
 */
class KeyPulseAccessibilityService : AccessibilityService() {

    override fun onServiceConnected() {
        super.onServiceConnected()
        val info = serviceInfo
        if (info != null) {
            info.flags = info.flags or AccessibilityServiceInfo.FLAG_REQUEST_FILTER_KEY_EVENTS
            serviceInfo = info
        }
        connected = true
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // Intencionalmente vazio: este serviço não lê nada da tela.
    }

    override fun onInterrupt() = Unit

    override fun onKeyEvent(event: KeyEvent): Boolean {
        if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0 && !event.isSystem) {
            OverlayService.instance?.onKeyPulse()
        }
        return false // nunca consome a tecla
    }

    override fun onUnbind(intent: Intent?): Boolean {
        connected = false
        return super.onUnbind(intent)
    }

    companion object {
        @Volatile
        var connected = false
            private set
    }
}
