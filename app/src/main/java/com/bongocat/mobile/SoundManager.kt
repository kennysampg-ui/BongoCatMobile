package com.bongocat.mobile

import android.content.Context
import android.media.AudioAttributes
import android.media.SoundPool

/** Efeitos sonoros curtos (SoundPool = baixa latência e baixo consumo). */
class SoundManager(context: Context) {

    private val pool: SoundPool = SoundPool.Builder()
        .setMaxStreams(4)
        .setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_GAME)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
        )
        .build()

    private val ids = IntArray(3)
    private val ready = BooleanArray(3)

    init {
        pool.setOnLoadCompleteListener { _, sampleId, status ->
            if (status == 0) {
                for (i in ids.indices) if (ids[i] == sampleId) ready[i] = true
            }
        }
        val app = context.applicationContext
        ids[LOW] = pool.load(app, R.raw.tap_low, 1)
        ids[HIGH] = pool.load(app, R.raw.tap_high, 1)
        ids[TICK] = pool.load(app, R.raw.tick, 1)
    }

    fun play(kind: Int, volume: Float) {
        if (kind !in 0..2 || !ready[kind]) return
        val v = volume.coerceIn(0f, 1f)
        pool.play(ids[kind], v, v, 1, 0, 1f)
    }

    fun release() {
        pool.release()
    }

    companion object {
        const val LOW = 0
        const val HIGH = 1
        const val TICK = 2

        fun kindFromName(name: String): Int = when (name) {
            "low" -> LOW
            "high" -> HIGH
            "tick" -> TICK
            else -> -1
        }
    }
}
