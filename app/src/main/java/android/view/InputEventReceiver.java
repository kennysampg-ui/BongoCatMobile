package android.view;

import android.os.Looper;

/**
 * Apenas para COMPILAR: o Android não expõe esta classe no SDK público. Em tempo de execução vale
 * sempre a classe verdadeira do sistema (as classes do sistema são carregadas antes das do app).
 * Usada só pelo "monitor de entrada" opcional (MonitorMain), que roda via Shizuku.
 */
public abstract class InputEventReceiver {
    public InputEventReceiver(InputChannel inputChannel, Looper looper) {
    }

    public void onInputEvent(InputEvent event) {
    }

    public void onInputEvent(InputEvent event, int displayId) {
    }

    public final void finishInputEvent(InputEvent event, boolean handled) {
    }

    public void dispose() {
    }
}
