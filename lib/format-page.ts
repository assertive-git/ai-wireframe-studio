import { format } from "prettier/standalone";
import * as htmlPlugin from "prettier/plugins/html";
import * as cssPlugin from "prettier/plugins/postcss";

export async function formatPageSource(html: string, css: string) {
  const options = { tabWidth: 2, useTabs: false, printWidth: 100 };
  const [formattedHtml, formattedCss] = await Promise.all([
    format(html, {
      ...options,
      parser: "html",
      plugins: [htmlPlugin],
      htmlWhitespaceSensitivity: "strict",
      embeddedLanguageFormatting: "off",
    }),
    format(css, { ...options, parser: "css", plugins: [cssPlugin] }),
  ]);
  return { html: formattedHtml, css: formattedCss };
}

// Formatting is optional: never discard a usable generation on a parser error.
export async function formatGeneratedSource(html: string, css: string) {
  try {
    return await formatPageSource(html, css);
  } catch {
    return { html, css };
  }
}
