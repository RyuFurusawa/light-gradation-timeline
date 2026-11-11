# CLAUDE.md — 光のグラデーション・タイムライン 開発引き継ぎ

このファイルは Claude Code 向けの開発指示書です。claude.ai のチャットで行ってきた開発を、ここから Claude Code で継続します。作業前に必ず全文を読んでください。

## プロジェクト概要

ディスプレイを光源装置として用い、その発光色を時間的に変化させるブラウザツール。ディスプレイの光だけを光源とする暗い環境で、黒い紙に乾燥顔料（色鉛筆・コンテ・クレヨン・オイルパステル）で描いた絵を照らし、光の変化によって絵の色の見え方を動かす——美術大学の色彩演習・作品制作のための装置。

- 作者：古澤龍（Ryu Furusawa）。美術大学で色彩演習を担当
- 公開URL：https://ryufurusawa.github.io/light-gradation-timeline/
- リポジトリ：https://github.com/RyuFurusawa/light-gradation-timeline（`main` へのpushで GitHub Pages に自動反映、1〜3分）
- ライセンス：MIT
- 利用者：美大生。PC・iPad・スマホ、HDR／非HDRディスプレイが混在する

### 課題の背景（設計判断の拠り所）

照明の色が変われば物体色は物理的に変わる（照明の分光分布 × 物体の分光反射率）。にもかかわらず、人の知覚は色の恒常性によってその変化を打ち消そうとする。この綱引きの隙間に、静止した絵の"動き"が現れる。鑑賞時は机や周囲を黒布で覆い、照明が変化していること自体に気づきにくくする。UIや機能を変えるときは、この「光源装置として邪魔をしない」ことを優先する。

## ファイル構成

```
index.html          本体（HDR版）。GitHub Pages のトップとして配信
manifest.webmanifest PWA マニフェスト（display: fullscreen）
sw.js               サービスワーカー（オフライン起動用）
icons/              PWA アイコン（192／512／maskable 512／apple-touch-icon 180）
README.md           公開向け説明（日本語）
LICENSE             MIT
docs/lesson-plan.md 授業課題（WorkFlowy互換：全行リスト、2スペースインデント、#見出しなし、裸URL）
CLAUDE.md           このファイル
```

チャット時代は SDR版（`light-gradation-timeline.html`）と HDR版（`light-gradation-timeline-hdr.html`）を並行保守していたが、**今後は `index.html`（HDR版）一本に統一する**。HDR版は HDR → Display P3 → sRGB の三段フォールバックを持つので、SDR版は不要。

## 技術構成

- 単一HTML、ビルドなし。依存は CDN の p5.js 1.9.4 のみ（`https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.4/p5.min.js`）
- **ハイブリッド描画**：全画面の色（背景＋中央の基準グレー矩形）は生の WebGPU、UI・リング・色点・xy色度図は p5.js の 2D canvas（z-index で WebGPU canvas の上に重ねる）
- **HDR**：WebGPU `rgba16float` + `toneMapping: { mode: "extended" }` + `colorSpace: 'srgb'`、拡張sRGBエンコード（`encExt`）。背景もグレーも「線形値 × hdrGain」の同一スケール（最大チャンネル正規化はしない）
- **HDR判定**：`(dynamic-range: high)` メディアクエリでゲートする（WebGPU の configure は SDR ディスプレイでも成功してしまうため）。`change` イベントを監視し `refreshRenderer()` で動的に追従。非HDR時は HDR輝度スライダー（`gainWrap`）を隠す
- **駆動**：`noLoop()` + `setInterval(33ms)` で `redraw()`。位相は壁時計基準（`t0` / `getPhase()`）

## 機能（実装済み）

