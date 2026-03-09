import { useState, useEffect } from 'react';
export function useModelInfo() {
    const [provider, setProvider] = useState(null);
    const [model, setModel] = useState(null);
    const [ollamaUrl, setOllamaUrl] = useState(null);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        let cancelled = false;
        fetch('/health')
            .then(res => res.json())
            .then(data => {
            if (cancelled)
                return;
            setProvider(data.provider ?? null);
            setModel(data.model ?? null);
            setOllamaUrl(data.ollamaUrl ?? null);
        })
            .catch(() => { })
            .finally(() => {
            if (!cancelled)
                setLoading(false);
        });
        return () => { cancelled = true; };
    }, []);
    return { provider, model, ollamaUrl, loading };
}
//# sourceMappingURL=useModelInfo.js.map