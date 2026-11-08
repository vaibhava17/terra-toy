export function LoadingScreen() {
  return (
    <div class="screen loading" role="status" aria-live="polite">
      <div class="globe-emoji spin" aria-hidden="true">
        🌍
      </div>
      <p class="screen-text">Getting the globe ready…</p>
    </div>
  );
}
