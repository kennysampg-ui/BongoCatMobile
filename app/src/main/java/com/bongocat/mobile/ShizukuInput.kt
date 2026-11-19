package com.bongocat.mobile

import android.content.Context
import android.content.pm.PackageManager
import rikka.shizuku.Shizuku

/**
 * MODO AVANÇADO (opcional, desligado por padrão).
 *
 * Com o app Shizuku ativo e a permissão concedida pelo usuário, executa `getevent -l` com a
 * identidade "shell" do sistema e lê os eventos brutos de entrada (mouse, teclado, toque) de
 * QUALQUER app, sem bloquear nem consumir nada: o jogo continua recebendo tudo normalmente.
 *
 * Privacidade (verificável aqui): só interpretamos
 *  - movimento relativo do mouse (REL_X / REL_Y) e botões esquerdo/direito;
 *  - "houve um toque" (BTN_TOUCH);
 *  - teclas apertadas, convertidas para um código numérico e comparadas com os atalhos configurados.
 * Nada é guardado, montado em texto ou enviado (o app nem tem permissão de Internet).
 */
class ShizukuInput(private val listener: Listener, private val rotation: () -> Int = { 0 }) {

    interface Listener {
        fun onMove(dx: Int, dy: Int)
        fun onButton(right: Boolean)
        fun onTouch()

        /** Ponto de toque na tela: [action] 0 = tocou, 1 = moveu, 2 = soltou; (nx, ny) = 0..1 já na orientação atual da tela. */
        fun onTouchPoint(slot: Int, action: Int, nx: Float, ny: Float)

        /** Código de tecla do Android (mesmo formato do mapeamento de teclas). */
        fun onLinuxKey(androidKeyCode: Int)
    }

    companion object {
        const val PACKAGE = "moe.shizuku.privileged.api"
        private const val REQUEST_CODE = 4107

        fun installed(context: Context): Boolean = try {
            context.packageManager.getPackageInfo(PACKAGE, 0)
            true
        } catch (_: Throwable) {
            false
        }

        fun running(): Boolean = try {
            Shizuku.pingBinder()
        } catch (_: Throwable) {
            false
        }

        fun granted(): Boolean = try {
            running() && !Shizuku.isPreV11() &&
                Shizuku.checkSelfPermission() == PackageManager.PERMISSION_GRANTED
        } catch (_: Throwable) {
            false
        }

        fun requestPermission() {
            try {
                if (running() && !Shizuku.isPreV11()) Shizuku.requestPermission(REQUEST_CODE)
            } catch (_: Throwable) {
            }
        }

        // Linux input key code -> Android KeyEvent code (só teclas úteis para jogos de ritmo).
        private val KEYMAP: Map<Int, Int> = HashMap<Int, Int>().apply {
            val letters = mapOf(
                'A' to 30, 'B' to 48, 'C' to 46, 'D' to 32, 'E' to 18, 'F' to 33, 'G' to 34, 'H' to 35,
                'I' to 23, 'J' to 36, 'K' to 37, 'L' to 38, 'M' to 50, 'N' to 49, 'O' to 24, 'P' to 25,
                'Q' to 16, 'R' to 19, 'S' to 31, 'T' to 20, 'U' to 22, 'V' to 47, 'W' to 17, 'X' to 45,
                'Y' to 21, 'Z' to 44
            )
            for ((ch, linux) in letters) put(linux, 29 + (ch - 'A'))
            for (n in 1..9) put(1 + n, 7 + n)   // KEY_1..KEY_9 -> KEYCODE_1..9
            put(11, 7)                          // KEY_0
            put(57, 62)                         // espaço
            put(28, 66)                         // enter
            put(105, 21); put(106, 22); put(103, 19); put(108, 20) // setas
            put(42, 59); put(54, 60)            // shift
            put(29, 113); put(56, 57)           // ctrl, alt
        }
    }

    @Volatile
    private var process: Process? = null

    @Volatile
    private var thread: Thread? = null

    @Volatile
    private var stopped = false

    val alive: Boolean get() = thread?.isAlive == true

    // Contadores do "Teste de entrada" (só números; nada do conteúdo é guardado).
    @Volatile var keys = 0
    @Volatile var moves = 0
    @Volatile var clicks = 0
    @Volatile var touches = 0
    @Volatile var linesRead = 0

    fun start() {
        if (alive) return
        stopped = false
        val t = Thread({ loop() }, "bongo-shizuku-input")
        t.isDaemon = true
        thread = t
        t.start()
    }

    fun stop() {
        stopped = true
        try {
            process?.destroy()
        } catch (_: Throwable) {
        }
        process = null
        thread?.interrupt()
        thread = null
    }

    private fun spawn(vararg cmd: String): Process? = try {
        // newProcess é privado nas versões recentes da API; a reflexão funciona em todas.
        val m = Shizuku::class.java.getDeclaredMethod(
            "newProcess", Array<String>::class.java, Array<String>::class.java, String::class.java
        )
        m.isAccessible = true
        m.invoke(null, arrayOf(*cmd), null, null) as Process
    } catch (_: Throwable) {
        null
    }

    private class Dev {
        var maxX = 0
        var maxY = 0
        var direct = false
        val x = FloatArray(10)
        val y = FloatArray(10)
        val down = BooleanArray(10)
        val up = BooleanArray(10)
        val dirty = BooleanArray(10)
        val active = BooleanArray(10)
        var slot = 0
    }

    private val devs = HashMap<String, Dev>()

