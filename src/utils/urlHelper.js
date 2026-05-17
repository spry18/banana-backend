const getFullUrl = (req, path) => {
    if (!path) return path;
    if (path.startsWith('http://') || path.startsWith('https://')) {
        return path;
    }
    // Remove leading slash if any
    const cleanPath = path.startsWith('/') ? path.substring(1) : path;
    return `${req.protocol}://${req.get('host')}/${cleanPath}`;
};

module.exports = { getFullUrl };
