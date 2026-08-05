const SHARED_READY_EVENT = 'portalti:shared-ready';
const DEFAULT_TIMEOUT_MS = 10000;

export function getSharedApi(): PortalTiSharedApi {
  if (!window.portaltiShared) {
    throw new Error('portaltiShared no está disponible');
  }
  return window.portaltiShared;
}

export function waitForSharedApi(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<PortalTiSharedApi> {
  if (window.portaltiShared) {
    return Promise.resolve(window.portaltiShared);
  }

  return new Promise<PortalTiSharedApi>((resolve, reject) => {
    const startedAt = Date.now();

    const cleanup = () => {
      window.removeEventListener(SHARED_READY_EVENT, onReady);
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };

    const complete = () => {
      if (!window.portaltiShared) return;
      cleanup();
      resolve(window.portaltiShared);
    };

    const onReady = () => complete();

    const intervalId = window.setInterval(() => {
      if (window.portaltiShared) {
        complete();
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        cleanup();
        reject(new Error('portaltiShared no estuvo disponible a tiempo'));
      }
    }, 100);

    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error('portaltiShared no estuvo disponible a tiempo'));
    }, timeoutMs);

    window.addEventListener(SHARED_READY_EVENT, onReady, { once: true });
  });
}