- 円形タイムラインに色点を配置（初期：赤緑青の3点）。色点ドラッグ＝タイミング、円外へドラッグ＝削除（最低2点）、2回タップ＝カラーピッカー、リング帯タップ＝追加、白い針ドラッグ＝再生位置、Space＝一時停止
- **回転方向の逆転**：時間バーの ↻ ボタン（`revBtn`、タイムラインごと）。`reversed` のとき `getPhase()` が逆向きに進む。位相を直接いじる箇所（針のドラッグ、秒数変更、複製）は必ず `setPhase(ph)` を通す（`t0` を直接計算すると逆転時に位置が飛ぶ）
- **補間8方式**（`MODE_LIST`）：`step` ステップ切替／`hsb` HSB色相回転／`rgbLight` RGB中間混色（光量平均）／`rgbValue` RGB中間混色（画素値平均）／`oklch` OKLab 色相回転／`oklabLin` OKLab 中間混色／`cielch` CIELab 色相回転／`cielabLin` CIELab 中間混色。**デフォルトは `oklabLin`**
- 色相回転系は**無力色相（powerless hue）**を処理：彩度がε未満なら相手側の色相を引き継ぐ（CSS Color 4 準拠）。ε は HSB 1e-4／OKLab 0.002／CIELab 0.5。これを外すと青→白が紫やシアンへ迷走する
- **輝度検証**：中央に基準グレー。明度は「選択中の方式の物差し」の平均（`grayForMode`：HSB→B平均、光量→相対輝度Y平均、画素値→符号値平均、OKLab系・step→L平均、CIELab系→L*平均）。HDR時はグレーも WebGPU 側で描く
- **xy色度図**：CIE1931馬蹄形（オフスクリーンキャッシュ）＋sRGB三角形＋D65＋色点＋現在色＋ループ軌跡。xy図のみ表示のとき、図上の点をドラッグして色を編集できる（`xyYfit`：輝度Yを保持し、色域外ならD65方向へ二分探索で寄せる）
- **知覚明度(OKLab)で統一**：セグメント「最低｜平均」。「戻る」で統一前の色に復元（スナップショットがあるときだけ表示）。**意図的に OKLab 固定**——基準グレーの物差しと一致しない場合があること自体が教材
- **彩度最大**：L と H を保ち、C を色域上限まで引き上げる（`maxChromaAt`）。無彩色（C<0.004）はスキップ
- **フルスクリーン**：UIを消して色のみを表示。クリック／Escで復帰
- **情報パネル**：右上の丸iボタン。操作説明と色変換の注意事項

- **スリープ防止**：Screen Wake Lock。読み込み時に要求し、拒否されたら最初の操作（pointerdown／keydown）で取り直す。タブ復帰（`visibilitychange`）でも取り直す。状態は `wakeState`（pending／on／unsupported／failed）で、情報パネルの `#wakeStatus` に出る。非対応、または操作起点の要求が拒否されたときだけ、暗転オーバーレイ `#wakeNotice` を一度出す
- **PWA**：`manifest.webmanifest` ＋ `sw.js`。自サイトのファイルはネットワーク優先（更新を即反映）、届かないときだけキャッシュ。p5.js（CDN）はキャッシュ優先。`sw.js` のキャッシュ対象を変えたら `CACHE` の版名を上げる

- **画面分割**：`index.html` は2つの役割で動く。通常の起動は**親（`IS_HOST`）**で、タイムラインは持たず、`#panes` に iframe（`index.html?pane=1`＝**子、`IS_PANE`**）を横に均等に並べる。起動時に子を1つ作る。画面の左右の縁の＋（`#splitLeft`／`#splitRight`）で、その側の端の子を複製して追加。子の左上の×（2つ以上のとき表示）で閉じる
  - 親子のやり取りは `postMessage` のみ（file:// では iframe の中身に触れないため）。子→親：`ready`／`state`／`play`／`gesture`、親→子：`getState`／`setPlay`／`wake`／`shared`／`setMode`／`blend`／`nb`、子→親に `color` も
  - 複製は、子の `getState()` を URL の `#s=` に載せて新しい iframe を開く。`phase` と採取時刻 `at` から読み込み時間ぶん進めるので、位相も揃う
  - フルスクリーンは親が画面全体で行い、`setPlay` で全ペインの UI を同時に出し入れする（子の `enterPlay`／`exitPlay` は親への依頼、実処理は `applyPlay`）
  - **共通バー**（`#hostBar`、2つ以上に分割中だけ画面上端に出る）：補間方式・フルスクリーン・境界グラデーション（＋幅スライダー）・ヘルプ i を全タイムライン共通で1つずつ。分割中、子は `body.shared` で自分の方式スイッチ・フルスクリーン・i を隠す。方式は全ペイン共通（分割開始時に複製元の方式を採用、`setMode` で配る）。`buildModeUI()`／`buildInfoUI()` は親子で同じ関数を使う
  - **簡略表示**（`body.compact`＝分割中かつ枠の幅 ≤ 820px、`isCompact()`）：リング＋秒数＋一時停止だけ。サークル下の「⋯」（`#moreBtn`、`body.moreOpen`）で観察トグルと色設定を下端から積んで出す。リングは `R = min(幅×0.38, 高さ×0.30)` に拡大。1つに戻すと元のレイアウトに戻る
  - **境界グラデーション**：隣り合う枠の現在色どうしを、**選択中の補間方式（全枠共通）で空間的につなぐ**。子は毎フレーム、現在色（sRGB符号値）とゲインを `color` で親へ送り、親が両隣へ `nb` で中継。枠の中央＝自分の色（f=0）、境界＝中間（f=0.5）。`edgeLut()` が境界→帯の終わりの色を `EDGE_N`(32) 区間の表（線形×ゲイン）にし、HDR は WGSL の uniform 配列、CSS レンダラは `linear-gradient` の停止点として渡す（表のあいだは光量で線形補間）。補間は必ず「左の枠→右の枠」の向きで評価する（色相回転は補色どうしだと引数の順で回る向きが変わり、境界で食い違うため）。ステップ切替はグラデーションなし。幅 `blendWidth`（1＝枠の中央まで）。隣の色は1フレーム遅れ
  - **幅の調整**：枠ごとに重み `weight`（既定1）を持ち、境界のつまみ（`.paneDivider`、`makeDivider(k)`）のドラッグで隣り合う2枠の配分だけを変える（最小220px＝時間バーが収まる幅）。ダブルクリックで全枠均等。枠を追加すると全体を均等に割り直す。削除時は残りの比率を保つ
  - 枠の幅は親が整数pxで割り付ける（`hostLayoutPanes()`。端数幅だと継ぎ目に線が出る）。子は resize イベントが遅れることがあるので `draw()` で実寸と照合している。寸法は p5 の `windowWidth` ではなく `window.innerWidth` を使う
  - Wake Lock とサービスワーカーの登録は親だけ。子は操作を `gesture` で伝え、状態表示だけ受け取る
  - 親でも p5 の `setup`／`draw`／マウス・キーのハンドラは呼ばれるので、各関数の先頭で `IS_HOST` を弾いている。ハンドラを足すときも同様に

