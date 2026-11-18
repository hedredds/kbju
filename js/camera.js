/* camera.js - getUserMedia wrapper for in-app photo capture with torch support. */
'use strict';

const Camera = (() => {
  let stream = null;
  let videoEl = null;
  let torchOn = false;

  async function open(videoElement) {
    videoEl = videoElement;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false
      });
      videoEl.srcObject = stream;
      await videoEl.play();
      return true;
    } catch (e) {
      console.error('Camera.open failed', e);
      throw new Error('Не удалось получить доступ к камере. Проверьте разрешения браузера.');
    }
  }

  function close() {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    if (videoEl) {
      videoEl.srcObject = null;
    }
    torchOn = false;
  }

  function hasTorchSupport() {
    if (!stream) return false;
    const track = stream.getVideoTracks()[0];
    if (!track) return false;
    const capabilities = track.getCapabilities ? track.getCapabilities() : {};
    return !!capabilities.torch;
  }

  async function toggleTorch() {
    if (!stream) return false;
    const track = stream.getVideoTracks()[0];
    if (!track) return false;
    try {
      torchOn = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: torchOn }] });
      return torchOn;
    } catch (e) {
      torchOn = !torchOn; // revert on failure
      console.warn('Torch not supported on this device', e);
      return torchOn;
    }
  }

  // Capture current video frame as a JPEG data URL.
  function capture(canvasElement) {
    if (!videoEl) throw new Error('Камера не инициализирована.');
    const canvas = canvasElement || document.createElement('canvas');
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.9);
  }

  function isSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  return { open, close, capture, isSupported, hasTorchSupport, toggleTorch };
})();
