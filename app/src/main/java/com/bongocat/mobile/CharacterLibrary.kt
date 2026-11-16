package com.bongocat.mobile

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * Biblioteca de personagens PERSONALIZADOS (os embutidos vivem em assets/www/js/characters.js).
 *
 * - A definição (JSON) fica em SharedPreferences.
 * - Os arquivos importados (PNG/GIF/WebP/spritesheet) ficam em filesDir/characters/<id>/.
 * - A WebView lê esses arquivos por https://appassets.androidplatform.net/chars/<id>/<arquivo>
 *   (WebViewAssetLoader), sem nunca habilitar acesso file://.
 */
class CharacterLibrary(private val context: Context) {

    private val prefs = context.applicationContext
        .getSharedPreferences("bongo_library", Context.MODE_PRIVATE)

    val rootDir: File
        get() = File(context.filesDir, "characters").also { it.mkdirs() }

    @Synchronized
    fun all(): JSONArray = try {
        JSONArray(prefs.getString(KEY, "[]"))
    } catch (_: Exception) {
        JSONArray()
    }

    @Synchronized
    fun find(id: String): JSONObject? {
        val arr = all()
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            if (o.optString("id") == id) return o
        }
        return null
    }

    /** Valida e salva/atualiza um personagem. Retorna false se a definição for inválida. */
    @Synchronized
    fun upsert(json: String): Boolean {
        val def = try {
            JSONObject(json)
        } catch (_: Exception) {
            return false
        }
        val id = def.optString("id")
        if (!isValidCharId(id)) return false

        val anims = def.optJSONObject("anims") ?: JSONObject()
        val clean = JSONObject()
        val referenced = HashSet<String>()
        for (state in Defaults.ANIM_STATES) {
            val a = anims.optJSONObject(state) ?: continue
            val file = a.optString("file", "")
            if (file.isEmpty()) continue
            if (!isValidFileRef(file, id) || !File(rootDir, file).isFile) continue
            referenced.add(file.substringAfter('/'))
            clean.put(state, a)
        }
        if (clean.length() == 0) return false

        def.put("anims", clean)
        def.put("kind", "custom")
        val name = def.optString("name", "").trim().take(40)
        def.put("name", if (name.isEmpty()) "Personagem" else name)

        val arr = all()
        val out = JSONArray()
        var replaced = false
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            if (o.optString("id") == id) {
                out.put(def)
                replaced = true
            } else {
                out.put(o)
            }
        }
        if (!replaced) {
            if (arr.length() >= MAX_CUSTOM) return false
            out.put(def)
        }
        prefs.edit().putString(KEY, out.toString()).apply()

        // Remove arquivos que não são mais usados por nenhum estado.
        File(rootDir, id).listFiles()?.forEach { f ->
            if (f.name !in referenced) f.delete()
        }
        return true
    }

    @Synchronized
    fun delete(id: String): Boolean {
        if (!isValidCharId(id)) return false
        val arr = all()
        val out = JSONArray()
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            if (o.optString("id") != id) out.put(o)
        }
        prefs.edit().putString(KEY, out.toString()).apply()
        File(rootDir, id).deleteRecursively()
        return true
    }

    /** Editor cancelado: apaga arquivos de um personagem que nunca foi salvo. */
    @Synchronized
    fun discardDraft(id: String) {
        if (!isValidCharId(id) || find(id) != null) return
        File(rootDir, id).deleteRecursively()
    }

    /** Remove pastas órfãs (rascunhos antigos) para não acumular lixo no armazenamento. */
    @Synchronized
    fun cleanupStale() {
        val known = HashSet<String>()
        val arr = all()
        for (i in 0 until arr.length()) {
            arr.optJSONObject(i)?.optString("id")?.let { known.add(it) }
        }
        val now = System.currentTimeMillis()
        rootDir.listFiles()?.forEach { d ->
            if (d.isDirectory && d.name !in known && now - d.lastModified() > DAY_MS) {
                d.deleteRecursively()
            }
        }
    }

    companion object {
        private const val KEY = "library_json"
        private const val MAX_CUSTOM = 60
        private const val DAY_MS = 24L * 60 * 60 * 1000
        private val CHAR_ID = Regex("custom-[A-Za-z0-9_-]{1,60}")
        private val FILE_NAME = Regex("[A-Za-z0-9._-]{1,80}")

        fun isValidCharId(id: String): Boolean = CHAR_ID.matches(id)

        /** Referência no formato "<charId>/<arquivo>" sem ".." nem subpastas. */
        fun isValidFileRef(ref: String, charId: String): Boolean {
            if (!ref.startsWith("$charId/")) return false
            val name = ref.substringAfter('/')
            return FILE_NAME.matches(name) && !name.contains("..") && !name.startsWith(".")
        }
    }
}