    /** Lê os limites de coordenadas das telas de toque ("getevent -lp"). Só números, nenhum evento. */
    private fun probe() {
        val p = spawn("getevent", "-lp") ?: return
        try {
            var cur: Dev? = null
            p.inputStream.bufferedReader().use { r ->
                while (true) {
                    val line = r.readLine() ?: break
                    val t = line.trim()
                    if (t.startsWith("add device")) {
                        val path = t.substringAfter(": ", "").trim()
                        cur = Dev().also { devs[path] = it }
                    } else if (t.contains("INPUT_PROP_DIRECT")) {
                        cur?.direct = true
                    } else if (t.contains("ABS_MT_POSITION_X")) {
                        cur?.maxX = Regex("max\\s+(\\d+)").find(t)?.groupValues?.get(1)?.toIntOrNull() ?: 0
                    } else if (t.contains("ABS_MT_POSITION_Y")) {
                        cur?.maxY = Regex("max\\s+(\\d+)").find(t)?.groupValues?.get(1)?.toIntOrNull() ?: 0
                    }
                }
            }
        } catch (_: Throwable) {
        } finally {
            try {
                p.destroy()
            } catch (_: Throwable) {
            }
        }
    }

    private fun mapRotation(nx: Float, ny: Float): FloatArray = when (rotation()) {
        1 -> floatArrayOf(ny, 1f - nx)
        2 -> floatArrayOf(1f - nx, 1f - ny)
        3 -> floatArrayOf(1f - ny, nx)
        else -> floatArrayOf(nx, ny)
    }

    private fun flushTouch(d: Dev) {
        for (i in 0 until 10) {
            if (!d.dirty[i]) continue
            d.dirty[i] = false
            val m = mapRotation((d.x[i] / d.maxX).coerceIn(0f, 1f), (d.y[i] / d.maxY).coerceIn(0f, 1f))
            if (d.up[i]) {
                d.up[i] = false
                if (d.active[i]) listener.onTouchPoint(i, 2, m[0], m[1])
                d.active[i] = false
            } else if (!d.active[i]) {
                d.active[i] = true
                d.down[i] = false
                listener.onTouchPoint(i, 0, m[0], m[1])
            } else {
                listener.onTouchPoint(i, 1, m[0], m[1])
            }
        }
    }

    private fun loop() {
        if (!granted()) return
        probe()
        val p = spawn("getevent", "-l") ?: return
        process = p
        var relX = 0
        var relY = 0
        try {
            p.inputStream.bufferedReader().use { reader ->
                while (!stopped) {
                    val line = reader.readLine() ?: break
                    linesRead++
                    // "/dev/input/event5: EV_REL  REL_X  ffffffff"
                    val tok = line.trim().split(Regex("\\s+"))
                    if (tok.size < 4) continue
                    val type = tok[1]
                    val code = tok[2]
                    val value = tok[3]
                    val dev = devs[tok[0].trimEnd(':')]
                    val touch = dev != null && dev.direct && dev.maxX > 0 && dev.maxY > 0
                    when (type) {
                        "EV_ABS" -> if (touch && dev != null) {
                            val v = value.toLongOrNull(16)?.toInt() ?: continue
                            when (code) {
                                "ABS_MT_SLOT" -> dev.slot = v.coerceIn(0, 9)
                                "ABS_MT_TRACKING_ID" -> {
                                    dev.dirty[dev.slot] = true
                                    if (v == -1) dev.up[dev.slot] = true
                                }
                                "ABS_MT_POSITION_X" -> { dev.x[dev.slot] = v.toFloat(); dev.dirty[dev.slot] = true }
                                "ABS_MT_POSITION_Y" -> { dev.y[dev.slot] = v.toFloat(); dev.dirty[dev.slot] = true }
                            }
                        }
                        "EV_REL" -> {
                            val v = value.toLongOrNull(16)?.toInt() ?: continue
                            if (code == "REL_X") relX += v else if (code == "REL_Y") relY += v
                        }
                        "EV_SYN" -> {
                            if (touch && dev != null) flushTouch(dev)
                            if (relX != 0 || relY != 0) {
                                moves++
                                listener.onMove(relX, relY)
                                relX = 0
                                relY = 0
                            }
                        }
                        "EV_KEY" -> {
                            if (value != "DOWN") continue
                            when (code) {
                                "BTN_LEFT" -> { clicks++; listener.onButton(false) }
                                "BTN_RIGHT" -> { clicks++; listener.onButton(true) }
                                "BTN_TOUCH" -> { touches++; listener.onTouch() }
                                else -> if (code.startsWith("KEY_")) {
                                    val android = KEYMAP[linuxCode(code)]
                                    if (android != null) { keys++; listener.onLinuxKey(android) }
                                }
                            }
                        }
                    }
                }
            }
        } catch (_: Throwable) {
            // processo encerrado ou Shizuku parou: simplesmente termina.
        } finally {
            try {
                p.destroy()
            } catch (_: Throwable) {
            }
        }
    }

    /** Nome "KEY_D" -> código Linux 32. Só as teclas do mapa acima são reconhecidas. */
    private fun linuxCode(name: String): Int = NAMES[name] ?: -1

    private val NAMES: Map<String, Int> = HashMap<String, Int>().apply {
        val letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
        val codes = intArrayOf(
            30, 48, 46, 32, 18, 33, 34, 35, 23, 36, 37, 38, 50, 49, 24, 25, 16, 19, 31, 20, 22, 47, 17, 45, 21, 44
        )
        for (i in letters.indices) put("KEY_" + letters[i], codes[i])
        for (n in 1..9) put("KEY_$n", 1 + n)
        put("KEY_0", 11); put("KEY_SPACE", 57); put("KEY_ENTER", 28)
        put("KEY_LEFT", 105); put("KEY_RIGHT", 106); put("KEY_UP", 103); put("KEY_DOWN", 108)
        put("KEY_LEFTSHIFT", 42); put("KEY_RIGHTSHIFT", 54); put("KEY_LEFTCTRL", 29); put("KEY_LEFTALT", 56)
    }
}