## UIレイアウト（現行仕様）

- 方式選択は**サークル上の方式名スイッチ**（`#modeSwitch`）。押すと暗転モーダル（`#modeModal`）に8方式が縦一列で出る。ハンバーガーメニューは**廃止済み**
- 配置は `placeBars()` が一元管理する（CSSの固定pxではなく、サークルの中心 `cx, cy` と半径 `R` から計算）
  - 広い画面：時間バー＝上の空きの中央／方式スイッチ＝時間バー下端とサークル上端の中間／観察トグル（xy色度図・輝度検証）＝サークル内 `cy + R*0.84`／下の空きを三等分してフルスクリーン→色設定
  - 狭い画面（幅 ≤ 820px、`body.narrowLayout`）：時間バー top 70px／観察トグル `cy + R*0.74`（小さいフォント）／色設定は下端中央／フルスクリーンはサークル下端と色設定の中間
- `placeBars()` は全バーの生成後に呼ぶこと（`buildUI` 末尾の `applyResponsive(); placeBars();`）。生成前に呼ぶと何も配置されず、全バーが画面外に飛ぶ

## 過去に踏んだ罠（再発注意）

1. **範囲削除の巻き添え**：ハンバーガー撤去時、直後の `fsBtn` 生成コードまで消した。ブロックを削除するときは前後を必ず読む
2. **編集の空振り**：同じ処理でも1行／複数行の書式違いがあり、置換が当たらないことがあった。編集前に現物を読み、編集後に結果を確認する
3. **p5 の `show()` はインライン `display` を付ける**：CSS と競合してレイアウトが崩れる。`b.elt.style.display = ''` でクラス制御に戻す
4. **フルスクリーン解除は非同期**：解除直後は幅がずれる。`setTimeout` 60ms と 250ms でレイアウトを再計算している
5. **p5 組み込み名との衝突**：自作関数に `norm` などを使わない（`wrapAng` に改名済み）
6. **p5 のマウスイベントは全域で発火**：UIクリックがキャンバス操作に漏れないよう `isCanvasEvent(e.target)` でガードする
7. **HDR に 8bit unorm は使えない**：1.0 で頭打ちになる。`rgba16float` 必須
8. **WebGPU canvas の重なり順**：z-index 未指定だと WebGPU canvas が p5 canvas を覆う（gpu z:0、p5 z:1）

## 検証の進め方（必須）

**UIに触れる変更は、推測で完了報告しない。ヘッドレスブラウザで実際に描画して確かめる。** チャット時代は「できたはず」の報告で何度も手戻りが出た。

構文チェック：

```bash
python3 -c "import re;js=re.findall(r'<script>(.*?)</script>',open('index.html').read(),re.S)[0];open('/tmp/x.js','w').write(js)"
node --check /tmp/x.js
```

実描画の確認（Playwright）。`python3 -m http.server 8000` で配信してから実行する。CDN に届かない環境では `npm install p5@1.9.4` してローカルの `p5.min.js` に差し替えたテスト用コピーで検証する（本体の CDN 参照は変えない）。

