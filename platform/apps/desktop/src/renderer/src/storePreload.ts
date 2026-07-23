const pendingImages = new Map<string, HTMLImageElement>();

export function warmImageUrls(urls: Array<string | undefined>, limit = 6): void {
  for (const url of urls.filter((value): value is string => Boolean(value)).slice(0, limit)) {
    if (pendingImages.has(url)) continue;
    const image = new Image();
    const release = () => pendingImages.delete(url);
    image.onload = release;
    image.onerror = release;
    image.decoding = "async";
    pendingImages.set(url, image);
    image.src = url;
  }
}
