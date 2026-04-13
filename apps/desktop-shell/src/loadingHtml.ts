function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderLoadingHtml(title: string, message: string, detail?: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        --navy: #11243e;
        --navy-soft: #1b365d;
        --cream: #fdf8ef;
        --teal: #0f766e;
        --orange: #d96b1c;
        --muted: #5b6e86;
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        font-family: "Inter", "Segoe UI", sans-serif;
        color: var(--navy);
        background:
          radial-gradient(circle at top left, rgba(15, 118, 110, 0.18), transparent 30%),
          radial-gradient(circle at top right, rgba(217, 107, 28, 0.16), transparent 24%),
          linear-gradient(180deg, #fffdf8 0%, #f0eadf 100%);
      }

      .card {
        width: min(90vw, 620px);
        padding: 28px 26px;
        border-radius: 22px;
        border: 1px solid rgba(17, 36, 62, 0.12);
        background: rgba(255, 255, 255, 0.82);
        box-shadow: 0 18px 42px rgba(17, 36, 62, 0.14);
        backdrop-filter: blur(18px);
      }

      .eyebrow {
        display: inline-flex;
        align-items: center;
        min-height: 30px;
        padding: 0 12px;
        border-radius: 999px;
        background: rgba(15, 118, 110, 0.12);
        color: var(--teal);
        font-size: 0.76rem;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      h1 {
        margin: 14px 0 10px;
        font-size: clamp(1.65rem, 2.8vw, 2.7rem);
        line-height: 1.02;
      }

      p {
        margin: 0;
        color: var(--muted);
        line-height: 1.55;
        font-size: 0.96rem;
      }

      .detail {
        margin-top: 16px;
        padding: 12px 14px;
        border-radius: 16px;
        background: rgba(17, 36, 62, 0.06);
        color: var(--navy-soft);
        font-family: "JetBrains Mono", monospace;
        font-size: 0.85rem;
        line-height: 1.45;
        max-height: 180px;
        overflow: auto;
        word-break: break-word;
      }

      .spinner {
        display: inline-flex;
        width: 42px;
        height: 42px;
        margin-top: 20px;
        border-radius: 999px;
        border: 3px solid rgba(17, 36, 62, 0.12);
        border-top-color: var(--orange);
        animation: spin 900ms linear infinite;
      }

      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    </style>
  </head>
  <body>
    <main class="card">
      <span class="eyebrow">Adam Connect Desktop</span>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
      ${detail ? `<div class="detail">${escapeHtml(detail)}</div>` : ""}
      <span class="spinner" aria-hidden="true"></span>
    </main>
  </body>
</html>`;
}
