# Bongo Cat Mobile (Android)

Personagens animados que flutuam sobre qualquer app e reagem a toques, cliques de mouse e teclado físico.
Aplicativo Android **nativo** (Kotlin) com a interface e as animações em **HTML + CSS + JavaScript** dentro de uma WebView.

> ## ⚠️ Estado da entrega — leia primeiro
> O código foi escrito e verificado, mas **o APK não foi compilado**: o ambiente onde o projeto foi
> desenvolvido não tem Android SDK e bloqueia o download dele (Google Maven / `dl.google.com`).
> Por isso **não existe um APK pronto neste pacote** e **o código Kotlin nunca rodou num aparelho**.
> Compilar leva poucos minutos (veja abaixo) e a primeira compilação é o teste real: se algum erro
> aparecer, ele será pequeno e localizado.
>
> O que **foi** verificado: interface/animações testadas num Chrome real (retrato, paisagem, claro/escuro,
> importação de PNG e spritesheet, favoritos, persistência); sintaxe de todo o JavaScript, XML e Kotlin
> (compilador Kotlin 2.0.21, zero erros de sintaxe — os únicos erros restantes eram "classe do Android
> não encontrada", esperados sem o SDK).

## Como obter o APK

### Opção A — Android Studio (mais simples)
1. Instale o **Android Studio** (Ladybug 2024.2 ou mais novo).
2. `File ▸ Open…` e escolha esta pasta. Aguarde o *Gradle Sync* (ele baixa o SDK 35 se faltar).
3. `Build ▸ Build Bundle(s) / APK(s) ▸ Build APK(s)`.
4. O arquivo fica em `app/build/outputs/apk/debug/app-debug.apk`.

### Opção B — linha de comando
```bash
# requer JDK 17+ e Android SDK (platform android-35 + build-tools)
export ANDROID_HOME=$HOME/Android/Sdk
./build_apk.sh                 # gera BongoCatMobile-debug.apk
adb install -r BongoCatMobile-debug.apk
```
No Windows: `gradlew.bat assembleDebug`.

### Opção C — sem instalar nada (GitHub Actions)
Suba esta pasta para um repositório no GitHub ▸ aba **Actions** ▸ **Build APK** ▸ *Run workflow*.
O APK sai em *Artifacts*. (Arquivo: `.github/workflows/build-apk.yml`.)

O APK de depuração é assinado automaticamente com a chave *debug* do Android e instala direto
(ative "instalar apps desconhecidos" para o app que abrir o arquivo).

**Versões:** AGP 8.7.3 · Gradle 8.10.2 (wrapper incluído) · Kotlin 2.0.21 · compileSdk/targetSdk 35 · **minSdk 29 (Android 10)**.

## Primeiro uso
1. Abra o app ▸ **Conceder permissão** ▸ ative *Exibir sobre outros apps* para o Bongo Cat Mobile.
2. Volte e toque em **Iniciar sobreposição**. (Em Android 13+ aceite também as notificações — opcional.)
3. Abra outro app: o personagem continua lá. **Arraste** para mover; **segure** para abrir os controles
   (− tamanho +, ocultar, abrir o app, fechar).
4. Notificação do serviço: botões **Ocultar/Mostrar** e **Fechar**.

## Funcionalidades (todas implementadas, nenhuma é decorativa)

| Pedido | Onde está |
|---|---|
| Sobreposição sobre qualquer app, arrastável | `OverlayService.kt` (`WindowManager`, `TYPE_APPLICATION_OVERLAY`) |
| Tamanho ajustável / opacidade | Início e Ajustes; botões − + na própria sobreposição |
| Ocultar/mostrar, fechar | Início, controles na sobreposição e notificação |
| Continua ao sair do app | `Foreground Service` (`specialUse`) com notificação |
| Áreas seguras e barra de navegação | `refreshBounds()`: `WindowInsets` (API 30+) / métricas (Android 10); reaplicado ao girar a tela |
| Permissão `SYSTEM_ALERT_WINDOW` | Manifest + `Settings.ACTION_MANAGE_OVERLAY_PERMISSION` (diálogo explicativo antes) |
| Galeria: Bongo original, gatos coloridos, outros animais | `js/characters.js` (5 gatos, cachorro, coelho, panda, raposa) |
| Importar PNG / GIF / WebP / spritesheet da galeria | Editor ▸ seletor de arquivos do Android (`OpenDocument`) ▸ `FileImporter.kt` |
| 6 animações independentes por personagem | Repouso, digitação, clique esq., clique dir., mouse, toque (Editor) |
| Patinhas animadas, suaves, GIF transparente, velocidade | `js/engine.js` |
| Menu de personalização | Ajustes: tamanho, posição (pad 2D + atalhos de canto), velocidade, animação fixa, sons, favoritos (★ na galeria) |
| Salvar localmente | `SettingsStore.kt` / `CharacterLibrary.kt` (SharedPreferences + armazenamento privado do app) |
| Retrato/paisagem, vários tamanhos | CSS responsivo + `configChanges` na Activity |

## Teclado e mouse — o que o Android permite (e o que não)
O Android **proíbe** um app de observar outros apps. O Bongo Cat Mobile respeita isso:

| Evento | Detecta? |
|---|---|
| Toque / clique **sobre o personagem** (inclui botão esquerdo/direito do mouse USB/Bluetooth, passar o mouse por cima, roda) | ✅ Sim |
| Toque / clique **fora**, em outro app | ⚠️ Parcial: o sistema avisa "houve um toque fora da janela", **sem posição e sem conteúdo** (`FLAG_WATCH_OUTSIDE_TOUCH`) |
| Teclado **físico** em outro app | ⚠️ Só se você ativar manualmente o serviço de acessibilidade opcional; ele recebe apenas "uma tecla foi apertada" |
| Teclado **virtual** (na tela) | ❌ Não. Exigiria ler o que é digitado — não fazemos isso |
| Movimento do mouse **fora** do personagem | ❌ Não. O Android só entrega o movimento ao app sob o cursor |
| Ler textos, campos, senhas, tela | ❌ Nunca |

Detalhes de privacidade (verificáveis no código):
- **Sem permissão `INTERNET`** no Manifest: o app não consegue enviar nada para fora do aparelho. A WebView também roda com `blockNetworkLoads`.
- `KeyPulseAccessibilityService`: sem `accessibilityEventTypes`, `canRetrieveWindowContent=false`, descarta o código da tecla na hora, não armazena nada e **não consome** a tecla.
- A página da sobreposição **não tem ponte JavaScript** para o Android: só recebe eventos.
- Importação valida o conteúdo real do arquivo (assinatura PNG/GIF/JPEG/WebP + dimensões), limite de 24 MB / 8192 px, e grava só na pasta privada do app. Acesso a `file://` desativado; arquivos importados são servidos por `WebViewAssetLoader`.
- `allowBackup=false`.

## Desempenho e bateria
- **Uma única WebView** na sobreposição (`ensureOverlay()` nunca cria a segunda) e uma na tela do app; ambas são destruídas ao sair (`destroy()`), sem vazamentos.
- Animação por `requestAnimationFrame` **só enquanto há movimento**; em repouso usa timer de ~12 fps (ou, em *Economia de bateria*, só acorda para piscar).
- Sobreposição **oculta ou com a tela apagada** ▸ JS pausado (`setPaused`) + `WebView.onPause()`. App em segundo plano ▸ interface pausada.
- Efeitos sonoros por `SoundPool` (baixa latência); sons de demonstração são sintetizados (`tools/gen_sounds.py`).
- Se o processo de renderização da WebView morrer, ela é recriada em vez de derrubar o app.
- Testado em headless: o motor faz 0 chamadas de `requestAnimationFrame` quando pausado.

## Importando seu próprio personagem
Galeria ▸ **Importar** ▸ para cada estado (Repouso, Digitação…) escolha um arquivo:
- **PNG / GIF transparente / WebP**: use direto. Cada estado pode ter um arquivo diferente.
- **Spritesheet**: mude o tipo para *Spritesheet*, informe **colunas × linhas**, número de quadros e quadros por segundo (quadros iguais, da esquerda para a direita, de cima para baixo).
- Efeito de movimento (respirar, pulinho, achatar, inclinar, tremer, seguir o mouse, saltar), escala e espelhar.
- Estados sem arquivo usam o de Repouso. Use apenas imagens que você tem direito de usar.

Os personagens embutidos são **arte original deste projeto** (desenhada em SVG); não usam arte do Bongo Cat original nem de terceiros. Projeto independente.

## Estrutura
```
app/src/main/
  AndroidManifest.xml
  java/com/bongocat/mobile/
    MainActivity.kt                 WebView da interface + permissões + seletor de arquivos
    WebBridge.kt                    ponte JS → Kotlin (só a interface do app)
    OverlayService.kt               Foreground Service + janela flutuante + gestos + eventos
    OverlayRootView.kt              recebe ACTION_OUTSIDE (toques fora da janela)
    KeyPulseAccessibilityService.kt OPCIONAL: pulso de teclado físico (sem conteúdo)
    SettingsStore.kt  CharacterLibrary.kt  FileImporter.kt  SoundManager.kt
    WebAssets.kt                    WebView segura + WebViewAssetLoader
    InputDevicesInfo.kt             mostra se há mouse/teclado conectados
  assets/www/
    index.html  css/app.css         interface (início, galeria, editor, ajustes)
    overlay.html                    página da sobreposição
    js/engine.js                    motor de animação (SVG + mídia importada)
    js/characters.js                personagens de demonstração
    js/app.js  js/bridge.js  js/overlay.js
  res/                              ícones, strings, temas claro/escuro, sons (raw/*.wav)
tools/gen_sounds.py                 regenera os sons de demonstração
```
Dica de desenvolvimento: abrir `app/src/main/assets/www/index.html` num navegador de desktop roda a interface com uma ponte simulada (localStorage) — dá para ajustar o visual sem compilar o APK. A sobreposição real só existe no Android.

## Problemas comuns
- **O personagem some em Xiaomi/Samsung/etc.**: o fabricante encerra serviços. Em *Configurações ▸ Apps ▸ Bongo Cat ▸ Bateria*, escolha "Sem restrições".
- **Não reage a teclas digitadas em outro app**: ative o serviço em *Ajustes ▸ Ativar nas configurações* (só funciona com teclado **físico**).
- **Sem som**: confira *Ajustes ▸ Sons* e o volume de mídia do aparelho.
- **Tela em branco no app**: atualize o *Android System WebView* na Play Store (a interface usa CSS moderno, Chromium ≥ 111).
- **Erro de SDK ao compilar**: crie `local.properties` com `sdk.dir=/caminho/do/Android/Sdk` (o Android Studio faz isso sozinho).
