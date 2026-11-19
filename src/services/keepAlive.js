let audioContext = null;
let oscillator = null;
let lockController = null;

function startAudioTrack() {
  try {
    const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContextClass) return;

    if (!audioContext) audioContext = new AudioContextClass();
    if (audioContext.state === 'suspended') audioContext.resume();

    if (!oscillator) {
      oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.frequency.setValueAtTime(1, audioContext.currentTime);
      gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start();
    }
  } catch {}
}

async function acquireWebLock() {
  if (!('locks' in navigator) || lockController) return;

  lockController = new AbortController();
  try {
    await navigator.locks.request(
      'trail_guardian_active_session',
      { mode: 'exclusive', signal: lockController.signal },
      () => new Promise(() => {}),
    );
  } catch {
    lockController = null;
  }
}

export function startBackgroundKeepAlive({ audioEnabled = true } = {}) {
  if (audioEnabled) startAudioTrack();
  acquireWebLock();
}

export function stopBackgroundKeepAlive() {
  if (oscillator) {
    try {
      oscillator.stop();
    } catch {}
    oscillator = null;
  }

  if (lockController) {
    lockController.abort();
    lockController = null;
  }
}
