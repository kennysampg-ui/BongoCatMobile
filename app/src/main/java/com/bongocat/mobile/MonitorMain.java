package com.bongocat.mobile;

import android.os.Looper;
import android.view.InputChannel;
import android.view.InputEvent;
import android.view.InputEventReceiver;
import android.view.MotionEvent;

import java.lang.reflect.Method;

/**
 * Programa MÍNIMO executado com a identidade "shell" pelo Shizuku (app_process), só no modo avançado.
 * Registra um "monitor de gestos" do sistema (o mesmo recurso que a navegação por gestos usa), que
 * recebe TODOS os toques — inclusive os gerados por apps de mapeamento — sem bloquear nenhum.
 * Escreve na saída apenas linhas "T ação id x y" (posição do toque na tela). Não lê teclas nem conteúdo.
 */
public final class MonitorMain {

    private MonitorMain() {
    }

    private static void emit(MotionEvent e) {
        int a = e.getActionMasked();
        int idx = e.getActionIndex();
        switch (a) {
            case MotionEvent.ACTION_DOWN:
            case MotionEvent.ACTION_POINTER_DOWN:
                line(0, e, idx);
                break;
            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_POINTER_UP:
                line(2, e, idx);
                break;
            case MotionEvent.ACTION_CANCEL:
                for (int i = 0; i < e.getPointerCount(); i++) line(2, e, i);
                break;
            case MotionEvent.ACTION_MOVE:
                for (int i = 0; i < e.getPointerCount(); i++) line(1, e, i);
                break;
            default:
                break;
        }
    }

    private static void line(int action, MotionEvent e, int i) {
        System.out.println("T " + action + " " + e.getPointerId(i) + " " + (int) e.getX(i) + " " + (int) e.getY(i));
        System.out.flush();
    }

    private static final class Receiver extends InputEventReceiver {
        Receiver(InputChannel channel, Looper looper) {
            super(channel, looper);
        }

        private void handle(InputEvent event) {
            try {
                if (event instanceof MotionEvent) emit((MotionEvent) event);
            } finally {
                finishInputEvent(event, true);
            }
        }

        @Override
        public void onInputEvent(InputEvent event) {
            handle(event);
        }

        @Override
        public void onInputEvent(InputEvent event, int displayId) {
            handle(event);
        }
    }

    private static Object inputManager() throws Exception {
        try {
            Class<?> g = Class.forName("android.hardware.input.InputManagerGlobal");
            return g.getMethod("getInstance").invoke(null);
        } catch (Throwable ignored) {
            Class<?> m = Class.forName("android.hardware.input.InputManager");
            return m.getMethod("getInstance").invoke(null);
        }
    }

    public static void main(String[] args) {
        try {
            Looper.prepare();
            Object im = inputManager();
            Method m = im.getClass().getMethod("monitorGestureInput", String.class, int.class);
            Object monitor = m.invoke(im, "bongo-monitor", 0);
            InputChannel channel = (InputChannel) monitor.getClass().getMethod("getInputChannel").invoke(monitor);
            new Receiver(channel, Looper.myLooper());
            System.out.println("OK");
            System.out.flush();
            Looper.loop();
        } catch (Throwable t) {
            Throwable c = t.getCause() != null ? t.getCause() : t;
            System.out.println("ERR " + c);
            System.out.flush();
        }
    }
}
