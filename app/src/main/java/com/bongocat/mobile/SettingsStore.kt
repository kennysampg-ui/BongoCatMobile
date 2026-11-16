package com.bongocat.mobile

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/** Valores padrão e constantes compartilhadas entre o app e o serviço. */
object Defaults {
    const val CHARACTER = "cat-original"

    /** Estados de animação que cada personagem pode ter. */
    val ANIM_STATES = listOf("idle", "typing", "clickLeft", "clickRight", "mouseMove", "touch")

    fun settings(): JSONObject = JSONObject().apply {
        put("characterId", CHARACTER)
        put("size", 1.0)            // escala da sobreposição (0.4 – 2.5)
        put("opacity", 1.0)         // 0.3 – 1.0
        put("speed", 1.0)           // velocidade das animações (0.25 – 3.0)
        put("posX", 0.85)           // posição normalizada dentro da área segura (0 – 1)
        put("posY", 0.65)
        put("sound", true)
        put("volume", 0.7)
        put("forcedAnim", "auto")   // "auto" ou um dos ANIM_STATES (repete a animação)
        put("batterySaver", false)
        put("reactOutside", true)   // reagir a toques/cliques fora do personagem
        put("favorites", JSONArray())
        put("displayMode", "classic") // classic | osu | mania4k | mania7k | taiko | catch
        put("keyBindings", JSONObject().apply {
            put("key0", 32); put("key1", 34); put("key2", 38); put("key3", 39)
            put("key4", 47); put("key5", 62); put("key6", 40)
            put("left", 54); put("right", 52)
            put("rimLeft", 32); put("centreLeft", 34)
            put("centreRight", 38); put("rimRight", 39); put("dash", 62)
        })
    }
}

fun JSONObject.float(key: String, def: Float): Float {
    val v = optDouble(key, def.toDouble())
    return if (v.isNaN()) def else v.toFloat()
}

/**
 * Configurações salvas localmente (SharedPreferences, privado ao app).
 * Guarda um único JSON; chaves desconhecidas são preservadas.
 */
class SettingsStore(context: Context) {
    private val prefs = context.applicationContext
        .getSharedPreferences("bongo_settings", Context.MODE_PRIVATE)

    @Synchronized
    fun read(): JSONObject {
        val result = Defaults.settings()
        val raw = prefs.getString(KEY, null)
        if (raw != null) {
            try {
                val saved = JSONObject(raw)
                val keys = saved.keys()
                while (keys.hasNext()) {
                    val k = keys.next()
                    result.put(k, saved.get(k))
                }
            } catch (_: Exception) {
                // JSON corrompido: volta ao padrão.
            }
        }
        return sanitize(result)
    }

    /** Mescla um JSON parcial enviado pela interface e salva. */
    @Synchronized
    fun save(incoming: String): JSONObject {
        val current = read()
        val patch = JSONObject(incoming)
        val keys = patch.keys()
        while (keys.hasNext()) {
            val k = keys.next()
            current.put(k, patch.get(k))
        }
        sanitize(current)
        prefs.edit().putString(KEY, current.toString()).apply()
        return current
    }

    @Synchronized
    fun update(block: (JSONObject) -> Unit): JSONObject {
        val current = read()
        block(current)
        sanitize(current)
        prefs.edit().putString(KEY, current.toString()).apply()
        return current
    }

    private fun num(o: JSONObject, key: String, def: Double, lo: Double, hi: Double): Double {
        val v = o.optDouble(key, def)
        return (if (v.isNaN()) def else v).coerceIn(lo, hi)
    }

    private fun sanitize(o: JSONObject): JSONObject {
        o.put("size", num(o, "size", 1.0, 0.4, 2.5))
        o.put("opacity", num(o, "opacity", 1.0, 0.3, 1.0))
        o.put("speed", num(o, "speed", 1.0, 0.25, 3.0))
        o.put("posX", num(o, "posX", 0.85, 0.0, 1.0))
        o.put("posY", num(o, "posY", 0.65, 0.0, 1.0))
        o.put("volume", num(o, "volume", 0.7, 0.0, 1.0))
        o.put("sound", o.optBoolean("sound", true))
        o.put("batterySaver", o.optBoolean("batterySaver", false))
        o.put("reactOutside", o.optBoolean("reactOutside", true))

        val id = o.optString("characterId", Defaults.CHARACTER)
        if (!ID_REGEX.matches(id)) o.put("characterId", Defaults.CHARACTER)

        val forced = o.optString("forcedAnim", "auto")
        if (forced != "auto" && forced !in Defaults.ANIM_STATES) o.put("forcedAnim", "auto")

        val fav = o.optJSONArray("favorites") ?: JSONArray()
        val cleanFav = JSONArray()
        for (i in 0 until minOf(fav.length(), 200)) {
            val s = fav.optString(i, "")
            if (ID_REGEX.matches(s)) cleanFav.put(s)
        }
        o.put("favorites", cleanFav)
        if (o.optString("displayMode", "classic") !in DISPLAY_MODES) o.put("displayMode", "classic")
        val inputBindings = o.optJSONObject("keyBindings") ?: JSONObject()
        val cleanBindings = JSONObject()
        val bindingKeys = inputBindings.keys()
        while (bindingKeys.hasNext()) {
            val action = bindingKeys.next()
            val code = inputBindings.optInt(action, -1)
            if (action.matches(Regex("(key[0-6]|left|right|dash|rimLeft|centreLeft|centreRight|rimRight)")) &&
                code in 0..300
            ) cleanBindings.put(action, code)
        }
        o.put("keyBindings", cleanBindings)
        return o
    }

    companion object {
        private val DISPLAY_MODES = setOf("classic", "osu", "mania4k", "mania7k", "taiko", "catch")
        private const val KEY = "settings_json"
        private val ID_REGEX = Regex("[A-Za-z0-9_-]{1,80}")
    }
}
