package com.bongocat.mobile

import android.view.InputDevice
import org.json.JSONObject

/** Informa (sem ler nenhuma tecla) se há mouse e teclado físico conectados, só para mostrar na interface. */
object InputDevicesInfo {
    fun snapshot(): JSONObject {
        var mouse = false
        var keyboard = false
        for (id in InputDevice.getDeviceIds()) {
            val d = InputDevice.getDevice(id) ?: continue
            if (d.isVirtual) continue
            if (d.supportsSource(InputDevice.SOURCE_MOUSE)) mouse = true
            if (d.supportsSource(InputDevice.SOURCE_KEYBOARD) &&
                d.keyboardType == InputDevice.KEYBOARD_TYPE_ALPHABETIC
            ) keyboard = true
        }
        return JSONObject().put("mouse", mouse).put("keyboard", keyboard)
    }
}