```python
# verify.py — 各UIの表示位置とJSエラーを、デスクトップ幅とスマホ幅で出す
from playwright.sync_api import sync_playwright
errors = []
with sync_playwright() as p:
    b = p.chromium.launch()
    for w, h in [(1400, 900), (390, 844)]:
        pg = b.new_page(viewport={"width": w, "height": h})
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto("http://localhost:8000/index.html")
        pg.wait_for_timeout(2000)
        print(w, h, pg.evaluate("""() => Object.fromEntries(
          ['#modeSwitch','#timeBar','#viewBar','#colorBar','#fsBtn','#infoBtn'].map(s => {
            const e = document.querySelector(s); if (!e) return [s, 'MISSING'];
            const r = e.getBoundingClientRect();
            return [s, `top=${Math.round(r.top)} left=${Math.round(r.left)} w=${Math.round(r.width)}`];
          }))"""))
        pg.close()
    b.close()
print("errors:", errors or "なし")
```

注意：画面分割の導入後、各UI（`#modeSwitch` など）は iframe の中にある。位置を調べるときは `hostPanes[i].frame.contentWindow.document` を見る（上の verify.py は親ページを見ているので、そのままでは全部 MISSING になる）。

確認する観点：全UIが画面内にあるか／要素同士やサークルと重なっていないか／モーダルの開閉と方式切替／フルスクリーン往復で崩れないか／デスクトップ幅⇄スマホ幅の往復。

色変換の数式に触れたら Node で数値検証する。目安：sRGB原色がxy三角形の頂点（0.64,0.33／0.30,0.60／0.15,0.06）に乗る、白とグレーが D65（0.3127,0.3290）に乗る、往復変換で元のRGBに戻る、白のOKLab L=1・CIELab L*=100。

## 作業ルール

- 返答・コードコメント・UI文言は**日本語**
- 色彩科学の正確さを優先し、用語を誤用しない（例：画素値基準グレーを「平均明度」と呼ばない——ガンマ込み符号値の平均で、輝度でも知覚明度でもない）
- 変更は小さく、1変更ごとに検証してからコミットする
- コミットメッセージは日本語。1行目に要約、本文に箇条書き
- `main` は公開中。壊れた状態で push しない

## 未着手・候補タスク

1. ~~PWA化＋Screen Wake Lock~~：実装済み（Chrome で取得・解放・取り直しを確認。iPhone／iPad 実機のホーム画面起動は未確認→2 で確認する）
2. iPad／スマホ実機でのレイアウト確認
3. 交照法（フリッカー測光）モード：輝度の一致と明るさの一致のずれ＝Helmholtz–Kohlrausch効果を体感させる
4. 区間ごとのイージング
5. 配色の JSON 保存／読込（学生への配布・課題提出用）
6. HDR時、xy色度図に「SDR表示」の注記
7. CIELab 定数を厳密値（216/24389、24389/27）へ（実害はL*で1e-4以下）
8. 「戻る」を色点の増減に耐えるようにする
10. 狭い画面で、HDR輝度スライダーが後から出ると色設定バーの高さが変わるのに `placeBars()` が呼ばれず、フルスクリーンボタンの位置が約26pxずれる（フルスクリーン往復で直る）
11. iOS のホーム画面起動で `viewport-fit=cover` にしてノッチ・ホームバーの領域まで光らせるか（セーフエリアのレイアウト調整が要る）
12. 簡略表示：高さの低い画面（横向きスマホなど）で「⋯」を開くとパネルがリングに重なりうる。分割中に共通バーが折り返す幅（約640px未満）の扱い
14. 境界グラデーション：隣の色は1フレーム遅れで届く（色が急に変わる瞬間は継ぎ目が一瞬ずれうる）。P3／sRGB 表示（CSS レンダラ）での実描画は未確認
13. 画面分割のフルスクリーン実遷移の確認（自動操作の Chrome では requestFullscreen が "not granted" で拒否され、UI の一斉出し入れまでしか確認できていない）
9. 残骸の整理：`topBar`（空div、`display:none`）、`modeBtns`、`modeLabels`（いずれも未使用）

## 参照

- OKLab 原典：https://bottosson.github.io/posts/oklab/
- OKLab 批評（CIELabの青の問題）：https://raphlinus.github.io/color/2021/01/18/oklab-critique.html
- CSS Color 4（無力色相）：https://www.w3.org/TR/css-color-4/
- Helmholtz–Kohlrausch効果：https://en.wikipedia.org/wiki/Helmholtz%E2%80%93Kohlrausch_effect
- 色の恒常性：https://en.wikipedia.org/wiki/Color_constancy
