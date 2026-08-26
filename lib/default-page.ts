import type { GeneratedPage } from "./types";

export const fallbackPage: GeneratedPage = {
  note: "OpenAI未接続時のサンプル初校です。",
  sections: [
    { id: "header", title: "ヘッダー", description: "ロゴ・CTA" },
    { id: "hero", title: "ファーストビュー", description: "メイン訴求" },
    { id: "benefits", title: "賞・メリット", description: "主要な魅力" },
    { id: "cta", title: "応募CTA", description: "コンバージョン導線" },
  ],
  html: `<header class="lp-header" data-section-id="header">
  <strong>LOGO</strong><a href="#apply">応募する</a>
</header>
<section class="lp-hero" data-section-id="hero">
  <div><small>OFFICIAL CAMPAIGN</small><h1>伝わるLPの<br>ファーストビュー</h1><p>ヒアリング内容をもとに、訴求とCTAを整理した初校を生成します。</p><a class="lp-button" href="#apply">詳しく見る</a></div>
  <div class="lp-placeholder">MAIN VISUAL</div>
</section>
<section class="lp-benefits" data-section-id="benefits">
  <h2>この企画の魅力</h2><div class="lp-grid"><article><b>POINT 01</b><p>最重要訴求を明確に。</p></article><article><b>POINT 02</b><p>参考資料の意図を反映。</p></article><article><b>POINT 03</b><p>応募への不安を解消。</p></article></div>
</section>
<section class="lp-cta" id="apply" data-section-id="cta"><h2>まずはここから</h2><p>CTAと応募条件をわかりやすく配置します。</p><a class="lp-button" href="#">応募フォームへ</a></section>`,
  css: `.lp-header{height:72px;display:flex;align-items:center;justify-content:space-between;padding:0 40px;border-bottom:1px solid #e5e7eb}.lp-header a,.lp-button{display:inline-block;background:#1f4ed8;color:white;text-decoration:none;padding:12px 22px;border-radius:6px}.lp-hero{padding:64px 48px;display:grid;grid-template-columns:1.05fr .95fr;gap:40px;align-items:center;background:#f7f8fb}.lp-hero h1{font-size:48px;line-height:1.25;margin:12px 0}.lp-hero p{line-height:1.8;color:#536071}.lp-placeholder{height:320px;background:#e4e8ee;display:grid;place-items:center;border-radius:10px;color:#667085}.lp-benefits{padding:64px 48px;text-align:center}.lp-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:28px}.lp-grid article{border:1px solid #dfe3ea;padding:24px;border-radius:10px}.lp-cta{padding:64px 48px;text-align:center;background:#f0f4ff}@media(max-width:720px){.lp-hero,.lp-grid{grid-template-columns:1fr}.lp-hero{padding:38px 22px}.lp-hero h1{font-size:36px}}`,
};
