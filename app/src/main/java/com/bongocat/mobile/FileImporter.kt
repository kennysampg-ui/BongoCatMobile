package com.bongocat.mobile

import android.content.Context
import android.graphics.BitmapFactory
import android.net.Uri
import android.provider.OpenableColumns
import org.json.JSONObject
import java.io.File

/**
 * Copia uma imagem escolhida na galeria/seletor de arquivos para o armazenamento privado do app.
 * Valida o conteúdo real (assinatura do arquivo + decodificação das dimensões), não só a extensão.
 */
object FileImporter {
    private const val MAX_BYTES = 24L * 1024 * 1024
    private const val MAX_DIM = 8192

    fun importImage(ctx: Context, uri: Uri, charId: String, charsRoot: File): JSONObject {
        val res = JSONObject()
        var tmp: File? = null
        try {
            require(CharacterLibrary.isValidCharId(charId)) { "bad_id" }
            val dir = File(charsRoot, charId)
            dir.mkdirs()
            val tmpFile = File(dir, "import.tmp")
            tmp = tmpFile

            var total = 0L
            val input = ctx.contentResolver.openInputStream(uri) ?: throw IllegalStateException("open_failed")
            input.use { src ->
                tmpFile.outputStream().use { out ->
                    val buf = ByteArray(16 * 1024)
                    while (true) {
                        val n = src.read(buf)
                        if (n < 0) break
                        total += n
                        if (total > MAX_BYTES) throw IllegalStateException("too_large")
                        out.write(buf, 0, n)
                    }
                }
            }

            val ext = sniff(tmpFile) ?: throw IllegalStateException("not_image")
            val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeFile(tmpFile.path, opts)
            if (opts.outWidth <= 0 || opts.outHeight <= 0) throw IllegalStateException("not_image")
            if (opts.outWidth > MAX_DIM || opts.outHeight > MAX_DIM) throw IllegalStateException("too_big_dims")

            val name = "m" + System.currentTimeMillis().toString(36) + "." + ext
            val dest = File(dir, name)
            if (!tmpFile.renameTo(dest)) throw IllegalStateException("save_failed")
            tmp = null

            res.put("ok", true)
            res.put("file", "$charId/$name")
            res.put("mime", mimeFor(ext))
            res.put("width", opts.outWidth)
            res.put("height", opts.outHeight)
            res.put("bytes", total)
            res.put("label", displayName(ctx, uri))
        } catch (e: Exception) {
            tmp?.delete()
            res.put("ok", false)
            res.put("error", e.message ?: "error")
        }
        return res
    }

    private fun sniff(f: File): String? {
        val h = ByteArray(12)
        val n = f.inputStream().use { it.read(h) }
        if (n < 4) return null
        fun b(i: Int): Int = h[i].toInt() and 0xFF
        return when {
            b(0) == 0x89 && b(1) == 0x50 && b(2) == 0x4E && b(3) == 0x47 -> "png"
            b(0) == 0x47 && b(1) == 0x49 && b(2) == 0x46 && b(3) == 0x38 -> "gif"
            b(0) == 0xFF && b(1) == 0xD8 && b(2) == 0xFF -> "jpg"
            n >= 12 && b(0) == 0x52 && b(1) == 0x49 && b(2) == 0x46 && b(3) == 0x46 &&
                b(8) == 0x57 && b(9) == 0x45 && b(10) == 0x42 && b(11) == 0x50 -> "webp"
            else -> null
        }
    }

    private fun mimeFor(ext: String): String = when (ext) {
        "png" -> "image/png"
        "gif" -> "image/gif"
        "jpg" -> "image/jpeg"
        else -> "image/webp"
    }

    private fun displayName(ctx: Context, uri: Uri): String {
        var name: String? = null
        try {
            ctx.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
                if (c.moveToFirst()) name = c.getString(0)
            }
        } catch (_: Exception) {
        }
        return (name ?: "imagem").take(60)
    }
}
