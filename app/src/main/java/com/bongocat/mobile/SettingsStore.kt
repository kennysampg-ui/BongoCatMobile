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
        put("transparentDesk", true)   // osu!: mesa sem o fundo branco
        put("zonesOn", false)          // áreas de toque (mouse / teclado)
        put("zonesLocked", true)       // false = modo de edição (arrastar / redimensionar)
        put("zonesVisualOnly", false)  // true = deixa os toques passarem (não detecta nada)
        put("zonesAlpha", 0.35)        // visibilidade das áreas
        put("zones", JSONObject())     // { modo: { mouse:[x,y,w,h], keys:[x,y,w,h] } } em frações da tela
        put("advancedInput", false)    // leitura global de entrada via Shizuku (opcional)
        put("zonesPadClick", false)    // áreas virtuais: um toque simples na área do mouse conta como clique
        put("zonesVirtual", true)      // com o Shizuku: áreas só desenhadas, toques lidos sem bloquear o jogo
        put("advSens", 1.0)
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
        o.put("transparentDesk", o.optBoolean("transparentDesk", true))
        o.put("zonesOn", o.optBoolean("zonesOn", false))
        o.put("zonesLocked", o.optBoolean("zonesLocked", true))
        o.put("zonesVisualOnly", o.optBoolean("zonesVisualOnly", false))
        o.put("zonesAlpha", num(o, "zonesAlpha", 0.35, 0.1, 0.9))
        o.put("advancedInput", o.optBoolean("advancedInput", false))
        o.put("zonesVirtual", o.optBoolean("zonesVirtual", true))
        o.put("zonesPadClick", o.optBoolean("zonesPadClick", false))
        o.put("advSens", num(o, "advSens", 1.0, 0.25, 4.0))
        o.put("zones", sanitizeZones(o.optJSONObject("zones")))

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

    /** Mantém só modos conhecidos e retângulos [x, y, w, h] válidos (frações de 0 a 1 da área útil). */
    private fun sanitizeZones(input: JSONObject?): JSONObject {
        val out = JSONObject()
        if (input == null) return out
        for (mode in DISPLAY_MODES) {
            val m = input.optJSONObject(mode) ?: continue
            val clean = JSONObject()
            for (kind in listOf("mouse", "keys")) {
                val a = m.optJSONArray(kind) ?: continue
                if (a.length() != 4) continue
                val v = DoubleArray(4) { i -> a.optDouble(i, Double.NaN) }
                if (v.any { it.isNaN() }) continue
                val w = v[2].coerceIn(0.08, 1.0)
                val h = v[3].coerceIn(0.08, 1.0)
                val x = v[0].coerceIn(0.0, 1.0 - w)
                val y = v[1].coerceIn(0.0, 1.0 - h)
                clean.put(kind, JSONArray().put(x).put(y).put(w).put(h))
            }
            if (clean.length() > 0) out.put(mode, clean)
        }
        return out
    }

    companion object {
        private val DISPLAY_MODES = setOf("classic", "osu", "mania4k", "mania7k", "taiko", "catch")
        private const val KEY = "settings_json"
        private val ID_REGEX = Regex("[A-Za-z0-9_-]{1,80}")
    }
}
