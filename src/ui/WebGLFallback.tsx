import type { WebGLInfo } from '../state/store';

export function WebGLFallback({ webgl }: { webgl: WebGLInfo }) {
  return (
    <main class="screen fallback" aria-labelledby="fallback-title">
      <div class="globe-emoji" aria-hidden="true">
        🌍
      </div>
      <h1 id="fallback-title">Your browser can't show the 3D globe</h1>
      <p class="screen-text">Don't worry! Here are some things a grown-up can try:</p>
      <ul class="tips">
        <li>🔄 Update your web browser to the newest version.</li>
        <li>⚙️ Turn on “hardware acceleration” in the browser settings.</li>
        <li>💻 Try a different computer, tablet or phone.</li>
      </ul>
      <details class="tech-details">
        <summary>Details for grown-ups</summary>
        <p>
          This app needs WebGL to draw the 3D globe, and it isn't available right now (detected
          WebGL version: {webgl.version}).
        </p>
        {webgl.reason && <p class="reason">{webgl.reason}</p>}
      </details>
    </main>
  );
}
