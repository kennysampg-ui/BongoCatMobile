plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.bongocat.mobile"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.bongocat.mobile"
        minSdk = 29          // Android 10
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
    }

    buildTypes {
        debug {
            // APK de teste: assinado automaticamente com a chave de debug do Android SDK.
            isDebuggable = true
        }
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        buildConfig = true
    }

    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("dev.rikka.shizuku:api:13.1.5")      // modo avançado opcional (leitura global de entrada)
    implementation("dev.rikka.shizuku:provider:13.1.5")
    implementation("androidx.webkit:webkit:1.12.1") // WebViewAssetLoader (serve assets/ e arquivos importados sem file://)
}
