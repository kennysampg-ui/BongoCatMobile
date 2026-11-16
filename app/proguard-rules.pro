# A ponte JavaScript <-> Kotlin precisa manter os métodos anotados.
-keepclassmembers class com.bongocat.mobile.WebBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface
