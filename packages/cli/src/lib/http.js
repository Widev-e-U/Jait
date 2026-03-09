export const getJson = async (url) => {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Request failed (${response.status})`);
    }
    return (await response.json());
};
//# sourceMappingURL=http.js.map