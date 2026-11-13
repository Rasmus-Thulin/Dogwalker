// Screen Wake Lock prevents idle dimming. Browsers cannot set Android brightness.
export function keepDisplayAwake({ navigator, document, window, onStatus }) {
    let lock = null;
    let pending = false;
    let stopped = false;
    const supported = window.isSecureContext && Boolean(navigator.wakeLock?.request);
    const report = message => onStatus?.(message);
    const request = async () => {
        if (stopped || !supported || document.visibilityState !== 'visible' || lock || pending) return;
        pending = true;
        try {
            const acquired = await navigator.wakeLock.request('screen');
            if (stopped || document.visibilityState !== 'visible') {
                await acquired.release();
                return;
            }
            lock = acquired;
            acquired.addEventListener('release', () => {
                if (lock === acquired) lock = null;
                report('Skärmlåset släpptes. Försöker igen när sidan är aktiv.');
            });
            report('Skärmen hålls vaken. Ljusstyrkan styrs i surfplattans inställningar.');
        } catch {
            report('Webbläsaren tillåter inte skärmlås just nu. Kontrollera energisparläget.');
        } finally {
            pending = false;
        }
    };
    const visibilityChanged = () => {
        if (document.visibilityState === 'visible') void request();
    };
    if (!supported) {
        report(window.isSecureContext
            ? 'Den här webbläsaren saknar stöd för att hålla skärmen vaken.'
            : 'Skärmlås kräver HTTPS när appen öppnas från surfplattan.');
        return () => {};
    }
    document.addEventListener('visibilitychange', visibilityChanged);
    document.addEventListener('pointerdown', request);
    document.addEventListener('fullscreenchange', request);
    window.addEventListener('focus', request);
    const timer = window.setInterval(request, 60000);
    void request();
    return () => {
        stopped = true;
        window.clearInterval(timer);
        document.removeEventListener('visibilitychange', visibilityChanged);
        document.removeEventListener('pointerdown', request);
        document.removeEventListener('fullscreenchange', request);
        window.removeEventListener('focus', request);
        void lock?.release();
    };
}

if (typeof document !== 'undefined') {
    keepDisplayAwake({ navigator, document, window, onStatus: message => {
        const status = document.getElementById('displayAwakeStatus');
        if (status) status.textContent = message;
    } });
}
