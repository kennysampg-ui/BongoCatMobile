package com.bongocat.mobile

import android.content.Context
import android.view.MotionEvent
import android.widget.LinearLayout

/**
 * Raiz da janela flutuante. Com FLAG_WATCH_OUTSIDE_TOUCH o Android entrega ACTION_OUTSIDE aqui
 * quando alguém toca/clica FORA da janela (em outro app). O sistema não informa onde nem em quê:
 * só que houve um toque. É o máximo que o Android permite sem ler a tela de outros apps.
 */
class OverlayRootView(context: Context) : LinearLayout(context) {

    var onOutside: ((MotionEvent) -> Unit)? = null

    override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
        if (ev.actionMasked == MotionEvent.ACTION_OUTSIDE) {
            onOutside?.invoke(ev)
            return true
        }
        return super.dispatchTouchEvent(ev)
    }
}
