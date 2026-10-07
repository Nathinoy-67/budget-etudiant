/**
 * Enregistre un fichier généré. Sur iPhone, la feuille de partage native permet
 * « Enregistrer dans Fichiers », AirDrop, mail… ; sinon, téléchargement classique.
 */
export async function saveFile(content: string, filename: string, mime: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const blob = new Blob([content], { type: mime });
  const file = new File([blob], filename, { type: mime });
  const isTouch = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
  if (isTouch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return 'shared';
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'cancelled';
      // sinon on retombe sur le téléchargement
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/** "budget-2026-10-07.json" */
export function datedFilename(prefix: string, ext: string, date: string): string {
  return `${prefix}-${date}.${ext}`;
}
